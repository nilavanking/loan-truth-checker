import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const comparison = await vite.ssrLoadModule("/app/comparison-engine.ts");
const truth = await vite.ssrLoadModule("/app/truth-engine.ts");

function readyQuote(id, name, changes = {}) {
  const quote = comparison.createEmptyQuote(id, 1);
  const emi = truth.reducingEmi(600000, 8.5, 60);
  return {
    ...quote, lenderName: name, sanctionedAmount: 600000, requestedAmount: 600000,
    netDisbursement: 600000, annualRate: 8.5, method: "reducing", rateType: "fixed",
    months: 60, instalments: 60, lenderEmi: emi, lenderApr: 8.5,
    lenderTotalInterest: emi * 60 - 600000, lenderTotalRepayment: emi * 60,
    kfs: truth.DEFAULT_KFS.map((item) => ({ ...item, status: "present" })),
    sanctionDate: "2026-02-01", prepaymentTermsKnown: true, partPrepaymentPercent: 2,
    foreclosurePercent: 2, penalChargesKnown: true, ...changes,
  };
}

function charge(quote, key, amount, treatment, requirement = "mandatory") {
  return { ...quote, charges: quote.charges.map((item) => item.key === key ? { ...item, amount, treatment, requirement } : item) };
}

test("identical loans tie instead of producing an artificial cost winner", () => {
  const result = comparison.compareFinanceQuotes([readyQuote("a", "Offer A"), readyQuote("b", "Offer B")], "actual", { amount: 600000, months: 60 });
  assert.deepEqual(new Set(result.awards.lowestApr), new Set(["a", "b"]));
  assert.deepEqual(new Set(result.awards.lowestLoanCost), new Set(["a", "b"]));
  assert.deepEqual(new Set(result.awards.bestOverall), new Set(["a", "b"]));
});

test("lower headline rate with high deducted fees can lose on true APR", () => {
  let lowRate = readyQuote("low", "Low rate", { annualRate: 8, lenderApr: 0, lenderEmi: truth.reducingEmi(600000, 8, 60), lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  lowRate = { ...charge(lowRate, "processing", 30000, "deducted"), netDisbursement: 570000 };
  const clean = readyQuote("clean", "Clean offer", { annualRate: 8.5 });
  const result = comparison.compareFinanceQuotes([lowRate, clean], "actual", { amount: 600000, months: 60 });
  assert.ok(result.audits.find((item) => item.quote.id === "low").trueApr > result.audits.find((item) => item.quote.id === "clean").trueApr);
  assert.deepEqual(result.awards.lowestApr, ["clean"]);
});

test("7 percent flat is normalized and not automatically cheaper than 8 percent reducing", () => {
  const flat = readyQuote("flat", "Flat lender", { annualRate: 7, method: "flat", lenderApr: 0, lenderEmi: truth.flatEmi(600000, 7, 60), lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  const reducing = readyQuote("reducing", "Reducing lender", { annualRate: 8, lenderApr: 0, lenderEmi: truth.reducingEmi(600000, 8, 60), lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  const result = comparison.compareFinanceQuotes([flat, reducing], "actual", { amount: 600000, months: 60 });
  assert.ok(result.audits[0].equivalentReducingRate > 12);
  assert.deepEqual(result.awards.lowestApr, ["reducing"]);
  assert.ok(result.findings.some((item) => item.title.includes("Low rate trap")));
});

test("different tenures block a direct overall winner and expose EMI distortion", () => {
  const short = readyQuote("short", "48 months", { months: 48, instalments: 48, lenderEmi: truth.reducingEmi(600000, 8.5, 48), lenderApr: 0, lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  const long = readyQuote("long", "72 months", { months: 72, instalments: 72, lenderEmi: truth.reducingEmi(600000, 8.5, 72), lenderApr: 0, lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  const result = comparison.compareFinanceQuotes([short, long], "actual", { amount: 600000, months: 60 });
  assert.equal(result.sameTenure, false);
  assert.deepEqual(result.awards.bestOverall, []);
  assert.ok(result.findings.some((item) => item.title.includes("Low EMI trap")));
});

test("different loan amounts are marked not directly comparable", () => {
  const small = readyQuote("small", "Small", { sanctionedAmount: 550000, requestedAmount: 550000, netDisbursement: 550000, lenderEmi: truth.reducingEmi(550000, 8.5, 60), lenderApr: 0, lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  const result = comparison.compareFinanceQuotes([small, readyQuote("standard", "Standard")], "actual", { amount: 600000, months: 60 });
  assert.equal(result.sameAmount, false);
  assert.equal(result.directlyComparable, false);
  assert.ok(result.findings.some((item) => item.title === "Not directly comparable"));
});

test("processing fee deducted upfront reduces proceeds and increases APR", () => {
  let quote = readyQuote("deducted", "Deducted", { lenderApr: 0 });
  quote = { ...charge(quote, "processing", 12000, "deducted"), netDisbursement: 588000 };
  const audit = comparison.auditFinanceQuote(quote);
  assert.equal(audit.netAvailable, 588000);
  assert.ok(audit.trueApr > quote.annualRate);
});

test("financed processing fee increases gross principal and repayment", () => {
  let quote = readyQuote("financed", "Financed", { lenderApr: 0, lenderEmi: 0, lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  quote = charge(quote, "processing", 12000, "financed");
  const audit = comparison.auditFinanceQuote(quote);
  assert.equal(audit.grossSanctioned, 612000);
  assert.ok(audit.calculatedEmi > truth.reducingEmi(600000, 8.5, 60));
});

test("financed insurance is included in cost and generates bundling warning", () => {
  let insured = readyQuote("insured", "Insured", { lenderApr: 0, lenderEmi: 0, lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  insured = charge(insured, "insurance", 18000, "financed", "unknown");
  const result = comparison.compareFinanceQuotes([insured, readyQuote("clean", "Clean")], "actual", { amount: 600000, months: 60 });
  assert.equal(result.audits[0].financedCharges, 18000);
  assert.ok(result.findings.some((item) => item.title.includes("Insurance bundling")));
});

test("wrong lender EMI is preserved and produces a STOP mismatch", () => {
  const audit = comparison.auditFinanceQuote(readyQuote("wrong", "Wrong EMI", { lenderEmi: 14000 }));
  assert.equal(audit.quotedEmi, 14000);
  assert.equal(audit.audit.emiMatch, false);
  assert.equal(audit.decisionLabel, "DO NOT SIGN YET");
});

test("missing disclosed APR stays missing while independent APR is calculated", () => {
  const quote = readyQuote("missing-apr", "Missing APR", { lenderApr: 0, kfs: truth.DEFAULT_KFS.map((item) => ({ ...item, status: item.key === "apr" ? "missing" : "present" })) });
  const audit = comparison.auditFinanceQuote(quote);
  assert.ok(audit.trueApr > 0);
  assert.equal(quote.lenderApr, 0);
  assert.ok(audit.questions.some((question) => question.includes("APR")));
});

test("missing prepayment terms remain not confirmed and are not ranked", () => {
  const result = comparison.compareFinanceQuotes([readyQuote("unknown", "Unknown", { prepaymentTermsKnown: false }), readyQuote("known", "Known")], "actual", { amount: 600000, months: 60 });
  assert.deepEqual(result.awards.bestPrepayment, []);
  assert.deepEqual(result.awards.bestOverall, []);
  assert.ok(result.actualAudits[0].questions.some((question) => question.includes("prepayment")));
});

test("lowest EMI and best overall can be different lenders", () => {
  const long = readyQuote("long", "Low EMI long term", { months: 72, instalments: 72, lenderEmi: truth.reducingEmi(600000, 9.5, 72), lenderApr: 0, lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  const efficient = readyQuote("efficient", "Efficient", { annualRate: 8, lenderApr: 0, lenderEmi: truth.reducingEmi(600000, 8, 60), lenderTotalInterest: 0, lenderTotalRepayment: 0 });
  const actual = comparison.compareFinanceQuotes([long, efficient], "actual", { amount: 600000, months: 60 });
  const normalized = comparison.compareFinanceQuotes([long, efficient], "normalized", { amount: 600000, months: 60 });
  assert.deepEqual(actual.awards.lowestEmi, ["long"]);
  assert.deepEqual(normalized.awards.bestOverall, ["efficient"]);
});

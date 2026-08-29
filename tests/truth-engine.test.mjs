import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const engine = await vite.ssrLoadModule("/app/truth-engine.ts");
const presentKfs = engine.DEFAULT_KFS.map((item) => ({ ...item, status: "present" }));
const base = { vehiclePrice: 700000, downPayment: 100000, exchangeValue: 0, baseLoanAmount: 600000, annualRate: 8.5, method: "reducing", rateType: "fixed", months: 60, charges: [], kfs: presentKfs };

test("standard monthly reducing EMI and multiple tenures are reproducible", () => {
  assert.ok(Math.abs(engine.reducingEmi(600000, 8.5, 60) - 12309.91) < 0.02);
  assert.ok(engine.reducingEmi(600000, 8.5, 36) > engine.reducingEmi(600000, 8.5, 60));
  assert.equal(engine.reducingEmi(600000, 0, 60), 10000);
});

test("flat rate is exposed and exactly converted to an approximate reducing rate", () => {
  const result = engine.auditLoan({ ...base, annualRate: 6.5, method: "flat" });
  assert.ok(Math.abs(result.calculatedEmi - 13250) < 0.01);
  assert.ok(result.equivalentReducingRate > 11.5 && result.equivalentReducingRate < 11.9);
  assert.ok(result.flatExtraCost > 89000);
  assert.ok(result.findings.some((item) => item.title.includes("flat is not")));
});

test("deducted fees and multiple upfront charges increase true APR", () => {
  const result = engine.auditLoan({ ...base, charges: [
    { key: "processing", label: "Processing", amount: 12000, treatment: "deducted" },
    { key: "gst", label: "GST", amount: 2160, treatment: "deducted" },
    { key: "advance", label: "Advance EMI", amount: 12310, treatment: "upfront" },
  ] });
  assert.equal(result.netAvailable, 585840);
  assert.ok(result.apr > base.annualRate);
  assert.equal(result.deductedCharges, 14160);
  assert.equal(result.upfrontCharges, 12310);
  assert.ok(Math.abs(result.trueBorrowingCost - (result.totalInterest + 14160 + 12310)) < 0.01);
});

test("financed processing fee and insurance increase gross sanctioned principal", () => {
  const result = engine.auditLoan({ ...base, charges: [
    { key: "processing", label: "Processing", amount: 12000, treatment: "financed" },
    { key: "insurance", label: "Insurance", amount: 18000, treatment: "financed" },
  ] });
  assert.equal(result.grossSanctioned, 630000);
  assert.equal(result.financedCharges, 30000);
  assert.ok(result.calculatedEmi > engine.reducingEmi(600000, 8.5, 60));
});

test("correct lender figures pass within rounding tolerance", () => {
  const emi = engine.reducingEmi(600000, 8.5, 60);
  const result = engine.auditLoan({ ...base, lenderEmi: Math.round(emi), lenderTotalRepayment: Math.round(emi) * 60, lenderTotalInterest: Math.round(emi) * 60 - 600000, lenderApr: 8.5 });
  assert.equal(result.emiMatch, true);
  assert.equal(result.repaymentMatch, true);
  assert.equal(result.interestMatch, true);
  assert.equal(result.aprMatch, true);
});

test("wrong EMI, repayment, interest and APR produce STOP findings", () => {
  const result = engine.auditLoan({ ...base, lenderEmi: 14000, lenderTotalRepayment: 700000, lenderTotalInterest: 50000, lenderApr: 7 });
  assert.equal(result.decision, "do-not-sign");
  assert.ok(result.findings.filter((item) => item.severity === "stop").length >= 4);
});

test("missing APR and conflicting rate disclosure reduce KFS score", () => {
  const kfs = presentKfs.map((item) => item.key === "apr" ? { ...item, status: "missing" } : item.key === "interestRate" ? { ...item, status: "conflicting" } : item);
  const result = engine.auditLoan({ ...base, kfs });
  assert.ok(result.kfsCompleteness < 100);
  assert.equal(result.decision, "do-not-sign");
  assert.ok(result.findings.some((item) => item.title.includes("conflicting")));
});

test("fixed, floating and hybrid prepayment classifications remain conditional", () => {
  const common = { borrowerType: "individual", purpose: "personal", sanctionDate: "2026-02-01", chargeKnown: false };
  assert.equal(engine.determinePrepaymentRule({ ...common, rateType: "floating" }).level, "no-charge");
  assert.equal(engine.determinePrepaymentRule({ ...common, rateType: "fixed" }).level, "contract");
  assert.equal(engine.determinePrepaymentRule({ ...common, rateType: "hybrid" }).level, "contract");
  assert.equal(engine.determinePrepaymentRule({ ...common, rateType: "unknown", purpose: "unknown" }).level, "insufficient");
});

test("quoted charge on protected floating loan is flagged as potential conflict", () => {
  const result = engine.determinePrepaymentRule({ rateType: "floating", borrowerType: "individual", purpose: "personal", sanctionDate: "2026-02-01", chargeKnown: true, contractualPercent: 5 });
  assert.equal(result.level, "conflict");
});

test("part prepayment and full foreclosure calculations reconcile", () => {
  const result = engine.prepaymentMath(600000, 8.5, 60, 12, 100000, 2, 0);
  assert.ok(result.balance > 490000 && result.balance < 510000);
  assert.ok(result.remainingMonths < 48);
  assert.ok(result.interestSaved > 0);
  assert.ok(Math.abs(result.foreclosureSettlement - result.balance * 1.02) < 0.01);
});

import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const engine = await vite.ssrLoadModule("/loan-engine/index.ts");

test("canonical EMI covers zero interest and common tenures", () => {
  assert.equal(engine.reducingEmi(600000, 0, 60), 10000);
  assert.equal(engine.reducingEmi(600000, 0, 1), 600000);
  assert.ok(engine.reducingEmi(600000, 8.5, 12) > engine.reducingEmi(600000, 8.5, 60));
  assert.ok(engine.reducingEmi(600000, 8.5, 360) > 0);
});

test("IRR and XIRR reproduce an equal monthly loan", () => {
  const emi = engine.reducingEmi(600000, 8.5, 60);
  const apr = engine.solveApr(600000, Array(60).fill(emi));
  assert.ok(Math.abs(apr.nominalApr - 8.5) < 0.001);
  const flows = engine.buildRegularCashFlows(600000, emi, 60, "2026-01-01", "2026-02-01");
  const annual = engine.xirr(flows);
  assert.ok(annual > 0.087 && annual < 0.09);
});

test("deducted fees and irregular first payment increase XIRR cost", () => {
  const emi = engine.reducingEmi(600000, 8.5, 60);
  const clean = engine.xirr(engine.buildRegularCashFlows(600000, emi, 60, "2026-01-01", "2026-02-01"));
  const fee = engine.xirr(engine.buildRegularCashFlows(588000, emi, 60, "2026-01-01", "2026-02-01"));
  const delayed = engine.xirr(engine.buildRegularCashFlows(588000, emi, 60, "2026-01-01", "2026-02-20"));
  assert.ok(fee > clean);
  assert.ok(Number.isFinite(delayed));
});

test("unknown charge is not silently treated as a confirmed zero", () => {
  const summary = engine.summarizeCharges([
    { key: "unknown", label: "Unknown fee", amount: 5000, treatment: "unknown", state: "unknown" },
    { key: "zero", label: "Waived fee", amount: 0, treatment: "not-applicable", state: "confirmed-zero" },
  ]);
  assert.equal(summary.totalKnown, 0);
  assert.equal(summary.unknown.length, 1);
});

test("advance instalment can be represented once in dated cash flows", () => {
  const flows = engine.buildRegularCashFlows(588000, 12000, 59, "2026-01-01", "2026-02-01");
  flows.push({ date: "2026-01-01", amount: 12000, direction: "borrower-pays", type: "advance-emi", description: "First EMI", state: "confirmed" });
  assert.equal(flows.filter((flow) => flow.type === "advance-emi").length, 1);
  assert.equal(flows.filter((flow) => flow.type === "emi").length, 59);
  assert.ok(engine.xirr(flows) > 0);
});

test("broken-period interest respects explicit day-count conventions", () => {
  const a365 = engine.brokenPeriodInterest(600000, 10, "2026-01-01", "2026-02-05", "actual-365");
  const a360 = engine.brokenPeriodInterest(600000, 10, "2026-01-01", "2026-02-05", "actual-360");
  assert.equal(a365.days, 35);
  assert.ok(a360.interest > a365.interest);
  assert.equal(engine.brokenPeriodInterest(600000, 10, "2026-01-01", "2026-02-05", "unknown").estimated, true);
});

test("part-prepayment returns both borrower choices", () => {
  const result = engine.prepaymentOptions(600000, 8.5, 60, 12, 100000, 2);
  assert.equal(result.keepEmi.emi, result.originalEmi);
  assert.ok(result.keepEmi.monthsSaved > 0);
  assert.ok(result.keepTenure.emi < result.originalEmi);
  assert.ok(result.keepEmi.interestSaved > 0 && result.keepTenure.interestSaved > 0);
});

test("foreclosure includes settlement-date interest, fee and tax", () => {
  const result = engine.foreclosureEstimate(400000, 9, "2026-08-01", "2026-08-16", 2, 0, 18, 0, 500);
  assert.equal(result.days, 15);
  assert.ok(result.accruedInterest > 0);
  assert.equal(result.fee, 8000);
  assert.equal(result.tax, 1440);
  assert.ok(result.estimatedSettlement > 409940);
});

test("floating reset supports keep-EMI and keep-tenure outcomes", () => {
  const keepEmi = engine.floatingRateReset(600000, 8, 60, [{ afterPayment: 12, annualRate: 10 }], "keep-emi");
  const keepTenure = engine.floatingRateReset(600000, 8, 60, [{ afterPayment: 12, annualRate: 10 }], "keep-tenure");
  assert.ok(keepEmi.revisedMonths > 60);
  assert.ok(keepTenure.revisedEmi > keepTenure.originalEmi);
  assert.equal(keepTenure.revisedMonths, 60);
});

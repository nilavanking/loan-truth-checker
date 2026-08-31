import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());

const money = await vite.ssrLoadModule("/lib/money.ts");
const schemas = await vite.ssrLoadModule("/lib/schemas.ts");

test("Dinero boundary preserves paise before display rounding", () => {
  assert.equal(money.sumInr([0.1, 0.2, 100.005]), 100.31);
  assert.equal(money.differenceInr(1000.10, 999.99), 0.11);
  assert.match(money.formatInr(611000), /6,11,000/);
  assert.match(money.formatInr(1234.5, 2), /1,234\.50/);
});

test("calculator schema blocks unsafe or impossible inputs", () => {
  assert.equal(schemas.loanInputSchema.safeParse({ principal: "611000", rate: "6.5", months: "60" }).success, true);
  assert.equal(schemas.loanInputSchema.safeParse({ principal: "0", rate: "6.5", months: "60" }).success, false);
  assert.equal(schemas.loanInputSchema.safeParse({ principal: "611000", rate: "101", months: "60" }).success, false);
  assert.equal(schemas.loanInputSchema.safeParse({ principal: "611000", rate: "6.5", months: "60.5" }).success, false);
});

test("professional data components load from the shared component layer", async () => {
  const schedule = await vite.ssrLoadModule("/components/loan/amortization-table.tsx");
  const matrix = await vite.ssrLoadModule("/components/loan/financier-matrix-table.tsx");
  const charts = await vite.ssrLoadModule("/components/loan/amortization-visuals.tsx");
  assert.equal(typeof schedule.AmortizationTable, "function");
  assert.equal(typeof matrix.FinancierMatrixTable, "function");
  assert.equal(typeof charts.AmortizationVisuals, "function");
});

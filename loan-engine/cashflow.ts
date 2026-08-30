import type { CashFlow } from "./types";

export function signedAmount(flow: CashFlow) {
  return flow.direction === "borrower-receives" ? Math.abs(flow.amount) : -Math.abs(flow.amount);
}

export function addMonths(date: Date, months: number) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function buildRegularCashFlows(netProceeds: number, payment: number, count: number, startDate = "2026-01-01", firstPaymentDate?: string): CashFlow[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const first = firstPaymentDate ? new Date(`${firstPaymentDate}T00:00:00Z`) : addMonths(start, 1);
  const flows: CashFlow[] = [{ date: startDate, amount: netProceeds, direction: "borrower-receives", type: "disbursement", description: "Effective loan proceeds", state: "derived" }];
  for (let index = 0; index < count; index += 1) {
    flows.push({ date: addMonths(first, index).toISOString().slice(0, 10), amount: payment, direction: "borrower-pays", type: "emi", description: `Instalment ${index + 1}`, state: "derived" });
  }
  return flows;
}

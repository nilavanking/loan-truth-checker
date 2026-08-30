import { signedAmount } from "./cashflow";
import type { CashFlow } from "./types";

function bisect(fn: (rate: number) => number, low: number, high: number) {
  let left = low;
  let right = high;
  let leftValue = fn(left);
  if (leftValue === 0) return left;
  for (let index = 0; index < 240; index += 1) {
    const mid = (left + right) / 2;
    const value = fn(mid);
    if (!Number.isFinite(value)) { right = mid; continue; }
    if (Math.abs(value) < 1e-11) return mid;
    if (Math.sign(value) === Math.sign(leftValue)) { left = mid; leftValue = value; }
    else right = mid;
  }
  return (left + right) / 2;
}

export function irr(values: number[]) {
  if (!values.some((value) => value > 0) || !values.some((value) => value < 0)) return null;
  const npv = (rate: number) => values.reduce((sum, value, index) => sum + value / (1 + rate) ** index, 0);
  let high = 1;
  const low = -0.999;
  while (Math.sign(npv(low)) === Math.sign(npv(high)) && high < 1e6) high *= 2;
  if (Math.sign(npv(low)) === Math.sign(npv(high))) return null;
  return bisect(npv, low, high);
}

export function xirr(flows: CashFlow[]) {
  const usable = flows.filter((flow) => flow.amount > 0 && !Number.isNaN(new Date(`${flow.date}T00:00:00Z`).getTime()));
  if (!usable.some((flow) => signedAmount(flow) > 0) || !usable.some((flow) => signedAmount(flow) < 0)) return null;
  const epoch = Math.min(...usable.map((flow) => new Date(`${flow.date}T00:00:00Z`).getTime()));
  const npv = (rate: number) => usable.reduce((sum, flow) => {
    const days = (new Date(`${flow.date}T00:00:00Z`).getTime() - epoch) / 86400000;
    return sum + signedAmount(flow) / (1 + rate) ** (days / 365);
  }, 0);
  let high = 1;
  const low = -0.999;
  while (Math.sign(npv(low)) === Math.sign(npv(high)) && high < 1e6) high *= 2;
  if (Math.sign(npv(low)) === Math.sign(npv(high))) return null;
  return bisect(npv, low, high);
}

export function solveApr(netProceeds: number, payments: number[]) {
  const periodic = irr([netProceeds, ...payments.map((payment) => -Math.abs(payment))]);
  if (periodic === null) return { nominalApr: 0, effectiveAnnualRate: 0, monthlyRate: 0 };
  return { monthlyRate: periodic, nominalApr: periodic * 1200, effectiveAnnualRate: ((1 + periodic) ** 12 - 1) * 100 };
}

export type DayCountBasis = "actual-365" | "actual-366" | "actual-360" | "lender-stated" | "unknown";

export function brokenPeriodInterest(principal: number, annualRate: number, interestStartDate: string, firstPaymentDate: string, basis: DayCountBasis, lenderDenominator?: number) {
  const start = new Date(`${interestStartDate}T00:00:00Z`);
  const end = new Date(`${firstPaymentDate}T00:00:00Z`);
  const days = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000)) : 0;
  const denominator = basis === "actual-360" ? 360 : basis === "actual-366" ? 366 : basis === "lender-stated" && lenderDenominator ? lenderDenominator : 365;
  const estimated = basis === "unknown" || (basis === "lender-stated" && !lenderDenominator);
  return { days, denominator, interest: principal * annualRate / 100 * days / denominator, estimated };
}

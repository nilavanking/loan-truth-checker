export function reducingEmi(principal: number, annualRate: number, months: number) {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(months) || principal <= 0 || months <= 0) return 0;
  const monthlyRate = annualRate / 1200;
  if (Math.abs(monthlyRate) < 1e-15) return principal / months;
  const growth = (1 + monthlyRate) ** months;
  return principal * monthlyRate * growth / (growth - 1);
}

export function flatEmi(principal: number, annualRate: number, months: number) {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(months) || principal <= 0 || months <= 0) return 0;
  return (principal + principal * annualRate / 100 * months / 12) / months;
}

export function calculateEmi(principal: number, annualRate: number, months: number, method: "reducing" | "flat") {
  return method === "flat" ? flatEmi(principal, annualRate, months) : reducingEmi(principal, annualRate, months);
}

export function solveReducingRate(principal: number, payment: number, months: number) {
  if (principal <= 0 || payment <= 0 || months <= 0 || payment * months <= principal) return 0;
  let low = 0;
  let high = 500;
  for (let index = 0; index < 160; index += 1) {
    const mid = (low + high) / 2;
    if (reducingEmi(principal, mid, months) < payment) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

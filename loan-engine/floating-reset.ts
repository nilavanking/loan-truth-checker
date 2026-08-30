import { reducingEmi } from "./emi";

export type RateReset = { afterPayment: number; annualRate: number };

function balanceAfterPayments(principal: number, annualRate: number, emi: number, count: number) {
  let balance = principal;
  const rate = annualRate / 1200;
  for (let period = 0; period < count && balance > 0.005; period += 1) {
    const interest = balance * rate;
    balance = Math.max(0, balance - Math.max(0, emi - interest));
  }
  return balance;
}

export function floatingRateReset(principal: number, originalRate: number, originalMonths: number, events: RateReset[], mode: "keep-emi" | "keep-tenure") {
  const originalEmi = reducingEmi(principal, originalRate, originalMonths);
  let balance = principal;
  let rate = originalRate;
  let emi = originalEmi;
  let elapsed = 0;
  let interest = 0;
  const ordered = [...events].filter((event) => event.afterPayment >= 0).sort((a, b) => a.afterPayment - b.afterPayment);
  for (const event of [...ordered, { afterPayment: originalMonths, annualRate: rate }]) {
    const payments = Math.max(0, Math.min(originalMonths, event.afterPayment) - elapsed);
    const before = balance;
    balance = balanceAfterPayments(balance, rate, emi, payments);
    interest += Math.max(0, emi * payments - (before - balance));
    elapsed += payments;
    if (elapsed >= originalMonths || balance <= 0.005) break;
    rate = event.annualRate;
    if (mode === "keep-tenure") emi = reducingEmi(balance, rate, originalMonths - elapsed);
  }
  let revisedMonths = elapsed;
  if (balance > 0.005 && mode === "keep-emi") {
    const monthlyRate = rate / 1200;
    const extra = monthlyRate === 0 ? Math.ceil(balance / emi) : emi <= balance * monthlyRate ? Infinity : Math.ceil(-Math.log(1 - balance * monthlyRate / emi) / Math.log(1 + monthlyRate));
    revisedMonths += extra;
    if (Number.isFinite(extra)) interest += Math.max(0, emi * extra - balance);
  }
  return { originalEmi, revisedEmi: emi, revisedMonths, totalInterest: interest, balance, latestRate: rate };
}

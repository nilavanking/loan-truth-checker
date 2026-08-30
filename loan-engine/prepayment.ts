import { reducingEmi } from "./emi";
import { reducingSchedule } from "./schedule";

export function prepaymentOptions(principal: number, annualRate: number, months: number, afterPayments: number, partPayment: number, chargePercent = 0, fixedCharge = 0) {
  const originalEmi = reducingEmi(principal, annualRate, months);
  const original = reducingSchedule(principal, annualRate, months, originalEmi);
  const paid = Math.min(Math.max(0, Math.round(afterPayments)), original.length);
  const balance = paid ? original[paid - 1].closing : principal;
  const remainingOriginal = original.slice(paid);
  const originalFutureInterest = remainingOriginal.reduce((sum, row) => sum + row.interest, 0);
  const payment = Math.min(balance, Math.max(0, partPayment));
  const charge = payment * chargePercent / 100 + fixedCharge;
  const newBalance = Math.max(0, balance - payment);
  const remainingTerm = Math.max(0, months - paid);
  const sameTenureEmi = remainingTerm ? reducingEmi(newBalance, annualRate, remainingTerm) : 0;
  const sameTenureSchedule = reducingSchedule(newBalance, annualRate, remainingTerm, sameTenureEmi);
  const sameTenureInterest = sameTenureSchedule.reduce((sum, row) => sum + row.interest, 0);
  const sameEmiSchedule = reducingSchedule(newBalance, annualRate, 1200, originalEmi);
  const sameEmiInterest = sameEmiSchedule.reduce((sum, row) => sum + row.interest, 0);
  return {
    originalEmi, balance, partPayment: payment, charge, newBalance,
    keepEmi: { emi: originalEmi, months: sameEmiSchedule.length, monthsSaved: Math.max(0, remainingTerm - sameEmiSchedule.length), futureInterest: sameEmiInterest, interestSaved: Math.max(0, originalFutureInterest - sameEmiInterest), netBenefit: Math.max(0, originalFutureInterest - sameEmiInterest) - charge },
    keepTenure: { emi: sameTenureEmi, months: remainingTerm, monthsSaved: 0, futureInterest: sameTenureInterest, interestSaved: Math.max(0, originalFutureInterest - sameTenureInterest), netBenefit: Math.max(0, originalFutureInterest - sameTenureInterest) - charge },
    originalFutureInterest,
  };
}

export function foreclosureEstimate(outstandingPrincipal: number, annualRate: number, lastEmiDate: string, settlementDate: string, chargePercent = 0, fixedCharge = 0, taxPercent = 0, unpaidInstalments = 0, otherCharges = 0) {
  const start = new Date(`${lastEmiDate}T00:00:00Z`);
  const end = new Date(`${settlementDate}T00:00:00Z`);
  const days = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000)) : 0;
  const accruedInterest = outstandingPrincipal * annualRate / 100 * days / 365;
  const fee = outstandingPrincipal * chargePercent / 100 + fixedCharge;
  const tax = fee * taxPercent / 100;
  return { outstandingPrincipal, days, accruedInterest, fee, tax, unpaidInstalments, otherCharges, estimatedSettlement: outstandingPrincipal + accruedInterest + fee + tax + unpaidInstalments + otherCharges };
}

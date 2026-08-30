import { reducingEmi } from "./emi";
import type { ScheduleRow } from "./types";

export function reducingSchedule(principal: number, annualRate: number, months: number, payment = reducingEmi(principal, annualRate, months)): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const monthlyRate = annualRate / 1200;
  let balance = Math.max(0, principal);
  for (let period = 1; period <= months && balance > 0.000001; period += 1) {
    const opening = balance;
    const interest = opening * monthlyRate;
    const due = period === months ? opening + interest : Math.min(payment, opening + interest);
    const principalPaid = Math.max(0, due - interest);
    balance = Math.max(0, opening - principalPaid);
    rows.push({ period, opening, payment: due, interest, principal: principalPaid, closing: balance });
  }
  return rows;
}

export type InterestMethod = "reducing" | "flat" | "unknown";
export type RateType = "fixed" | "floating" | "hybrid" | "unknown";
export type ValueState = "confirmed" | "extracted" | "derived" | "estimated" | "unknown";
export type AmountState = "confirmed-zero" | "confirmed-amount" | "unknown" | "not-applicable";
export type ChargeTreatment = "financed" | "deducted" | "upfront" | "not-applicable" | "unknown";
export type CashFlowDirection = "borrower-receives" | "borrower-pays";
export type CashFlowType =
  | "disbursement" | "emi" | "fee" | "tax" | "insurance" | "advance-emi"
  | "broken-period-interest" | "part-prepayment" | "foreclosure" | "balloon"
  | "refund" | "other";

export type CashFlow = {
  date: string;
  amount: number;
  direction: CashFlowDirection;
  type: CashFlowType;
  description: string;
  state: ValueState;
  source?: string;
};

export type Charge = {
  key: string;
  label: string;
  amount: number;
  treatment: ChargeTreatment;
  state?: AmountState;
};

export type ScheduleRow = {
  period: number;
  opening: number;
  payment: number;
  interest: number;
  principal: number;
  closing: number;
};

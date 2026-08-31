import { z } from "zod";

const numericText = (label: string, minimum: number, maximum: number) => z.string()
  .min(1, `${label} is required`)
  .refine((value) => Number.isFinite(Number(value)), `${label} must be a number`)
  .refine((value) => Number(value) >= minimum, `${label} must be at least ${minimum}`)
  .refine((value) => Number(value) <= maximum, `${label} must not exceed ${maximum}`);

export const loanInputSchema = z.object({
  principal: numericText("Loan amount", 1, 1_000_000_000),
  rate: numericText("Annual rate", 0, 100),
  months: numericText("Tenure", 1, 600).refine((value) => Number.isInteger(Number(value)), "Tenure must be a whole number of months"),
});

export type LoanInputFormValues = z.infer<typeof loanInputSchema>;

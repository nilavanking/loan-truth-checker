import type { Charge } from "./types";

export function summarizeCharges(charges: Charge[]) {
  const known = charges.filter((charge) => charge.state !== "unknown" && charge.treatment !== "unknown");
  const total = (treatment: Charge["treatment"]) => known.filter((charge) => charge.treatment === treatment).reduce((sum, charge) => sum + Math.max(0, charge.amount), 0);
  return {
    financed: total("financed"),
    deducted: total("deducted"),
    upfront: total("upfront"),
    totalKnown: known.filter((charge) => charge.treatment !== "not-applicable").reduce((sum, charge) => sum + Math.max(0, charge.amount), 0),
    unknown: charges.filter((charge) => charge.state === "unknown" || charge.treatment === "unknown"),
  };
}

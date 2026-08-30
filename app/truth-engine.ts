import {
  addMonths,
  buildRegularCashFlows,
  flatEmi,
  prepaymentOptions,
  reducingEmi,
  solveApr,
  solveReducingRate,
  xirr,
} from "@/loan-engine";
import type { CashFlow } from "@/loan-engine";
import type { RateType as EngineRateType } from "@/loan-engine";
import { REGULATORY_SOURCES } from "@/lib/regulatory-sources";

export type InterestMethod = "reducing" | "flat";
export type RateType = EngineRateType;
export type ChargeTreatment = "financed" | "deducted" | "upfront" | "not-applicable" | "unknown";
export type KfsStatus = "present" | "unclear" | "missing" | "conflicting";
export type Severity = "pass" | "information" | "verify" | "warning" | "stop";

export type ChargeInput = {
  key: string;
  label: string;
  amount: number;
  treatment: ChargeTreatment;
};

export type KfsItem = { key: string; label: string; critical: boolean; status: KfsStatus };

export type LoanAuditInput = {
  vehiclePrice: number;
  downPayment: number;
  exchangeValue: number;
  baseLoanAmount: number;
  annualRate: number;
  method: InterestMethod;
  rateType: RateType;
  months: number;
  lenderEmi?: number;
  lenderApr?: number;
  lenderNetDisbursement?: number;
  lenderTotalInterest?: number;
  lenderTotalRepayment?: number;
  charges: ChargeInput[];
  kfs: KfsItem[];
  disbursementDate?: string;
  firstPaymentDate?: string;
  cashFlows?: CashFlow[];
  advanceEmiTreatment?: "first-emi-deducted" | "first-emi-upfront" | "additional-charge" | "unknown";
};

export type Finding = {
  severity: Severity;
  title: string;
  detail: string;
  why: string;
  ask?: string;
};

export const KFS_TEMPLATE: Omit<KfsItem, "status">[] = [
  ["borrowerName", "Borrower name", true], ["loanAmount", "Loan / sanctioned amount", true],
  ["proposalReference", "Proposal / account reference", false],
  ["netDisbursement", "Net disbursement", true], ["interestRate", "Interest rate", true],
  ["rateType", "Fixed / floating / hybrid", true], ["interestMethod", "Interest calculation method", true],
  ["tenure", "Loan tenure", true], ["emi", "EMI", true], ["instalments", "Number of instalments", true],
  ["apr", "APR", true], ["aprSheet", "APR calculation sheet", true], ["processingFee", "Processing fee", true], ["documentation", "Documentation charges", false],
  ["insurance", "Insurance treatment", false], ["thirdParty", "Third-party charges", false],
  ["taxes", "GST / taxes", false], ["otherFees", "Other fees", false],
  ["schedule", "Amortisation schedule", true], ["totalInterest", "Total interest", true], ["totalRepayment", "Total repayment", true],
  ["prepayment", "Part-prepayment conditions", true], ["foreclosure", "Foreclosure conditions", true],
  ["penal", "Penal charges", true], ["latePayment", "Late-payment charges", false],
  ["issueDate", "KFS issue date", true], ["validity", "KFS validity period", false],
  ["acknowledgement", "Borrower acknowledgement", false], ["thirdPartyReceipts", "Third-party receipts", false],
].map(([key, label, critical]) => ({ key: String(key), label: String(label), critical: Boolean(critical) }));

export const DEFAULT_KFS: KfsItem[] = KFS_TEMPLATE.map((item) => ({ ...item, status: "missing" }));

export { reducingEmi, flatEmi, solveReducingRate, solveApr };

function moneyRound(value: number) { return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100; }
function closeEnough(actual: number | undefined, expected: number, tolerance: number) {
  return actual !== undefined && actual > 0 ? Math.abs(actual - expected) <= tolerance : null;
}

export function auditLoan(input: LoanAuditInput) {
  const months = Math.max(1, Math.round(input.months));
  const advanceEmi = input.charges.find((item) => item.key === "advanceEmi");
  const advanceCountsAsInstalment = input.advanceEmiTreatment === "first-emi-deducted" || input.advanceEmiTreatment === "first-emi-upfront";
  const feeCharges = advanceCountsAsInstalment ? input.charges.filter((item) => item.key !== "advanceEmi") : input.charges;
  const unknownCharges = feeCharges.filter((item) => item.treatment === "unknown");
  const financedCharges = feeCharges.filter((item) => item.treatment === "financed").reduce((sum, item) => sum + item.amount, 0);
  const deductedCharges = feeCharges.filter((item) => item.treatment === "deducted").reduce((sum, item) => sum + item.amount, 0) + (input.advanceEmiTreatment === "first-emi-deducted" ? advanceEmi?.amount || 0 : 0);
  const upfrontCharges = feeCharges.filter((item) => item.treatment === "upfront").reduce((sum, item) => sum + item.amount, 0);
  const allCharges = feeCharges.filter((item) => !["not-applicable", "unknown"].includes(item.treatment)).reduce((sum, item) => sum + item.amount, 0);
  const grossSanctioned = input.baseLoanAmount + financedCharges;
  const derivedNetAvailable = Math.max(0, input.baseLoanAmount - deductedCharges);
  const netAvailable = input.lenderNetDisbursement && input.lenderNetDisbursement > 0 ? input.lenderNetDisbursement : derivedNetAvailable;
  const effectiveProceeds = Math.max(0, netAvailable - upfrontCharges);
  const calculatedEmi = input.method === "flat" ? flatEmi(grossSanctioned, input.annualRate, months) : reducingEmi(grossSanctioned, input.annualRate, months);
  const remainingInstalments = advanceCountsAsInstalment ? Math.max(0, months - 1) : months;
  const advancePayment = advanceCountsAsInstalment ? advanceEmi?.amount || calculatedEmi : 0;
  const totalEmiPayments = calculatedEmi * remainingInstalments + advancePayment;
  const totalInterest = totalEmiPayments - grossSanctioned;
  const totalRepayment = totalEmiPayments + upfrontCharges;
  const trueBorrowingCost = totalEmiPayments - effectiveProceeds;
  const aprProceeds = input.advanceEmiTreatment === "first-emi-upfront" ? Math.max(0, effectiveProceeds - advancePayment) : effectiveProceeds;
  const apr = solveApr(aprProceeds, Array(remainingInstalments).fill(calculatedEmi));
  const disbursementDate = input.disbursementDate || "2026-01-01";
  const remainingFirstPaymentDate = input.firstPaymentDate || (advanceCountsAsInstalment ? addMonths(new Date(`${disbursementDate}T00:00:00Z`), 2).toISOString().slice(0, 10) : undefined);
  const regularFlows = buildRegularCashFlows(netAvailable, calculatedEmi, remainingInstalments, disbursementDate, remainingFirstPaymentDate);
  if (upfrontCharges > 0) regularFlows.push({ date: input.disbursementDate || "2026-01-01", amount: upfrontCharges, direction: "borrower-pays", type: "fee", description: "Upfront charges", state: "derived" });
  if (input.advanceEmiTreatment === "first-emi-upfront" && advancePayment > 0) regularFlows.push({ date: input.disbursementDate || "2026-01-01", amount: advancePayment, direction: "borrower-pays", type: "advance-emi", description: "First EMI paid in advance", state: "derived" });
  const cashFlows = input.cashFlows?.length ? input.cashFlows : regularFlows;
  const xirrRate = xirr(cashFlows);
  const equivalentReducingRate = input.method === "flat" ? solveReducingRate(grossSanctioned, calculatedEmi, months) : input.annualRate;
  const sameNumberReducingEmi = reducingEmi(grossSanctioned, input.annualRate, months);
  const sameNumberReducingTotal = sameNumberReducingEmi * months;
  const emiTolerance = Math.max(2, calculatedEmi * 0.0005);
  const totalTolerance = Math.max(5, calculatedEmi * 0.01);
  const emiMatch = closeEnough(input.lenderEmi, calculatedEmi, emiTolerance);
  const repaymentMatch = closeEnough(input.lenderTotalRepayment, (input.lenderEmi || calculatedEmi) * months, totalTolerance);
  const interestMatch = closeEnough(input.lenderTotalInterest, (input.lenderEmi || calculatedEmi) * months - grossSanctioned, totalTolerance);
  const aprMatch = input.lenderApr && input.lenderApr > 0 ? Math.abs(input.lenderApr - apr.nominalApr) <= 0.1 : null;
  const netDisbursementMatch = input.lenderNetDisbursement && input.lenderNetDisbursement > 0 ? Math.abs(input.lenderNetDisbursement - derivedNetAvailable) <= 5 : null;
  const kfsPresent = input.kfs.filter((item) => item.status === "present").length;
  const kfsConflicting = input.kfs.filter((item) => item.status === "conflicting");
  const kfsMissing = input.kfs.filter((item) => item.status === "missing");
  const criticalMissing = input.kfs.filter((item) => item.critical && item.status !== "present");
  const kfsCompleteness = input.kfs.length ? Math.round(kfsPresent / input.kfs.length * 100) : 0;
  const findings: Finding[] = [];

  if (emiMatch === false) findings.push({ severity: "stop", title: "Quoted EMI does not match", detail: `The lender EMI differs from the independently calculated EMI by ₹${Math.abs((input.lenderEmi || 0) - calculatedEmi).toFixed(2)} per month.`, why: "Principal, rate, method and tenure should reproduce the quoted EMI within a small rounding tolerance.", ask: "Please provide the lender formula and a corrected amortisation schedule." });
  else if (emiMatch === true) findings.push({ severity: "pass", title: "Quoted EMI mathematically matches", detail: "The entered lender EMI is within the permitted rounding tolerance.", why: "The same principal, interest method, rate and tenure reproduce the lender payment." });
  else findings.push({ severity: "verify", title: "Lender EMI not entered", detail: "The app can calculate an EMI but cannot compare it with the offer.", why: "A quotation audit needs the exact lender EMI.", ask: "Please state the exact EMI in writing." });

  if (input.method === "flat") findings.push({ severity: "warning", title: `${input.annualRate.toFixed(2)}% flat is not ${input.annualRate.toFixed(2)}% reducing`, detail: `The flat payment is approximately equivalent to ${equivalentReducingRate.toFixed(2)}% nominal reducing balance.`, why: "Flat interest continues to use the original principal even after repayments reduce the balance.", ask: "Please confirm in the KFS whether the rate is flat or reducing balance." });
  if (apr.nominalApr > input.annualRate + 0.1) findings.push({ severity: "warning", title: "True APR is higher than the quoted rate", detail: `Quoted rate ${input.annualRate.toFixed(2)}%; calculated APR ${apr.nominalApr.toFixed(2)}%; difference +${(apr.nominalApr - input.annualRate).toFixed(2)} percentage points.`, why: `₹${moneyRound(financedCharges + deductedCharges + upfrontCharges).toLocaleString("en-IN")} of financed or upfront charges increase repayment or reduce effective proceeds.`, ask: "Please provide the APR computation sheet and itemised deductions." });
  if (repaymentMatch === false) findings.push({ severity: "stop", title: "Total repayment mismatch", detail: "Lender total repayment does not equal EMI multiplied by the number of instalments within tolerance.", why: "A difference may indicate a balloon payment, advance instalment, fee, or an incorrect disclosure.", ask: "Please reconcile every payment in the repayment schedule." });
  if (interestMatch === false) findings.push({ severity: "stop", title: "Disclosed interest mismatch", detail: "The disclosed interest does not reconcile with total instalments minus gross principal.", why: "Total interest should be reproducible from the payment schedule.", ask: "Please provide a corrected total-interest figure." });
  if (aprMatch === false) findings.push({ severity: "stop", title: "APR mismatch", detail: `Lender APR ${input.lenderApr?.toFixed(2)}%; independently calculated APR ${apr.nominalApr.toFixed(2)}%.`, why: "APR must reflect the loan's actual cash flows and compulsory charges.", ask: "Please provide the lender APR formula and corrected KFS." });
  if (netDisbursementMatch === false) findings.push({ severity: "warning", title: "Net disbursement does not reconcile", detail: `Lender net disbursement ₹${moneyRound(input.lenderNetDisbursement || 0).toLocaleString("en-IN")}; itemised calculation ₹${moneyRound(derivedNetAvailable).toLocaleString("en-IN")}.`, why: "The sanctioned amount minus disclosed deductions should reproduce the amount actually made available.", ask: "Please provide an itemised disbursement statement explaining the difference." });
  if (unknownCharges.some((item) => item.amount > 0)) findings.push({ severity: "verify", title: "Charge treatment is unknown", detail: unknownCharges.filter((item) => item.amount > 0).map((item) => item.label).join(", "), why: "A charge cannot be applied reliably to principal, disbursement or APR until it is classified as financed, deducted, paid upfront, or not applicable.", ask: "Please confirm how each listed charge is collected." });
  if ((advanceEmi?.amount || 0) > 0 && (!input.advanceEmiTreatment || input.advanceEmiTreatment === "unknown")) findings.push({ severity: "verify", title: "Advance EMI meaning is unknown", detail: "The amount could be the first instalment, a disbursement deduction, a separately paid instalment, or an additional charge.", why: "Treating an advance EMI incorrectly can double-count a payment and distort APR.", ask: "Please confirm whether the advance EMI counts as one of the disclosed instalments and how it is collected." });
  if (kfsConflicting.length) findings.push({ severity: "stop", title: "KFS contains conflicting information", detail: kfsConflicting.map((item) => item.label).join(", "), why: "Conflicting written terms prevent a safe signing decision.", ask: "Please issue one corrected KFS with consistent figures." });
  if (criticalMissing.length) findings.push({ severity: "warning", title: "Critical KFS information is not verified", detail: criticalMissing.map((item) => item.label).join(", "), why: "The signing decision cannot be based only on the EMI; cost, remedies and conditions must also be disclosed.", ask: `Please provide: ${criticalMissing.map((item) => item.label).join(", ")}.` });

  const componentScores = {
    mathematicalConsistency: emiMatch === true && repaymentMatch !== false && interestMatch !== false ? 10 : emiMatch === false || repaymentMatch === false || interestMatch === false ? 0 : 4,
    aprTransparency: input.kfs.find((item) => item.key === "apr")?.status === "present" && aprMatch !== false ? 10 : input.lenderApr ? 6 : 0,
    feeTransparency: unknownCharges.some((item) => item.amount > 0) ? 0 : 10,
    kfsCompleteness: Math.round(kfsCompleteness / 10),
    methodClarity: input.kfs.find((item) => item.key === "interestMethod")?.status === "present" ? 10 : 0,
    prepaymentTransparency: input.kfs.find((item) => item.key === "prepayment")?.status === "present" ? 10 : 0,
    penalTransparency: input.kfs.find((item) => item.key === "penal")?.status === "present" ? 10 : 0,
    netDisbursementClarity: input.kfs.find((item) => item.key === "netDisbursement")?.status === "present" ? 10 : 0,
    amortisationAvailability: input.kfs.find((item) => item.key === "schedule")?.status === "present" ? 10 : 0,
    totalRepaymentClarity: input.kfs.find((item) => item.key === "totalRepayment")?.status === "present" && repaymentMatch !== false ? 10 : 0,
  };
  const truthScore = Object.values(componentScores).reduce((sum, value) => sum + value, 0);
  const evidenceChecks = [
    input.baseLoanAmount > 0,
    input.annualRate >= 0,
    input.months > 0,
    Boolean(input.method),
    input.kfs.find((item) => item.key === "apr")?.status === "present",
    input.kfs.find((item) => item.key === "netDisbursement")?.status === "present",
    input.kfs.find((item) => item.key === "schedule")?.status === "present",
    input.kfs.find((item) => item.key === "prepayment")?.status === "present",
    input.kfs.find((item) => item.key === "penal")?.status === "present",
    unknownCharges.length === 0,
  ];
  const evidenceConfidence = Math.round(evidenceChecks.filter(Boolean).length / evidenceChecks.length * 100);
  const hasStop = findings.some((item) => item.severity === "stop");
  const decision = hasStop ? "do-not-sign" : criticalMissing.length || unknownCharges.some((item) => item.amount > 0) || findings.some((item) => ["warning", "verify"].includes(item.severity)) ? "verify" : "ready";

  return {
    grossSanctioned, netAvailable, derivedNetAvailable, effectiveProceeds, financedCharges, deductedCharges, upfrontCharges,
    totalFees: allCharges, calculatedEmi, totalEmiPayments, totalInterest, totalRepayment, trueBorrowingCost,
    nominalRate: input.annualRate, apr: apr.nominalApr, effectiveAnnualRate: apr.effectiveAnnualRate,
    xirrApr: xirrRate === null ? 0 : xirrRate * 100, cashFlows, advancePayment, remainingInstalments,
    equivalentReducingRate, sameNumberReducingEmi, sameNumberReducingTotal,
    flatExtraCost: input.method === "flat" ? totalEmiPayments - sameNumberReducingTotal : 0,
    emiMatch, repaymentMatch, interestMatch, aprMatch, netDisbursementMatch, kfsCompleteness, kfsMissing, criticalMissing,
    findings, componentScores, truthScore, evidenceConfidence, unknownCharges, decision,
  };
}

export type PrepaymentInput = {
  rateType: RateType;
  borrowerType: "individual" | "business" | "other";
  purpose: "personal" | "business" | "unknown";
  sanctionDate: string;
  contractualPercent?: number;
  contractualFixed?: number;
  chargeKnown: boolean;
};

export function determinePrepaymentRule(input: PrepaymentInput) {
  const effectiveDate = "2026-01-01";
  if (!input.sanctionDate || input.rateType === "unknown" || input.purpose === "unknown") return { level: "insufficient", title: "Insufficient information", detail: "Not enough information to determine this safely." };
  if (input.sanctionDate >= effectiveDate && input.rateType === "floating" && input.borrowerType === "individual" && input.purpose === "personal") {
    const conflict = input.chargeKnown && ((input.contractualPercent || 0) > 0 || (input.contractualFixed || 0) > 0);
    return conflict
      ? { level: "conflict", title: "Potential conflict between quoted charge and applicable rule", detail: "For this post-1 January 2026 floating-rate individual non-business loan, a quoted prepayment charge requires written legal justification." }
      : { level: "no-charge", title: "No prepayment charge indicated under applicable rule", detail: "The entered facts match the protected floating-rate individual non-business category for loans sanctioned or renewed on or after 1 January 2026." };
  }
  if (input.rateType === "hybrid") return { level: "contract", title: "Contract terms and rate phase must be checked", detail: "A hybrid loan may be fixed during one period and floating during another. Confirm which phase applies on the prepayment date." };
  return { level: "contract", title: "Contract terms must be checked", detail: "The entered facts do not establish a universal no-charge outcome. Use the written loan agreement and current RBI directions." };
}

export function prepaymentMath(principal: number, annualRate: number, months: number, afterPayments: number, partPayment: number, chargePercent = 0, fixedCharge = 0) {
  const options = prepaymentOptions(principal, annualRate, months, afterPayments, partPayment, chargePercent, fixedCharge);
  const foreclosureCharge = options.balance * chargePercent / 100 + fixedCharge;
  return {
    emi: options.originalEmi,
    balance: options.balance,
    partPayment: options.partPayment,
    partPaymentCharge: options.charge,
    remainingMonths: options.keepEmi.months,
    interestSaved: options.keepEmi.interestSaved,
    netPartPaymentBenefit: options.keepEmi.netBenefit,
    keepEmi: options.keepEmi,
    keepTenure: options.keepTenure,
    foreclosureSettlement: options.balance + foreclosureCharge,
    foreclosureCharge,
    foreclosureInterestAvoided: options.originalFutureInterest,
    netForeclosureBenefit: options.originalFutureInterest - foreclosureCharge,
  };
}

export const RULES = REGULATORY_SOURCES;

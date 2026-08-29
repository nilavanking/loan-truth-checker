export type InterestMethod = "reducing" | "flat";
export type RateType = "fixed" | "floating" | "hybrid" | "unknown";
export type ChargeTreatment = "financed" | "deducted" | "upfront" | "not-applicable";
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
  ["netDisbursement", "Net disbursement", true], ["interestRate", "Interest rate", true],
  ["rateType", "Fixed / floating / hybrid", true], ["interestMethod", "Interest calculation method", true],
  ["tenure", "Loan tenure", true], ["emi", "EMI", true], ["instalments", "Number of instalments", true],
  ["apr", "APR", true], ["processingFee", "Processing fee", true], ["documentation", "Documentation charges", false],
  ["insurance", "Insurance treatment", false], ["thirdParty", "Third-party charges", false],
  ["taxes", "GST / taxes", false], ["otherFees", "Other fees", false],
  ["schedule", "Amortisation schedule", true], ["totalRepayment", "Total repayment", true],
  ["prepayment", "Part-prepayment conditions", true], ["foreclosure", "Foreclosure conditions", true],
  ["penal", "Penal charges", true], ["latePayment", "Late-payment charges", false],
  ["issueDate", "KFS issue date", true], ["validity", "KFS validity period", false],
].map(([key, label, critical]) => ({ key: String(key), label: String(label), critical: Boolean(critical) }));

export const DEFAULT_KFS: KfsItem[] = KFS_TEMPLATE.map((item) => ({ ...item, status: "missing" }));

export function reducingEmi(principal: number, annualRate: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const monthly = annualRate / 1200;
  if (!monthly) return principal / months;
  const growth = (1 + monthly) ** months;
  return principal * monthly * growth / (growth - 1);
}

export function flatEmi(principal: number, annualRate: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  return (principal + principal * annualRate / 100 * months / 12) / months;
}

export function solveReducingRate(principal: number, payment: number, months: number) {
  if (principal <= 0 || payment <= 0 || months <= 0 || payment * months <= principal) return 0;
  let low = 0, high = 500;
  for (let index = 0; index < 140; index += 1) {
    const mid = (low + high) / 2;
    if (reducingEmi(principal, mid, months) < payment) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export function solveApr(netProceeds: number, payments: number[]) {
  if (netProceeds <= 0 || !payments.length || payments.reduce((sum, value) => sum + value, 0) <= netProceeds) {
    return { nominalApr: 0, effectiveAnnualRate: 0, monthlyRate: 0 };
  }
  const pv = (monthlyRate: number) => payments.reduce((sum, payment, index) => sum + payment / (1 + monthlyRate) ** (index + 1), 0);
  let low = 0, high = 5;
  for (let index = 0; index < 180; index += 1) {
    const mid = (low + high) / 2;
    if (pv(mid) > netProceeds) low = mid; else high = mid;
  }
  const monthlyRate = (low + high) / 2;
  return { monthlyRate, nominalApr: monthlyRate * 1200, effectiveAnnualRate: ((1 + monthlyRate) ** 12 - 1) * 100 };
}

function moneyRound(value: number) { return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100; }
function closeEnough(actual: number | undefined, expected: number, tolerance: number) {
  return actual !== undefined && actual > 0 ? Math.abs(actual - expected) <= tolerance : null;
}

export function auditLoan(input: LoanAuditInput) {
  const months = Math.max(1, Math.round(input.months));
  const financedCharges = input.charges.filter((item) => item.treatment === "financed").reduce((sum, item) => sum + item.amount, 0);
  const deductedCharges = input.charges.filter((item) => item.treatment === "deducted").reduce((sum, item) => sum + item.amount, 0);
  const upfrontCharges = input.charges.filter((item) => item.treatment === "upfront").reduce((sum, item) => sum + item.amount, 0);
  const allCharges = input.charges.filter((item) => item.treatment !== "not-applicable").reduce((sum, item) => sum + item.amount, 0);
  const grossSanctioned = input.baseLoanAmount + financedCharges;
  const derivedNetAvailable = Math.max(0, input.baseLoanAmount - deductedCharges);
  const netAvailable = input.lenderNetDisbursement && input.lenderNetDisbursement > 0 ? input.lenderNetDisbursement : derivedNetAvailable;
  const effectiveProceeds = Math.max(0, netAvailable - upfrontCharges);
  const calculatedEmi = input.method === "flat" ? flatEmi(grossSanctioned, input.annualRate, months) : reducingEmi(grossSanctioned, input.annualRate, months);
  const totalEmiPayments = calculatedEmi * months;
  const totalInterest = totalEmiPayments - grossSanctioned;
  const totalRepayment = totalEmiPayments + upfrontCharges;
  const trueBorrowingCost = totalEmiPayments - effectiveProceeds;
  const apr = solveApr(effectiveProceeds, Array(months).fill(calculatedEmi));
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
  if (kfsConflicting.length) findings.push({ severity: "stop", title: "KFS contains conflicting information", detail: kfsConflicting.map((item) => item.label).join(", "), why: "Conflicting written terms prevent a safe signing decision.", ask: "Please issue one corrected KFS with consistent figures." });
  if (criticalMissing.length) findings.push({ severity: "warning", title: "Critical KFS information is not verified", detail: criticalMissing.map((item) => item.label).join(", "), why: "The signing decision cannot be based only on the EMI; cost, remedies and conditions must also be disclosed.", ask: `Please provide: ${criticalMissing.map((item) => item.label).join(", ")}.` });

  const componentScores = {
    mathematicalConsistency: emiMatch === true && repaymentMatch !== false && interestMatch !== false ? 10 : emiMatch === false || repaymentMatch === false || interestMatch === false ? 0 : 4,
    aprTransparency: input.kfs.find((item) => item.key === "apr")?.status === "present" && aprMatch !== false ? 10 : input.lenderApr ? 6 : 0,
    feeTransparency: input.charges.every((item) => item.amount === 0 || item.treatment !== "not-applicable") ? 10 : 3,
    kfsCompleteness: Math.round(kfsCompleteness / 10),
    methodClarity: input.kfs.find((item) => item.key === "interestMethod")?.status === "present" ? 10 : 0,
    prepaymentTransparency: input.kfs.find((item) => item.key === "prepayment")?.status === "present" ? 10 : 0,
    penalTransparency: input.kfs.find((item) => item.key === "penal")?.status === "present" ? 10 : 0,
    netDisbursementClarity: input.kfs.find((item) => item.key === "netDisbursement")?.status === "present" ? 10 : 0,
    amortisationAvailability: input.kfs.find((item) => item.key === "schedule")?.status === "present" ? 10 : 0,
    totalRepaymentClarity: input.kfs.find((item) => item.key === "totalRepayment")?.status === "present" && repaymentMatch !== false ? 10 : 0,
  };
  const truthScore = Object.values(componentScores).reduce((sum, value) => sum + value, 0);
  const hasStop = findings.some((item) => item.severity === "stop");
  const decision = hasStop ? "do-not-sign" : criticalMissing.length || findings.some((item) => ["warning", "verify"].includes(item.severity)) ? "verify" : "ready";

  return {
    grossSanctioned, netAvailable, derivedNetAvailable, effectiveProceeds, financedCharges, deductedCharges, upfrontCharges,
    totalFees: allCharges, calculatedEmi, totalEmiPayments, totalInterest, totalRepayment, trueBorrowingCost,
    nominalRate: input.annualRate, apr: apr.nominalApr, effectiveAnnualRate: apr.effectiveAnnualRate,
    equivalentReducingRate, sameNumberReducingEmi, sameNumberReducingTotal,
    flatExtraCost: input.method === "flat" ? totalEmiPayments - sameNumberReducingTotal : 0,
    emiMatch, repaymentMatch, interestMatch, aprMatch, netDisbursementMatch, kfsCompleteness, kfsMissing, criticalMissing,
    findings, componentScores, truthScore, decision,
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
  const emi = reducingEmi(principal, annualRate, months);
  const monthlyRate = annualRate / 1200;
  const paid = Math.min(Math.max(0, Math.round(afterPayments)), months);
  let scheduleBalance = principal;
  let balance = principal;
  let originalRemainingInterest = 0;
  for (let month = 1; month <= months; month += 1) {
    const interest = scheduleBalance * monthlyRate;
    const principalPaid = month === months ? scheduleBalance : Math.min(scheduleBalance, emi - interest);
    if (month > paid) originalRemainingInterest += interest;
    scheduleBalance = Math.max(0, scheduleBalance - principalPaid);
    if (month === paid) balance = scheduleBalance;
  }
  const payment = Math.min(balance, Math.max(0, partPayment));
  const charge = payment * chargePercent / 100 + fixedCharge;
  let newBalance = Math.max(0, balance - payment);
  let remainingMonths = 0, remainingInterest = 0;
  while (newBalance > 0.005 && remainingMonths < 1200) {
    const interest = newBalance * monthlyRate;
    const principalPaid = Math.min(newBalance, emi - interest);
    if (principalPaid <= 0) { remainingMonths = Infinity; remainingInterest = Infinity; break; }
    remainingInterest += interest; newBalance -= principalPaid; remainingMonths += 1;
  }
  const interestSaved = Number.isFinite(remainingInterest) ? Math.max(0, originalRemainingInterest - remainingInterest) : -Infinity;
  const foreclosureCharge = balance * chargePercent / 100 + fixedCharge;
  return {
    emi, balance, partPayment: payment, partPaymentCharge: charge, remainingMonths,
    interestSaved, netPartPaymentBenefit: interestSaved - charge,
    foreclosureSettlement: balance + foreclosureCharge,
    foreclosureCharge, foreclosureInterestAvoided: originalRemainingInterest,
    netForeclosureBenefit: originalRemainingInterest - foreclosureCharge,
  };
}

export const RULES = [
  { title: "Key Facts Statement for Loans & Advances", authority: "Reserve Bank of India", publicationDate: "15 Apr 2024", effectiveDate: "01 Oct 2024", status: "IN FORCE", source: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12550", lastChecked: "29 Aug 2026", explanation: "Retail and MSME term-loan KFS disclosures include APR, charges and an amortisation schedule." },
  { title: "Pre-payment Charges on Loans Directions, 2025", authority: "Reserve Bank of India", publicationDate: "02 Jul 2025", effectiveDate: "01 Jan 2026", status: "IN FORCE", source: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12888&Mode=0", lastChecked: "29 Aug 2026", explanation: "Applicability depends on sanction/renewal date, rate type, borrower, purpose and regulated-entity category." },
  { title: "Individual lender fees and foreclosure terms", authority: "The selected lender", publicationDate: "Varies", effectiveDate: "Contract-specific", status: "LENDER POLICY", source: "Use the lender's current KFS, sanction letter and agreement", lastChecked: "At signing", explanation: "A lender policy is not an RBI rule and must be checked against the applicable regulation and signed contract." },
] as const;

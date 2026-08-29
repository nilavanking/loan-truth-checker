import {
  auditLoan,
  ChargeInput,
  ChargeTreatment,
  DEFAULT_KFS,
  determinePrepaymentRule,
  InterestMethod,
  KfsItem,
  RateType,
  solveApr,
} from "@/app/truth-engine";

export type QuoteMethod = InterestMethod | "unknown";
export type ChargeRequirement = "mandatory" | "optional" | "unknown";
export type QuoteCharge = ChargeInput & { id: string; requirement: ChargeRequirement };

export type FinanceQuote = {
  id: string;
  lenderName: string;
  quoteReference: string;
  quoteDate: string;
  notes: string;
  requestedAmount: number;
  sanctionedAmount: number;
  netDisbursement: number;
  downPayment: number;
  months: number;
  instalments: number;
  lenderEmi: number;
  annualRate: number;
  method: QuoteMethod;
  rateType: RateType;
  lenderApr: number;
  lenderTotalInterest: number;
  lenderTotalRepayment: number;
  charges: QuoteCharge[];
  kfs: KfsItem[];
  sanctionDate: string;
  borrowerType: "individual" | "business" | "other";
  purpose: "personal" | "business" | "unknown";
  prepaymentTermsKnown: boolean;
  partPrepaymentPercent: number;
  foreclosurePercent: number;
  lockInMonths: number;
  penalChargesKnown: boolean;
};

export type ComparisonMode = "actual" | "normalized";
export type ComparisonBasis = { amount: number; months: number };
export type ComparisonSeverity = "pass" | "information" | "verify" | "warning" | "stop";
export type ComparisonFinding = { severity: ComparisonSeverity; title: string; detail: string; why: string };

const decisionLabel = (decision: "ready" | "verify" | "do-not-sign") =>
  decision === "ready" ? "READY TO CONSIDER" : decision === "verify" ? "VERIFY BEFORE PROCEEDING" : "DO NOT SIGN YET";

function sums(charges: QuoteCharge[]) {
  const sum = (treatment: ChargeTreatment) => charges.filter((charge) => charge.treatment === treatment).reduce((total, charge) => total + Math.max(0, charge.amount), 0);
  return {
    financed: sum("financed"),
    deducted: sum("deducted"),
    upfront: sum("upfront"),
    all: charges.filter((charge) => charge.treatment !== "not-applicable").reduce((total, charge) => total + Math.max(0, charge.amount), 0),
    compulsory: charges.filter((charge) => charge.requirement === "mandatory" && charge.treatment !== "not-applicable").reduce((total, charge) => total + Math.max(0, charge.amount), 0),
  };
}

function missingQuestions(quote: FinanceQuote) {
  const questions: string[] = [];
  if (!quote.annualRate) questions.push("Please confirm the annual interest rate in writing.");
  if (quote.method === "unknown") questions.push("Please confirm whether the interest method is flat or reducing balance.");
  if (quote.rateType === "unknown") questions.push("Please confirm whether the rate is fixed, floating or hybrid.");
  if (!quote.lenderEmi) questions.push("Please provide the exact EMI and number of instalments.");
  if (!quote.netDisbursement) questions.push("Please provide the net disbursement after every deduction.");
  if (!quote.lenderApr) questions.push("Please provide the APR and its computation sheet from the KFS.");
  if (!quote.prepaymentTermsKnown) questions.push("Please provide the written part-prepayment, foreclosure and lock-in conditions.");
  if (!quote.penalChargesKnown) questions.push("Please provide the penal and late-payment charge schedule.");
  for (const item of quote.kfs.filter((entry) => entry.critical && entry.status !== "present")) {
    const question = `Please provide or clarify the KFS item: ${item.label}.`;
    if (!questions.includes(question)) questions.push(question);
  }
  for (const charge of quote.charges.filter((entry) => entry.amount > 0 && entry.requirement === "unknown")) {
    questions.push(`Please confirm whether ${charge.label} is compulsory or optional.`);
  }
  return questions;
}

export function auditFinanceQuote(quote: FinanceQuote, basis?: ComparisonBasis) {
  const normalized = Boolean(basis);
  const amount = Math.max(0, normalized ? basis!.amount : quote.sanctionedAmount);
  const months = Math.max(1, Math.round(normalized ? basis!.months : (quote.instalments || quote.months)));
  const charges = sums(quote.charges);
  const grossSanctioned = amount + charges.financed;
  const derivedNet = Math.max(0, amount - charges.deducted);
  const netAvailable = normalized ? derivedNet : (quote.netDisbursement > 0 ? quote.netDisbursement : derivedNet);
  const effectiveProceeds = Math.max(0, netAvailable - charges.upfront);
  const methodKnown = quote.method !== "unknown";
  const audit = methodKnown && amount > 0 && months > 0 ? auditLoan({
    vehiclePrice: amount + quote.downPayment,
    downPayment: quote.downPayment,
    exchangeValue: 0,
    baseLoanAmount: amount,
    annualRate: quote.annualRate,
    method: quote.method as InterestMethod,
    rateType: quote.rateType,
    months,
    lenderEmi: normalized ? undefined : quote.lenderEmi || undefined,
    lenderApr: normalized ? undefined : quote.lenderApr || undefined,
    lenderNetDisbursement: normalized ? undefined : quote.netDisbursement || undefined,
    lenderTotalInterest: normalized ? undefined : quote.lenderTotalInterest || undefined,
    lenderTotalRepayment: normalized ? undefined : quote.lenderTotalRepayment || undefined,
    charges: quote.charges.map(({ key, label, amount: chargeAmount, treatment }) => ({ key, label, amount: chargeAmount, treatment })),
    kfs: quote.kfs,
  }) : null;

  const payment = audit?.calculatedEmi || quote.lenderEmi || 0;
  const totalInstalments = payment * months;
  const aprResult = audit ? { nominalApr: audit.apr, effectiveAnnualRate: audit.effectiveAnnualRate } : solveApr(effectiveProceeds, payment ? Array(months).fill(payment) : []);
  const totalInterest = audit?.totalInterest ?? Math.max(0, totalInstalments - grossSanctioned);
  const totalRepayment = audit?.totalRepayment ?? totalInstalments + charges.upfront;
  const totalLoanCost = totalInterest + charges.all;
  const trueBorrowingCost = totalInstalments - effectiveProceeds;
  const costPerLakh = effectiveProceeds > 0 ? trueBorrowingCost / effectiveProceeds * 100000 : 0;
  const prepayment = determinePrepaymentRule({
    rateType: quote.rateType,
    borrowerType: quote.borrowerType,
    purpose: quote.purpose,
    sanctionDate: quote.sanctionDate,
    chargeKnown: quote.prepaymentTermsKnown,
    contractualPercent: Math.max(quote.partPrepaymentPercent, quote.foreclosurePercent),
  });
  const missingCritical = amount <= 0 || quote.annualRate <= 0 || months <= 0 || !methodKnown || (!normalized && quote.lenderEmi <= 0);
  const decision: "ready" | "verify" | "do-not-sign" = missingCritical || audit?.decision === "do-not-sign"
    ? "do-not-sign"
    : audit?.decision === "ready" && quote.prepaymentTermsKnown && quote.penalChargesKnown
      ? "ready"
      : "verify";

  return {
    quote,
    normalized,
    amount,
    months,
    audit,
    methodKnown,
    grossSanctioned,
    netAvailable,
    effectiveProceeds,
    calculatedEmi: audit?.calculatedEmi || 0,
    comparisonEmi: payment,
    quotedEmi: quote.lenderEmi,
    emiDifference: audit && quote.lenderEmi ? quote.lenderEmi - audit.calculatedEmi : 0,
    totalInstalments,
    totalInterest,
    totalRepayment,
    totalCharges: charges.all,
    compulsoryCharges: charges.compulsory,
    financedCharges: charges.financed,
    upfrontCharges: charges.upfront + charges.deducted,
    totalLoanCost,
    trueBorrowingCost,
    trueApr: aprResult.nominalApr,
    effectiveAnnualRate: aprResult.effectiveAnnualRate,
    costPerLakh,
    equivalentReducingRate: audit?.equivalentReducingRate || 0,
    kfsCompleteness: audit?.kfsCompleteness ?? Math.round(quote.kfs.filter((item) => item.status === "present").length / Math.max(1, quote.kfs.length) * 100),
    prepayment,
    prepaymentConfirmed: quote.prepaymentTermsKnown,
    questions: missingQuestions(quote),
    decision,
    decisionLabel: decisionLabel(decision),
    eligibleForOverall: !missingCritical && Boolean(aprResult.nominalApr) && Boolean(quote.netDisbursement)
      && quote.prepaymentTermsKnown && quote.penalChargesKnown && !(audit?.criticalMissing.length),
  };
}

function minWinners<T extends { quote: FinanceQuote }>(items: T[], metric: (item: T) => number) {
  const eligible = items.map((item) => ({ item, value: metric(item) })).filter(({ value }) => Number.isFinite(value) && value > 0);
  if (!eligible.length) return [];
  const minimum = Math.min(...eligible.map(({ value }) => value));
  const tolerance = Math.max(0.01, minimum * 0.000001);
  return eligible.filter(({ value }) => Math.abs(value - minimum) <= tolerance).map(({ item }) => item.quote.id);
}

function inverseScore(value: number, values: number[]) {
  const finite = values.filter((item) => Number.isFinite(item) && item >= 0);
  if (!finite.length || !Number.isFinite(value)) return 0;
  const min = Math.min(...finite), max = Math.max(...finite);
  return max - min < 0.000001 ? 100 : Math.max(0, Math.min(100, (max - value) / (max - min) * 100));
}

export const DEFAULT_COMPARISON_WEIGHTS = {
  apr: 30,
  totalRepayment: 20,
  fees: 15,
  prepayment: 10,
  disclosure: 10,
  consistency: 10,
  penalTransparency: 5,
} as const;

export function compareFinanceQuotes(quotes: FinanceQuote[], mode: ComparisonMode, basis: ComparisonBasis, weights = DEFAULT_COMPARISON_WEIGHTS) {
  const audits = quotes.map((quote) => auditFinanceQuote(quote, mode === "normalized" ? basis : undefined));
  const actualAudits = quotes.map((quote) => auditFinanceQuote(quote));
  const amounts = actualAudits.map((item) => item.amount);
  const tenures = actualAudits.map((item) => item.months);
  const sameAmount = amounts.every((amount) => Math.abs(amount - amounts[0]) <= 1);
  const sameTenure = tenures.every((months) => months === tenures[0]);
  const directlyComparable = sameAmount && sameTenure;

  const componentRows = audits.map((item) => {
    const prepaymentScore = !item.prepaymentConfirmed ? null : item.prepayment.level === "no-charge" ? 100 : Math.max(0, 100 - Math.max(item.quote.partPrepaymentPercent, item.quote.foreclosurePercent) * 12 - item.quote.lockInMonths * 1.5);
    const consistency = item.normalized ? 100 : item.audit?.emiMatch === true ? 100 : item.audit?.emiMatch === false ? 0 : 40;
    return {
      id: item.quote.id,
      apr: inverseScore(item.trueApr, audits.map((entry) => entry.trueApr)),
      totalRepayment: inverseScore(item.totalRepayment, audits.map((entry) => entry.totalRepayment)),
      fees: inverseScore(item.compulsoryCharges, audits.map((entry) => entry.compulsoryCharges)),
      prepayment: prepaymentScore,
      disclosure: item.kfsCompleteness,
      consistency,
      penalTransparency: item.quote.penalChargesKnown ? 100 : 0,
    };
  });
  const scores = componentRows.map((row) => {
    const prepayment = row.prepayment ?? 0;
    const score = row.apr * weights.apr / 100 + row.totalRepayment * weights.totalRepayment / 100 + row.fees * weights.fees / 100 + prepayment * weights.prepayment / 100 + row.disclosure * weights.disclosure / 100 + row.consistency * weights.consistency / 100 + row.penalTransparency * weights.penalTransparency / 100;
    return { ...row, score: Math.round(score) };
  });

  const criticalBlock = audits.some((item) => !item.eligibleForOverall) || (mode === "actual" && !directlyComparable);
  const bestScore = scores.length ? Math.max(...scores.map((item) => item.score)) : 0;
  const bestOverall = criticalBlock ? [] : scores.filter((item) => item.score === bestScore).map((item) => item.id);
  const prepaymentWinner = audits.every((item) => item.prepaymentConfirmed)
    ? minWinners(audits, (item) => item.prepayment.level === "no-charge" ? 0.0001 : Math.max(item.quote.partPrepaymentPercent, item.quote.foreclosurePercent) * 100 + item.quote.lockInMonths)
    : [];

  const awards = {
    lowestEmi: minWinners(audits, (item) => item.comparisonEmi),
    lowestApr: minWinners(audits, (item) => item.trueApr),
    lowestInterest: minWinners(audits, (item) => item.totalInterest),
    lowestRepayment: minWinners(audits, (item) => item.totalRepayment),
    lowestLoanCost: minWinners(audits, (item) => item.totalLoanCost),
    lowestFees: minWinners(audits, (item) => item.totalCharges || 0.0001),
    bestTransparency: (() => {
      const max = Math.max(...audits.map((item) => item.kfsCompleteness), 0);
      return audits.filter((item) => item.kfsCompleteness === max).map((item) => item.quote.id);
    })(),
    bestPrepayment: prepaymentWinner,
    bestOverall,
  };

  const findings: ComparisonFinding[] = [];
  if (!directlyComparable && mode === "actual") findings.push({ severity: "warning", title: "Not directly comparable", detail: `${sameAmount ? "Loan amounts match" : "Loan amounts differ"}; ${sameTenure ? "tenures match" : "tenures differ"}.`, why: "EMI and total repayment cannot be ranked fairly when lenders finance different amounts or use different tenures. Use Normalize Offers for a common basis." });
  if (mode === "normalized") findings.push({ severity: "information", title: "Normalized comparison estimate", detail: `Every known rate and method is recalculated at ₹${basis.amount.toLocaleString("en-IN")} for ${basis.months} months.`, why: "This removes loan-amount and tenure distortion but is not any lender's official quotation." });
  const lowestEmiIds = awards.lowestEmi;
  for (const item of audits.filter((entry) => lowestEmiIds.includes(entry.quote.id))) {
    const longest = Math.max(...audits.map((entry) => entry.months));
    if (item.months === longest && audits.some((entry) => entry.months < item.months)) findings.push({ severity: "warning", title: `Low EMI trap — ${item.quote.lenderName || "Unnamed offer"}`, detail: "This offer has the lowest EMI and the longest tenure.", why: "Spreading repayment over more months can lower EMI while increasing interest and total cost." });
  }
  const lowestRate = Math.min(...audits.filter((item) => item.quote.annualRate > 0).map((item) => item.quote.annualRate), Infinity);
  for (const item of audits.filter((entry) => entry.quote.annualRate === lowestRate && entry.quote.method === "flat" && !awards.lowestApr.includes(entry.quote.id))) findings.push({ severity: "warning", title: `Low rate trap — ${item.quote.lenderName || "Unnamed offer"}`, detail: `${item.quote.annualRate.toFixed(2)}% is a flat rate and does not produce the lowest true APR.`, why: "Flat interest remains based on the original principal, so its headline percentage is not directly comparable with a reducing rate." });
  for (const item of audits) {
    if (item.upfrontCharges > 0) findings.push({ severity: "warning", title: `Net disbursement trap — ${item.quote.lenderName || "Unnamed offer"}`, detail: `₹${item.grossSanctioned.toLocaleString("en-IN")} is financed while ₹${item.netAvailable.toLocaleString("en-IN")} is available before separately paid upfront charges.`, why: "Deductions reduce the money received without proportionately reducing the repayment obligation." });
    if (item.audit?.netDisbursementMatch === false) findings.push({ severity: "stop", title: `Net disbursement mismatch — ${item.quote.lenderName || "Unnamed offer"}`, detail: "The disclosed net disbursement does not reconcile with the sanctioned amount and itemized deductions.", why: "An unexplained gap may indicate a missing deduction, fee or bundled product." });
    if (item.quote.charges.some((charge) => /insurance/i.test(charge.label) && charge.amount > 0 && charge.treatment === "financed")) findings.push({ severity: "verify", title: `Insurance bundling — ${item.quote.lenderName || "Unnamed offer"}`, detail: "Insurance is included in the financed amount.", why: "Financed insurance increases principal, EMI and interest; confirm whether it is optional and obtain a separate invoice." });
    if (item.audit?.emiMatch === false) findings.push({ severity: "stop", title: `Quote mismatch — ${item.quote.lenderName || "Unnamed offer"}`, detail: `Quoted EMI differs from the independent calculation by ₹${Math.abs(item.emiDifference).toFixed(2)} per month.`, why: "The stated principal, rate, method and tenure should reproduce the lender EMI within rounding tolerance." });
    if (item.audit?.aprMatch === false) findings.push({ severity: "stop", title: `APR mismatch — ${item.quote.lenderName || "Unnamed offer"}`, detail: `Disclosed APR ${item.quote.lenderApr.toFixed(2)}%; independently calculated APR ${item.trueApr.toFixed(2)}%.`, why: "APR should reproduce the actual loan cash flows and relevant charges." });
  }

  const minProcessing = Math.min(...quotes.map((quote) => quote.charges.find((charge) => charge.key === "processing")?.amount || 0));
  const negotiation = audits.map((item) => {
    const suggestions: string[] = [];
    const processing = item.quote.charges.find((charge) => charge.key === "processing")?.amount || 0;
    if (processing > minProcessing) suggestions.push(`Ask whether the processing fee can be reduced by ₹${Math.round(processing - minProcessing).toLocaleString("en-IN")} to match the lowest entered offer.`);
    const minApr = Math.min(...audits.filter((entry) => entry.trueApr > 0).map((entry) => entry.trueApr), Infinity);
    if (item.trueApr > minApr + 0.05) suggestions.push(`Show the competing derived APR of ${minApr.toFixed(2)}% and request a lower rate or fee waiver.`);
    if (item.quote.charges.some((charge) => /insurance/i.test(charge.label) && charge.amount > 0 && charge.treatment === "financed")) suggestions.push("Ask to remove optional financed insurance or provide a written reason and separate invoice.");
    if (!item.prepaymentConfirmed) suggestions.push("Request written part-prepayment, foreclosure and lock-in terms before accepting the offer.");
    return { id: item.quote.id, suggestions };
  });

  return { audits, actualAudits, directlyComparable, sameAmount, sameTenure, awards, scores, weights, findings, negotiation, criticalBlock };
}

export function createEmptyQuote(id: string, index: number): FinanceQuote {
  const charge = (key: string, label: string): QuoteCharge => ({ id: `${id}-${key}`, key, label, amount: 0, treatment: "not-applicable", requirement: "unknown" });
  return {
    id,
    lenderName: `Finance Offer ${index}`,
    quoteReference: "",
    quoteDate: "",
    notes: "",
    requestedAmount: 600000,
    sanctionedAmount: 600000,
    netDisbursement: 0,
    downPayment: 0,
    months: 60,
    instalments: 60,
    lenderEmi: 0,
    annualRate: 8.5,
    method: "reducing",
    rateType: "unknown",
    lenderApr: 0,
    lenderTotalInterest: 0,
    lenderTotalRepayment: 0,
    charges: [
      charge("processing", "Processing fee"), charge("processingGst", "GST on processing fee"),
      charge("documentation", "Documentation fee"), charge("administrative", "Administrative charge"),
      charge("file", "File charge"), charge("insurance", "Vehicle / loan insurance"),
      charge("creditProtection", "Credit protection insurance"), charge("advanceEmi", "Advance EMI"),
      charge("stampDuty", "Stamp duty"), charge("otherCompulsory", "Other compulsory charges"),
      charge("otherDeduction", "Other deductions"),
    ],
    kfs: DEFAULT_KFS.map((item) => ({ ...item })),
    sanctionDate: "",
    borrowerType: "individual",
    purpose: "personal",
    prepaymentTermsKnown: false,
    partPrepaymentPercent: 0,
    foreclosurePercent: 0,
    lockInMonths: 0,
    penalChargesKnown: false,
  };
}

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Download, FileCheck2, HelpCircle, Printer, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { auditLoan, ChargeInput, ChargeTreatment, DEFAULT_KFS, determinePrepaymentRule, InterestMethod, KfsStatus, RateType, RULES } from "@/app/truth-engine";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value: number) => inr.format(Number.isFinite(value) ? value : 0);
const money2 = (value: number) => inr2.format(Number.isFinite(value) ? value : 0);
const numeric = (value: string) => Math.max(0, Number(value) || 0);

type StringMap = Record<string, string>;
const chargeSeed: Array<Omit<ChargeInput, "amount" | "treatment"> & { amount: string; treatment: ChargeTreatment }> = [
  { key: "processing", label: "Processing fee", amount: "12000", treatment: "deducted" },
  { key: "documentation", label: "Documentation fee", amount: "0", treatment: "not-applicable" },
  { key: "administrative", label: "Administrative fee", amount: "0", treatment: "not-applicable" },
  { key: "insurance", label: "Insurance through loan", amount: "0", treatment: "not-applicable" },
  { key: "gst", label: "GST / tax on fees", amount: "2160", treatment: "deducted" },
  { key: "advanceEmi", label: "Advance EMI", amount: "0", treatment: "not-applicable" },
  { key: "security", label: "Security deposit", amount: "0", treatment: "not-applicable" },
  { key: "otherDeduction", label: "Other deduction", amount: "0", treatment: "not-applicable" },
  { key: "otherCompulsory", label: "Other compulsory charge", amount: "0", treatment: "not-applicable" },
];

function NumberField({ label, value, suffix, onChange }: { label: string; value: string; suffix: string; onChange: (value: string) => void }) {
  return <div className="field"><Label>{label}</Label><div className="input-wrap"><Input aria-label={label} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}/><span>{suffix}</span></div></div>;
}

function StatusPill({ value }: { value: string }) {
  return <span className={`truth-pill ${value.toLowerCase().replaceAll(" ", "-")}`}>{value}</span>;
}

export function TruthAudit() {
  const [vehiclePrice, setVehiclePrice] = useState("900000");
  const [downPayment, setDownPayment] = useState("200000");
  const [exchangeValue, setExchangeValue] = useState("0");
  const [loanAmount, setLoanAmount] = useState("600000");
  const [rate, setRate] = useState("8.5");
  const [months, setMonths] = useState("60");
  const [method, setMethod] = useState<InterestMethod>("reducing");
  const [rateType, setRateType] = useState<RateType>("fixed");
  const [lenderEmi, setLenderEmi] = useState("");
  const [lenderApr, setLenderApr] = useState("");
  const [lenderInterest, setLenderInterest] = useState("");
  const [lenderRepayment, setLenderRepayment] = useState("");
  const [chargeAmounts, setChargeAmounts] = useState<StringMap>(() => Object.fromEntries(chargeSeed.map((item) => [item.key, item.amount])));
  const [chargeTreatments, setChargeTreatments] = useState<Record<string, ChargeTreatment>>(() => Object.fromEntries(chargeSeed.map((item) => [item.key, item.treatment])));
  const [kfsStatuses, setKfsStatuses] = useState<Record<string, KfsStatus>>(() => Object.fromEntries(DEFAULT_KFS.map((item) => [item.key, item.status])));
  const [borrowerType, setBorrowerType] = useState<"individual" | "business" | "other">("individual");
  const [purpose, setPurpose] = useState<"personal" | "business" | "unknown">("personal");
  const [sanctionDate, setSanctionDate] = useState("2026-08-29");
  const [chargeKnown, setChargeKnown] = useState(false);
  const [prepayPercent, setPrepayPercent] = useState("0");
  const [prepayFixed, setPrepayFixed] = useState("0");
  const [advanceEmiTreatment, setAdvanceEmiTreatment] = useState<"first-emi-deducted" | "first-emi-upfront" | "additional-charge" | "unknown">("unknown");
  const [disbursementDate, setDisbursementDate] = useState("");
  const [firstPaymentDate, setFirstPaymentDate] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const charges = useMemo<ChargeInput[]>(() => chargeSeed.map((item) => ({ key: item.key, label: item.label, amount: numeric(chargeAmounts[item.key]), treatment: chargeTreatments[item.key] })), [chargeAmounts, chargeTreatments]);
  const kfs = useMemo(() => DEFAULT_KFS.map((item) => ({ ...item, status: kfsStatuses[item.key] })), [kfsStatuses]);
  const report = useMemo(() => auditLoan({
    vehiclePrice: numeric(vehiclePrice), downPayment: numeric(downPayment), exchangeValue: numeric(exchangeValue),
    baseLoanAmount: numeric(loanAmount), annualRate: numeric(rate), method, rateType, months: numeric(months),
    lenderEmi: numeric(lenderEmi) || undefined, lenderApr: numeric(lenderApr) || undefined,
    lenderTotalInterest: numeric(lenderInterest) || undefined, lenderTotalRepayment: numeric(lenderRepayment) || undefined,
    charges, kfs, advanceEmiTreatment, disbursementDate: disbursementDate || undefined, firstPaymentDate: firstPaymentDate || undefined,
  }), [vehiclePrice, downPayment, exchangeValue, loanAmount, rate, method, rateType, months, lenderEmi, lenderApr, lenderInterest, lenderRepayment, charges, kfs, advanceEmiTreatment, disbursementDate, firstPaymentDate]);
  const prepayment = useMemo(() => determinePrepaymentRule({ rateType, borrowerType, purpose, sanctionDate, chargeKnown, contractualPercent: numeric(prepayPercent), contractualFixed: numeric(prepayFixed) }), [rateType, borrowerType, purpose, sanctionDate, chargeKnown, prepayPercent, prepayFixed]);
  const assetFundingNeed = Math.max(0, numeric(vehiclePrice) - numeric(downPayment) - numeric(exchangeValue));
  const questions = Array.from(new Set([...report.findings.map((item) => item.ask).filter(Boolean), ...report.criticalMissing.map((item) => `Please provide the written ${item.label}.`)])) as string[];
  const decisionTitle = report.decision === "ready" ? "READY TO PROCEED" : report.decision === "do-not-sign" ? "DO NOT SIGN YET" : "VERIFY BEFORE SIGNING";

  const saveAudit = () => {
    const payload = { savedAt: new Date().toISOString(), offer: { vehiclePrice, downPayment, exchangeValue, loanAmount, rate, months, method, rateType, lenderEmi, lenderApr, lenderInterest, lenderRepayment }, charges, kfsStatuses, report };
    localStorage.setItem("loan-truth-checker:truth-audit-v2", JSON.stringify(payload));
    setSaveStatus("Audit saved locally on this device.");
  };
  const downloadAudit = () => {
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), report, prepayment, questions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "loan-truth-report.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  const importLastScan = () => {
    try {
      const extracted = JSON.parse(localStorage.getItem("loan-truth-checker:last-kfs-extraction") || "null") as { values?: Record<string, string> } | null;
      const values = extracted?.values;
      if (!values) { setSaveStatus("No KFS scan is available yet. Use Scan KFS first."); return; }
      if (values.loanAmount) setLoanAmount(values.loanAmount);
      if (values.annualRate) setRate(values.annualRate);
      if (values.months) setMonths(values.months);
      if (values.emi) setLenderEmi(values.emi);
      if (values.apr) setLenderApr(values.apr);
      if (values.totalInterest) setLenderInterest(values.totalInterest);
      if (values.totalRepayment) setLenderRepayment(values.totalRepayment);
      if (values.processingFee) setChargeAmounts((current) => ({ ...current, processing: values.processingFee }));
      if (values.documentationFee) setChargeAmounts((current) => ({ ...current, documentation: values.documentationFee }));
      if (values.insurance) setChargeAmounts((current) => ({ ...current, insurance: values.insurance }));
      if (values.method === "flat" || values.method === "reducing") setMethod(values.method);
      const present: Record<string, string> = { loanAmount: values.loanAmount, interestRate: values.annualRate, tenure: values.months, emi: values.emi, apr: values.apr, processingFee: values.processingFee, documentation: values.documentationFee, insurance: values.insurance, totalRepayment: values.totalRepayment, interestMethod: values.method !== "unknown" ? values.method : "" };
      setKfsStatuses((current) => ({ ...current, ...Object.fromEntries(Object.entries(present).filter(([, value]) => value).map(([key]) => [key, "present" as KfsStatus])) }));
      setSaveStatus("Last KFS scan imported. Confirm every OCR figure against the original document.");
    } catch { setSaveStatus("The saved KFS scan could not be read. Scan the document again."); }
  };

  return <section className="truth-workspace">
    <div className="truth-commandbar">
      <div><span>TRUTH ENGINE V2</span><h2>Audit the offer before you sign</h2><p>One connected check for cost, KFS disclosure, prepayment terms and signing risk.</p></div>
      <div className={`truth-score ${report.decision}`}><span>TRUTH SCORE</span><strong>{report.truthScore}</strong><small>/ 100 · Evidence {report.evidenceConfidence}%</small></div>
    </div>

    <div className="truth-steps">
      <article className="truth-card">
        <div className="truth-step"><span>1</span><div><strong>Enter the actual offer</strong><small>Vehicle, funding and quoted terms</small></div></div>
        <Button type="button" variant="outline" className="import-scan" onClick={importLastScan}><FileCheck2 size={16}/> Import last KFS scan</Button>
        <div className="form-grid truth-form"><NumberField label="Vehicle price" value={vehiclePrice} suffix="₹" onChange={setVehiclePrice}/><NumberField label="Down payment" value={downPayment} suffix="₹" onChange={setDownPayment}/><NumberField label="Exchange value" value={exchangeValue} suffix="₹" onChange={setExchangeValue}/><NumberField label="Base loan amount" value={loanAmount} suffix="₹" onChange={setLoanAmount}/><NumberField label="Quoted annual rate" value={rate} suffix="%" onChange={setRate}/><NumberField label="Tenure" value={months} suffix="months" onChange={setMonths}/></div>
        <div className="truth-selects"><div className="field"><Label>Interest method</Label><select value={method} onChange={(event) => setMethod(event.target.value as InterestMethod)}><option value="reducing">Monthly reducing balance</option><option value="flat">Flat rate</option></select></div><div className="field"><Label>Rate type</Label><select value={rateType} onChange={(event) => setRateType(event.target.value as RateType)}><option value="fixed">Fixed</option><option value="floating">Floating</option><option value="hybrid">Hybrid</option><option value="unknown">Don&apos;t know</option></select></div></div>
        <div className="funding-strip"><span>Asset funding need after down payment and exchange</span><strong>{money(assetFundingNeed)}</strong>{Math.abs(assetFundingNeed - numeric(loanAmount)) > 100 && <small>Difference from base loan: {money(numeric(loanAmount) - assetFundingNeed)} — explain this in writing.</small>}</div>
      </article>

      <article className="truth-card">
        <div className="truth-step"><span>2</span><div><strong>Classify every charge</strong><small>Financed, deducted, paid upfront or not applicable</small></div></div>
        <div className="charge-table"><div className="charge-head"><span>Charge</span><span>Amount</span><span>Treatment</span></div>{chargeSeed.map((item) => <div className="charge-row" key={item.key}><strong>{item.label}</strong><div className="input-wrap"><Input aria-label={`${item.label} amount`} inputMode="decimal" value={chargeAmounts[item.key]} onChange={(event) => setChargeAmounts((current) => ({ ...current, [item.key]: event.target.value.replace(/[^0-9.]/g, "") }))}/><span>₹</span></div><select aria-label={`${item.label} treatment`} value={chargeTreatments[item.key]} onChange={(event) => setChargeTreatments((current) => ({ ...current, [item.key]: event.target.value as ChargeTreatment }))}><option value="unknown">Unknown — verify</option><option value="financed">Financed in loan</option><option value="deducted">Deducted from disbursement</option><option value="upfront">Paid separately upfront</option><option value="not-applicable">Not applicable / confirmed zero</option></select></div>)}</div>
        <div className="truth-selects"><label>Advance EMI meaning<select value={advanceEmiTreatment} onChange={(event) => setAdvanceEmiTreatment(event.target.value as typeof advanceEmiTreatment)}><option value="unknown">Unknown — verify</option><option value="first-emi-deducted">First EMI deducted from disbursement</option><option value="first-emi-upfront">First EMI paid separately</option><option value="additional-charge">Additional lender charge</option></select></label><label>Disbursement date<Input type="date" value={disbursementDate} onChange={(event) => setDisbursementDate(event.target.value)}/></label><label>First regular EMI date<Input type="date" value={firstPaymentDate} onChange={(event) => setFirstPaymentDate(event.target.value)}/></label></div>
      </article>

      <article className="truth-card">
        <div className="truth-step"><span>3</span><div><strong>Cross-check lender disclosures</strong><small>Leave blank when the lender has not disclosed it</small></div></div>
        <div className="form-grid truth-form"><NumberField label="Lender EMI" value={lenderEmi} suffix="₹" onChange={setLenderEmi}/><NumberField label="Lender APR" value={lenderApr} suffix="%" onChange={setLenderApr}/><NumberField label="Lender total interest" value={lenderInterest} suffix="₹" onChange={setLenderInterest}/><NumberField label="Lender total repayment" value={lenderRepayment} suffix="₹" onChange={setLenderRepayment}/></div>
        <div className="math-checks"><div><span>EMI audit</span><strong>{report.emiMatch === null ? "NOT ENTERED" : report.emiMatch ? "MATCH" : "MISMATCH"}</strong><small>Calculated {money2(report.calculatedEmi)}</small></div><div><span>Repayment audit</span><strong>{report.repaymentMatch === null ? "NOT ENTERED" : report.repaymentMatch ? "MATCH" : "MISMATCH"}</strong><small>Calculated {money(report.totalEmiPayments)}</small></div><div><span>Interest audit</span><strong>{report.interestMatch === null ? "NOT ENTERED" : report.interestMatch ? "MATCH" : "MISMATCH"}</strong><small>Calculated {money(report.totalInterest)}</small></div><div><span>APR audit</span><strong>{report.aprMatch === null ? "NOT ENTERED" : report.aprMatch ? "MATCH" : "MISMATCH"}</strong><small>Calculated {report.apr.toFixed(2)}%</small></div></div>
      </article>
    </div>

    <article className="truth-card apr-card">
      <div className="truth-step"><span>4</span><div><strong>True borrowing cost</strong><small>Advertised rate is not treated as the full price</small></div></div>
      <div className="apr-hero"><div><span>QUOTED RATE</span><strong>{numeric(rate).toFixed(2)}%</strong></div><Scale/><div><span>DERIVED NOMINAL APR</span><strong>{report.apr.toFixed(2)}%</strong><small>XIRR annualised cost {report.xirrApr.toFixed(2)}%</small></div></div>
      <div className="truth-metrics"><div><span>Gross sanctioned</span><strong>{money(report.grossSanctioned)}</strong></div><div><span>Net available</span><strong>{money(report.netAvailable)}</strong></div><div><span>Total EMI payments</span><strong>{money(report.totalEmiPayments)}</strong></div><div><span>Total interest</span><strong>{money(report.totalInterest)}</strong></div><div><span>Total fees / charges</span><strong>{money(report.totalFees)}</strong></div><div><span>True borrowing cost</span><strong>{money(report.trueBorrowingCost)}</strong></div><div><span>Effective annual rate</span><strong>{report.effectiveAnnualRate.toFixed(2)}%</strong></div><div><span>Amount deducted upfront</span><strong>{money(report.deductedCharges + report.upfrontCharges)}</strong></div></div>
      {report.apr > numeric(rate) + .1 && <div className="truth-alert"><AlertTriangle/><div><strong>TRUTH ALERT</strong><p>Your actual borrowing cost is higher than the headline interest rate because fees or deductions reduce the value received while repayment remains based on the financed principal.</p></div></div>}
      {method === "flat" && <div className="flat-warning"><strong>{numeric(rate).toFixed(2)}% FLAT ≠ {numeric(rate).toFixed(2)}% REDUCING</strong><div><span>Flat EMI {money2(report.calculatedEmi)}</span><span>Equivalent reducing rate ≈ {report.equivalentReducingRate.toFixed(2)}%</span><span>Extra vs same-number reducing {money(report.flatExtraCost)}</span></div><p>The equivalent rate is solved mathematically from the same EMI and tenure; it is shown as an approximation because contractual cash-flow timing and charges can alter the final APR.</p></div>}
    </article>

    <article className="truth-card">
      <div className="truth-step"><span>5</span><div><strong>KFS Auditor V2</strong><small>Classify every disclosure; never guess missing information</small></div></div>
      <div className="kfs-summary"><div><span>KFS completeness</span><strong>{report.kfsCompleteness}%</strong></div><Progress value={report.kfsCompleteness}/><small>Only PRESENT items count as complete. UNCLEAR and CONFLICTING still require action.</small></div>
      <div className="kfs-grid">{kfs.map((item) => <div key={item.key}><div><strong>{item.label}</strong>{item.critical && <small>Critical</small>}</div><select aria-label={`${item.label} status`} value={kfsStatuses[item.key]} onChange={(event) => setKfsStatuses((current) => ({ ...current, [item.key]: event.target.value as KfsStatus }))}><option value="present">🟢 Present</option><option value="unclear">🟡 Unclear</option><option value="missing">🔴 Missing</option><option value="conflicting">⚠️ Conflicting</option></select></div>)}</div>
    </article>

    <article className="truth-card">
      <div className="truth-step"><span>6</span><div><strong>Prepayment law / contract engine</strong><small>No universal lender percentage is assumed</small></div></div>
      <div className="truth-selects four"><div className="field"><Label>Borrower type</Label><select value={borrowerType} onChange={(event) => setBorrowerType(event.target.value as typeof borrowerType)}><option value="individual">Individual</option><option value="business">Business</option><option value="other">Other</option></select></div><div className="field"><Label>Loan purpose</Label><select value={purpose} onChange={(event) => setPurpose(event.target.value as typeof purpose)}><option value="personal">Personal / non-business</option><option value="business">Business</option><option value="unknown">Unknown</option></select></div><div className="field"><Label>Sanction / renewal date</Label><Input aria-label="Sanction or renewal date" type="date" value={sanctionDate} onChange={(event) => setSanctionDate(event.target.value)}/></div><div className="field"><Label>Contractual charge known?</Label><select value={chargeKnown ? "yes" : "no"} onChange={(event) => setChargeKnown(event.target.value === "yes")}><option value="no">Unknown / not stated</option><option value="yes">Yes</option></select></div></div>
      {chargeKnown && <div className="form-grid two-cols prepay-charge"><NumberField label="Contractual percentage" value={prepayPercent} suffix="%" onChange={setPrepayPercent}/><NumberField label="Contractual fixed amount" value={prepayFixed} suffix="₹" onChange={setPrepayFixed}/></div>}
      <div className={`prepay-rule ${prepayment.level}`}><ShieldCheck/><div><StatusPill value={prepayment.level === "no-charge" ? "PASS" : prepayment.level === "conflict" ? "STOP" : prepayment.level === "contract" ? "VERIFY" : "INFORMATION"}/><h3>{prepayment.title}</h3><p>{prepayment.detail}</p></div></div>
    </article>

    <article className={`truth-report ${report.decision}`}>
      <div className="report-top"><div><span>LOAN TRUTH REPORT</span><h2>{decisionTitle}</h2><p>{report.decision === "ready" ? "The entered evidence is complete and no material mathematical conflict was found." : report.decision === "do-not-sign" ? "A critical conflict must be corrected in writing before signing or disbursement." : "Important information remains missing, unclear or unverified."}</p></div><div><strong>{report.truthScore}</strong><span>/100 truth · {report.evidenceConfidence}% evidence</span></div></div>
      <div className="report-grid"><div><span>Advertised rate</span><strong>{numeric(rate).toFixed(2)}%</strong></div><div><span>Calculated EMI</span><strong>{money2(report.calculatedEmi)}</strong></div><div><span>Net amount available</span><strong>{money(report.netAvailable)}</strong></div><div><span>Total repayment</span><strong>{money(report.totalRepayment)}</strong></div><div><span>True APR</span><strong>{report.apr.toFixed(2)}%</strong></div><div><span>KFS completeness</span><strong>{report.kfsCompleteness}%</strong></div></div>
      <div className="finding-stack">{report.findings.map((finding, index) => <article className={finding.severity} key={`${finding.title}-${index}`}>{finding.severity === "pass" ? <BadgeCheck/> : finding.severity === "stop" ? <ShieldAlert/> : <AlertTriangle/>}<div><StatusPill value={finding.severity.toUpperCase()}/><h3>{finding.title}</h3><p>{finding.detail}</p><div className="why"><HelpCircle/><span><strong>Why?</strong> {finding.why}</span></div>{finding.ask && <blockquote>{finding.ask}</blockquote>}</div></article>)}</div>
      <div className="ask-list"><h3>Ask the lender</h3>{questions.length ? questions.map((question) => <blockquote key={question}>{question}</blockquote>) : <p>No additional question was generated from the entered evidence.</p>}</div>
      <div className="truth-actions"><Button type="button" onClick={saveAudit}><ShieldCheck/> Save audit locally</Button><Button type="button" variant="outline" onClick={downloadAudit}><Download/> Download data</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer/> Print / save PDF</Button></div><p className="save-status" aria-live="polite">{saveStatus}</p>
    </article>

    <article className="truth-card rule-control">
      <div className="truth-step"><span>7</span><div><strong>Rule status control</strong><small>Regulations, guidance and lender policy remain separate</small></div></div>
      <div className="rule-status-grid">{RULES.map((rule) => <article key={rule.id}><StatusPill value={rule.status}/><h3>{rule.title}</h3><dl><div><dt>Authority</dt><dd>{rule.authority}</dd></div><div><dt>Reference</dt><dd>{rule.reference}</dd></div><div><dt>Published</dt><dd>{rule.publicationDate}</dd></div><div><dt>Effective</dt><dd>{rule.effectiveDate}</dd></div><div><dt>Last verified</dt><dd>{rule.lastChecked}</dd></div></dl><p>{rule.explanation}</p><small>{rule.applicability}</small>{rule.source.startsWith("http") ? <a href={rule.source} target="_blank" rel="noreferrer">Official source</a> : <small>{rule.source}</small>}</article>)}</div>
      <p className="independence"><ShieldCheck/> Independent tool. Not an official RBI application and not affiliated with or endorsed by any bank, NBFC, or lender.</p>
    </article>
  </section>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, Copy, Plus, ShieldAlert, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  compareFinanceQuotes, ComparisonMode, createEmptyQuote, FinanceQuote, QuoteCharge,
} from "@/app/comparison-engine";
import { FinancierMatrixTable } from "@/components/loan/financier-matrix-table";
import { formatInr } from "@/lib/money";

const money = (value: number) => formatInr(value);
const number = (value: string) => Math.max(0, Number(value.replace(/,/g, "")) || 0);
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const initialQuotes = () => [createEmptyQuote("offer-1", 1), createEmptyQuote("offer-2", 2)];

function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return <div className="field"><Label>{label}</Label><div className="input-wrap"><Input inputMode="decimal" value={value || ""} onChange={(event) => onChange(number(event.target.value))}/><span>{suffix}</span></div></div>;
}

function awardNames(ids: string[], quotes: FinanceQuote[]) {
  if (!ids.length) return "Cannot determine — information missing";
  return ids.map((id) => quotes.find((quote) => quote.id === id)?.lenderName || "Unnamed offer").join(" · ");
}

function decisionTone(value: string) { return value === "READY TO CONSIDER" ? "pass" : value === "DO NOT SIGN YET" ? "stop" : "verify"; }

export function FinancierComparison() {
  const [quotes, setQuotes] = useState<FinanceQuote[]>(initialQuotes);
  const [mode, setMode] = useState<ComparisonMode>("actual");
  const [normalAmount, setNormalAmount] = useState(600000);
  const [normalMonths, setNormalMonths] = useState(60);
  const [saved, setSaved] = useState("Saved locally in this browser");
  const [saveLocally, setSaveLocally] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem("loan-truth-checker:finance-offers-v1");
        if (stored) {
          const parsed = JSON.parse(stored) as { quotes?: FinanceQuote[]; mode?: ComparisonMode; amount?: number; months?: number };
          if (parsed.quotes && parsed.quotes.length >= 2) setQuotes(parsed.quotes.slice(0, 5));
          if (parsed.mode) setMode(parsed.mode);
          if (parsed.amount) setNormalAmount(parsed.amount);
          if (parsed.months) setNormalMonths(parsed.months);
        }
      } catch { setSaved("Saved comparison could not be loaded"); }
      hydrated.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (saveLocally) {
      localStorage.setItem("loan-truth-checker:finance-offers-v1", JSON.stringify({ quotes, mode, amount: normalAmount, months: normalMonths }));
    }
  }, [quotes, mode, normalAmount, normalMonths, saveLocally]);

  const comparison = useMemo(() => compareFinanceQuotes(quotes, mode, { amount: normalAmount, months: normalMonths }), [quotes, mode, normalAmount, normalMonths]);
  const updateQuote = (id: string, patch: Partial<FinanceQuote>) => setQuotes((current) => current.map((quote) => quote.id === id ? { ...quote, ...patch } : quote));
  const updateCharge = (quoteId: string, chargeId: string, patch: Partial<QuoteCharge>) => setQuotes((current) => current.map((quote) => quote.id === quoteId ? { ...quote, charges: quote.charges.map((charge) => charge.id === chargeId ? { ...charge, ...patch } : charge) } : quote));
  const updateKfs = (quoteId: string, key: string, status: FinanceQuote["kfs"][number]["status"]) => setQuotes((current) => current.map((quote) => quote.id === quoteId ? { ...quote, kfs: quote.kfs.map((item) => item.key === key ? { ...item, status } : item) } : quote));
  const addOffer = () => setQuotes((current) => current.length >= 5 ? current : [...current, createEmptyQuote(newId("offer"), current.length + 1)]);
  const duplicateOffer = (quote: FinanceQuote) => setQuotes((current) => current.length >= 5 ? current : [...current, { ...structuredClone(quote), id: newId("offer"), lenderName: `${quote.lenderName} copy`, charges: quote.charges.map((charge) => ({ ...charge, id: newId("charge") })) }]);
  const deleteOffer = (id: string) => setQuotes((current) => current.length <= 2 ? current : current.filter((quote) => quote.id !== id));
  const addCustomCharge = (quote: FinanceQuote) => updateQuote(quote.id, { charges: [...quote.charges, { id: newId("charge"), key: newId("custom"), label: "Custom charge", amount: 0, amountType: "fixed", percentage: 0, taxPercent: 0, treatment: "unknown", requirement: "unknown" }] });
  const removeCharge = (quote: FinanceQuote, id: string) => updateQuote(quote.id, { charges: quote.charges.filter((charge) => charge.id !== id) });

  const awardCards = [
    ["LOWEST EMI", comparison.awards.lowestEmi], ["LOWEST TRUE APR", comparison.awards.lowestApr],
    ["LOWEST TOTAL INTEREST", comparison.awards.lowestInterest], ["LOWEST FEES", comparison.awards.lowestFees],
    ["LOWEST TOTAL REPAYMENT", comparison.awards.lowestRepayment], ["LOWEST TOTAL LOAN COST", comparison.awards.lowestLoanCost],
    ["BEST PREPAYMENT FLEXIBILITY", comparison.awards.bestPrepayment], ["BEST TRANSPARENCY", comparison.awards.bestTransparency],
    ["BEST OVERALL LOAN", comparison.awards.bestOverall],
  ] as const;
  const overallWinner = comparison.awards.bestOverall.length === 1 ? comparison.audits.find((item) => item.quote.id === comparison.awards.bestOverall[0]) : null;
  const pairwiseDifferences = comparison.audits.flatMap((left, leftIndex) => comparison.audits.slice(leftIndex + 1).map((right) => ({
    key: `${left.quote.id}-${right.quote.id}`,
    left: left.quote.lenderName || "Unnamed offer",
    right: right.quote.lenderName || "Unnamed offer",
    emi: left.comparisonEmi - right.comparisonEmi,
    repayment: left.totalRepayment - right.totalRepayment,
    apr: left.trueApr - right.trueApr,
    fees: left.totalCharges - right.totalCharges,
  })));
  const overallDisadvantages = overallWinner ? [
    ...overallWinner.questions.slice(0, 3),
    ...(overallWinner.quote.method === "flat" ? ["The quote uses flat interest, so the headline rate understates its reducing-rate equivalent."] : []),
    ...(overallWinner.totalCharges > 0 ? [`The offer still contains ${money(overallWinner.totalCharges)} in entered charges.`] : []),
  ].slice(0, 4) : [];
  const tableRows: Array<[string, (item: (typeof comparison.audits)[number]) => string]> = [
    ["Loan amount", (item) => money(item.amount)], ["Quoted rate", (item) => `${item.quote.annualRate.toFixed(2)}%`],
    ["Method", (item) => item.quote.method === "unknown" ? "Not confirmed" : item.quote.method === "flat" ? "Flat" : "Reducing"],
    ["Equivalent reducing rate", (item) => item.quote.method === "flat" ? `${item.equivalentReducingRate.toFixed(2)}% approx.` : "Same as quoted"],
    ["Quoted EMI", (item) => item.normalized ? "Original kept separately" : item.quote.lenderEmi ? money(item.quote.lenderEmi) : "Not confirmed"],
    ["Truth Engine EMI", (item) => item.calculatedEmi ? money(item.calculatedEmi) : "Cannot calculate"],
    ["True APR", (item) => item.trueApr ? `${item.trueApr.toFixed(2)}%` : "Cannot calculate"],
    ["Effective annual rate", (item) => item.effectiveAnnualRate ? `${item.effectiveAnnualRate.toFixed(2)}%` : "Cannot calculate"],
    ["Gross financed", (item) => money(item.grossSanctioned)], ["Net disbursement", (item) => money(item.netAvailable)],
    ["Upfront / deducted", (item) => money(item.upfrontCharges)], ["Financed charges", (item) => money(item.financedCharges)],
    ["Total charges", (item) => money(item.totalCharges)], ["Total interest", (item) => money(item.totalInterest)],
    ["Total repayment", (item) => money(item.totalRepayment)], ["True loan cost", (item) => money(item.totalLoanCost)],
    ["Cost per ₹1 lakh", (item) => money(item.costPerLakh)],
    ["Prepayment", (item) => item.prepaymentConfirmed ? item.prepayment.title : "Not confirmed"],
    ["KFS completeness", (item) => `${item.kfsCompleteness}%`], ["Evidence confidence", (item) => `${item.evidenceConfidence}%`], ["Approval Gate", (item) => item.decisionLabel],
  ];
  const matrixRows = tableRows.map(([metric, render]) => ({ metric, values: Object.fromEntries(comparison.audits.map((item) => [item.quote.id, render(item)])) }));

  return <section className="financier-workspace">
    <div className="financier-hero">
      <div><span>MULTI-OFFER TRUTH ENGINE</span><h2>Financier Quote Comparison</h2><p>Compare the true cost of multiple loan offers—not the advertised rate or EMI alone.</p></div>
      <div className="offer-count"><strong>{quotes.length}</strong><span>offers</span></div>
    </div>

    <div className="financier-actions">
      <Button type="button" onClick={addOffer} disabled={quotes.length >= 5}><Plus/> Add Finance Offer</Button>
      <span>{quotes.length >= 5 ? "Maximum five offers reached" : "Add between two and five real quotations"}</span>
      <small>{saved}</small>
      <label><input type="checkbox" checked={saveLocally} onChange={(event) => { const enabled = event.target.checked; setSaveLocally(enabled); if (!enabled) localStorage.removeItem("loan-truth-checker:finance-offers-v1"); setSaved(enabled ? "Saved locally in this browser" : "Local saving disabled; saved comparison cleared"); }}/> Save comparisons locally</label>
      <Button type="button" variant="outline" onClick={() => { localStorage.removeItem("loan-truth-checker:finance-offers-v1"); setSaved("Saved comparison data cleared"); }}>Clear saved comparisons</Button>
    </div>

    <div className="offer-editor-grid">
      {quotes.map((quote, quoteIndex) => <details className="offer-editor" open={quoteIndex < 2} key={quote.id}>
        <summary><span>{String(quoteIndex + 1).padStart(2, "0")}</span><div><strong>{quote.lenderName || "Unnamed finance offer"}</strong><small>{quote.method === "unknown" ? "Method not confirmed" : `${quote.annualRate.toFixed(2)}% ${quote.method}`}</small></div></summary>
        <div className="offer-editor-body">
          <div className="offer-toolbar">
            <Button type="button" size="sm" variant="outline" onClick={() => duplicateOffer(quote)} disabled={quotes.length >= 5}><Copy/> Duplicate</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button type="button" size="sm" variant="outline" disabled={quotes.length <= 2}><Trash2/> Delete</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this finance offer?</AlertDialogTitle><AlertDialogDescription>The entered quotation will be removed from this browser comparison. At least two offers must remain.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep offer</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleteOffer(quote.id)}>Delete offer</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
          </div>

          <h3>Identification</h3>
          <div className="offer-form-grid">
            <div className="field"><Label>Lender / financier name</Label><Input value={quote.lenderName} onChange={(event) => updateQuote(quote.id, { lenderName: event.target.value })}/></div>
            <div className="field"><Label>Quote reference</Label><Input value={quote.quoteReference} onChange={(event) => updateQuote(quote.id, { quoteReference: event.target.value })}/></div>
            <div className="field"><Label>Quote date</Label><Input type="date" value={quote.quoteDate} onChange={(event) => updateQuote(quote.id, { quoteDate: event.target.value })}/></div>
          </div>

          <h3>Original quote values</h3>
          <div className="offer-form-grid">
            <NumberField label="Requested amount" value={quote.requestedAmount} suffix="₹" onChange={(value) => updateQuote(quote.id, { requestedAmount: value })}/>
            <NumberField label="Sanctioned loan amount" value={quote.sanctionedAmount} suffix="₹" onChange={(value) => updateQuote(quote.id, { sanctionedAmount: value })}/>
            <NumberField label="Net disbursement" value={quote.netDisbursement} suffix="₹" onChange={(value) => updateQuote(quote.id, { netDisbursement: value })}/>
            <NumberField label="Down payment" value={quote.downPayment} suffix="₹" onChange={(value) => updateQuote(quote.id, { downPayment: value })}/>
            <NumberField label="Tenure" value={quote.months} suffix="months" onChange={(value) => updateQuote(quote.id, { months: value })}/>
            <NumberField label="Number of instalments" value={quote.instalments} suffix="EMIs" onChange={(value) => updateQuote(quote.id, { instalments: value })}/>
            <NumberField label="Lender quoted EMI" value={quote.lenderEmi} suffix="₹" onChange={(value) => updateQuote(quote.id, { lenderEmi: value })}/>
            <NumberField label="Quoted annual rate" value={quote.annualRate} suffix="%" onChange={(value) => updateQuote(quote.id, { annualRate: value })}/>
            <NumberField label="Lender disclosed APR" value={quote.lenderApr} suffix="%" onChange={(value) => updateQuote(quote.id, { lenderApr: value })}/>
            <NumberField label="Disclosed total interest" value={quote.lenderTotalInterest} suffix="₹" onChange={(value) => updateQuote(quote.id, { lenderTotalInterest: value })}/>
            <NumberField label="Disclosed total repayment" value={quote.lenderTotalRepayment} suffix="₹" onChange={(value) => updateQuote(quote.id, { lenderTotalRepayment: value })}/>
          </div>
          <div className="offer-select-grid">
            <label>Interest method<select value={quote.method} onChange={(event) => updateQuote(quote.id, { method: event.target.value as FinanceQuote["method"] })}><option value="unknown">Unknown</option><option value="reducing">Reducing balance</option><option value="flat">Flat rate</option></select></label>
            <label>Rate type<select value={quote.rateType} onChange={(event) => updateQuote(quote.id, { rateType: event.target.value as FinanceQuote["rateType"] })}><option value="unknown">Unknown</option><option value="fixed">Fixed</option><option value="floating">Floating</option><option value="hybrid">Hybrid</option></select></label>
            <label>Borrower type<select value={quote.borrowerType} onChange={(event) => updateQuote(quote.id, { borrowerType: event.target.value as FinanceQuote["borrowerType"] })}><option value="individual">Individual</option><option value="business">Business</option><option value="other">Other</option></select></label>
            <label>Loan purpose<select value={quote.purpose} onChange={(event) => updateQuote(quote.id, { purpose: event.target.value as FinanceQuote["purpose"] })}><option value="unknown">Unknown</option><option value="personal">Personal / non-business</option><option value="business">Business</option></select></label>
          </div>
          <div className="field"><Label>Optional notes</Label><textarea value={quote.notes} onChange={(event) => updateQuote(quote.id, { notes: event.target.value })}/></div>

          <details className="offer-subsection"><summary>Fees, insurance and deductions</summary><div className="charge-editor">
            <div className="charge-editor-head"><span>Description</span><span>Amount / rate</span><span>Amount type</span><span>GST</span><span>Treatment</span><span>Requirement</span><span/></div>
            {quote.charges.map((charge, index) => <div className="quote-charge-row" key={charge.id}>
              <Input value={charge.label} onChange={(event) => updateCharge(quote.id, charge.id, { label: event.target.value })}/>
              <Input inputMode="decimal" value={(charge.amountType === "percentage" ? charge.percentage : charge.amount) || ""} onChange={(event) => updateCharge(quote.id, charge.id, charge.amountType === "percentage" ? { percentage: number(event.target.value) } : { amount: number(event.target.value) })}/>
              <select value={charge.amountType || "fixed"} onChange={(event) => updateCharge(quote.id, charge.id, { amountType: event.target.value as QuoteCharge["amountType"] })}><option value="fixed">Fixed ₹</option><option value="percentage">Percent %</option></select>
              <Input aria-label={`${charge.label} GST percent`} inputMode="decimal" placeholder="GST %" value={charge.taxPercent || ""} onChange={(event) => updateCharge(quote.id, charge.id, { taxPercent: number(event.target.value) })}/>
              <select value={charge.treatment} onChange={(event) => updateCharge(quote.id, charge.id, { treatment: event.target.value as QuoteCharge["treatment"] })}><option value="unknown">Unknown</option><option value="not-applicable">Not applicable</option><option value="financed">Financed</option><option value="deducted">Deducted</option><option value="upfront">Paid upfront</option></select>
              <select value={charge.requirement} onChange={(event) => updateCharge(quote.id, charge.id, { requirement: event.target.value as QuoteCharge["requirement"] })}><option value="unknown">Unknown</option><option value="mandatory">Mandatory</option><option value="optional">Optional</option></select>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${charge.label}`} onClick={() => removeCharge(quote, charge.id)} disabled={index < 11}><Trash2/></Button>
            </div>)}
            <Button type="button" variant="outline" size="sm" onClick={() => addCustomCharge(quote)}><Plus/> Add custom charge</Button>
          </div></details>

          <details className="offer-subsection"><summary>KFS completeness — {Math.round(quote.kfs.filter((item) => item.status === "present").length / quote.kfs.length * 100)}%</summary><div className="quote-kfs-grid">
            {quote.kfs.map((item) => <label key={item.key}><span>{item.label}{item.critical && <small>critical</small>}</span><select value={item.status} onChange={(event) => updateKfs(quote.id, item.key, event.target.value as FinanceQuote["kfs"][number]["status"])}><option value="present">Present</option><option value="unclear">Unclear</option><option value="missing">Missing</option><option value="conflicting">Conflicting</option></select></label>)}
          </div></details>

          <details className="offer-subsection"><summary>Prepayment, foreclosure and penal terms</summary><div className="offer-form-grid">
            <div className="field"><Label>Sanction / renewal date</Label><Input type="date" value={quote.sanctionDate} onChange={(event) => updateQuote(quote.id, { sanctionDate: event.target.value })}/></div>
            <NumberField label="Part-prepayment charge" value={quote.partPrepaymentPercent} suffix="%" onChange={(value) => updateQuote(quote.id, { partPrepaymentPercent: value })}/>
            <NumberField label="Foreclosure charge" value={quote.foreclosurePercent} suffix="%" onChange={(value) => updateQuote(quote.id, { foreclosurePercent: value })}/>
            <NumberField label="Lock-in period" value={quote.lockInMonths} suffix="months" onChange={(value) => updateQuote(quote.id, { lockInMonths: value })}/>
          </div><div className="offer-checks"><label><input type="checkbox" checked={quote.prepaymentTermsKnown} onChange={(event) => updateQuote(quote.id, { prepaymentTermsKnown: event.target.checked })}/> Written prepayment and foreclosure terms received</label><label><input type="checkbox" checked={quote.penalChargesKnown} onChange={(event) => updateQuote(quote.id, { penalChargesKnown: event.target.checked })}/> Penal charges confirmed</label></div></details>
        </div>
      </details>)}
    </div>

    <article className="comparison-control">
      <div><span>COMPARISON BASIS</span><h2>Actual offer or normalized estimate</h2></div>
      <div className="mode-buttons"><Button type="button" variant={mode === "actual" ? "default" : "outline"} onClick={() => setMode("actual")}>Mode A · Actual offers</Button><Button type="button" variant={mode === "normalized" ? "default" : "outline"} onClick={() => setMode("normalized")}>Mode B · Normalize offers</Button></div>
      {mode === "normalized" && <div className="normal-fields"><NumberField label="Common loan amount" value={normalAmount} suffix="₹" onChange={setNormalAmount}/><NumberField label="Common tenure" value={normalMonths} suffix="months" onChange={setNormalMonths}/></div>}
      <p className={comparison.directlyComparable || mode === "normalized" ? "comparable" : "not-comparable"}>{mode === "normalized" ? "Comparison estimate — not the lender's official quotation." : comparison.directlyComparable ? "Offers use the same amount and tenure." : "⚠️ NOT DIRECTLY COMPARABLE — loan amounts and/or tenures differ."}</p>
    </article>

    <div className="comparison-findings">{comparison.findings.map((finding, index) => <article className={finding.severity} key={`${finding.title}-${index}`}>{finding.severity === "stop" ? <ShieldAlert/> : finding.severity === "pass" ? <CheckCircle2/> : <AlertTriangle/>}<div><span>{finding.severity.toUpperCase()}</span><h3>{finding.title}</h3><p>{finding.detail}</p><small><strong>Why?</strong> {finding.why}</small></div></article>)}</div>

    <div className="award-grid">{awardCards.map(([label, ids]) => <article className={label === "BEST OVERALL LOAN" ? "overall" : ""} key={label}><Trophy/><span>{label}</span><strong>{awardNames(ids, quotes)}</strong>{label === "BEST OVERALL LOAN" && comparison.criticalBlock && <small>No overall winner until critical information and comparability are resolved.</small>}</article>)}</div>

    {overallWinner && <article className="overall-explanation"><div><span>BEST OVERALL — WHY IT WON</span><h2>{overallWinner.quote.lenderName}</h2><p>It produced the strongest weighted result across true APR, total repayment, compulsory fees, prepayment flexibility, KFS disclosure, mathematical consistency and penal-charge transparency. The score uses the published weights below—not the advertised rate alone.</p></div><div><h3>Disadvantages still to check</h3>{overallDisadvantages.length ? <ul>{overallDisadvantages.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No unresolved disadvantage was identified from the entered data. Still verify the signed KFS and sanction letter.</p>}</div></article>}

    <article className="comparison-table-card">
      <div className="comparison-title"><div><span>SIDE-BY-SIDE AUDIT</span><h2>Confirmed quote vs Truth Engine calculation</h2></div><p>Flat and reducing rates are not directly comparable by headline percentage.</p></div>
      <FinancierMatrixTable lenders={comparison.audits.map((item) => ({ id: item.quote.id, name: item.quote.lenderName || "Unnamed offer" }))} rows={matrixRows}/>
    </article>

    <article className="score-card">
      <div className="comparison-title"><div><span>REAL DIFFERENCES</span><h2>What one offer changes in rupees</h2></div><p>Positive values mean the first named offer costs more; negative values mean it costs less.</p></div>
      <div className="difference-grid">{pairwiseDifferences.map((pair) => <div key={pair.key}><strong>{pair.left} vs {pair.right}</strong><span>Monthly EMI: {money(pair.emi)}</span><span>Total repayment: {money(pair.repayment)}</span><span>APR: {pair.apr >= 0 ? "+" : ""}{pair.apr.toFixed(2)} percentage points</span><span>Charges: {money(pair.fees)}</span></div>)}</div>
    </article>

    <article className="score-card">
      <div className="comparison-title"><div><span>TRANSPARENT WEIGHTING</span><h2>How the overall score is calculated</h2></div><p>APR 30% · Repayment 20% · Fees 15% · Prepayment 10% · Disclosure 10% · Consistency 10% · Penal transparency 5%</p></div>
      <div className="score-grid">{comparison.scores.map((score) => <div key={score.id}><span>{quotes.find((quote) => quote.id === score.id)?.lenderName}</span><strong>{score.score}/100</strong><small>APR {Math.round(score.apr)} · Repayment {Math.round(score.totalRepayment)} · Fees {Math.round(score.fees)} · Prepay {score.prepayment === null ? "N/C" : Math.round(score.prepayment)} · KFS {score.disclosure}</small></div>)}</div>
    </article>

    <div className="offer-truth-reports">{comparison.actualAudits.map((item) => {
      const negotiation = comparison.negotiation.find((entry) => entry.id === item.quote.id)?.suggestions || [];
      return <article className={`offer-truth-card ${decisionTone(item.decisionLabel)}`} key={item.quote.id}>
        <div className="offer-report-head"><div><span>FINANCE OFFER TRUTH REPORT</span><h2>{item.quote.lenderName || "Unnamed offer"}</h2></div><strong>{item.decisionLabel}</strong></div>
        <div className="offer-report-metrics"><div><span>True APR</span><strong>{item.trueApr ? `${item.trueApr.toFixed(2)}%` : "N/C"}</strong></div><div><span>Total loan cost</span><strong>{money(item.totalLoanCost)}</strong></div><div><span>KFS</span><strong>{item.kfsCompleteness}%</strong></div><div><span>Net disbursement</span><strong>{money(item.netAvailable)}</strong></div></div>
        <section><h3>What to negotiate</h3>{negotiation.length ? <ul>{negotiation.map((text) => <li key={text}>{text}</li>)}</ul> : <p>No specific cost concession identified from the entered offers.</p>}</section>
        <section><h3>What to ask this lender</h3>{item.questions.length ? <ol>{item.questions.map((text) => <li key={text}>{text}</li>)}</ol> : <p>All critical comparison inputs are marked present. Verify the original signed documents.</p>}</section>
      </article>;
    })}</div>
    <p className="comparison-privacy"><BadgeCheck/> Local calculation: entered quotation figures remain in this browser and are not sent to an external comparison service.</p>
  </section>;
}

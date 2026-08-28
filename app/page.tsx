"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Calculator, ChevronDown, FileCheck2, SearchCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Method = "reducing" | "flat";
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (v: number) => INR.format(Number.isFinite(v) ? v : 0);
const num = (v: string) => Math.max(0, Number(v) || 0);

function reducingEmi(p: number, annual: number, months: number) {
  if (!p || !months) return 0;
  const r = annual / 1200;
  return r ? (p * r * (1 + r) ** months) / ((1 + r) ** months - 1) : p / months;
}
function flatEmi(p: number, annual: number, months: number) {
  return p && months ? (p + p * annual / 100 * months / 12) / months : 0;
}
function impliedRate(p: number, emi: number, months: number) {
  if (!p || !emi || !months || emi * months <= p) return 0;
  let low = 0, high = 100;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    reducingEmi(p, mid, months) < emi ? low = mid : high = mid;
  }
  return (low + high) / 2;
}
function impliedPrincipal(emi: number, annual: number, months: number) {
  const unit = reducingEmi(1, annual, months);
  return unit ? emi / unit : emi * months;
}
function schedule(p: number, annual: number, months: number, method: Method) {
  const emi = method === "reducing" ? reducingEmi(p, annual, months) : flatEmi(p, annual, months);
  const rows = []; let balance = p;
  const flatInterest = p * annual / 1200;
  for (let month = 1; month <= months; month++) {
    const opening = balance;
    const interest = method === "reducing" ? opening * annual / 1200 : flatInterest;
    const principal = month === months ? opening : Math.min(opening, emi - interest);
    balance = Math.max(0, opening - principal);
    rows.push({ month, payment: month === months ? principal + interest : emi, interest, principal, balance });
  }
  return rows;
}
function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return <div className="field"><Label>{label}</Label><div className="input-wrap">
    <Input inputMode="decimal" value={value} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ""))} aria-label={label}/>
    <span>{suffix}</span>
  </div></div>;
}
function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={"metric " + tone}><span>{label}</span><strong>{value}</strong></div>;
}

export default function Home() {
  const [principal, setPrincipal] = useState("611000");
  const [rate, setRate] = useState("6.5");
  const [months, setMonths] = useState("60");
  const [method, setMethod] = useState<Method>("reducing");
  const [showSchedule, setShowSchedule] = useState(false);
  const [quotePrincipal, setQuotePrincipal] = useState("611000");
  const [quoteRate, setQuoteRate] = useState("6.5");
  const [quoteMonths, setQuoteMonths] = useState("60");
  const [quoteEmi, setQuoteEmi] = useState("");
  const [processing, setProcessing] = useState("0");
  const [documentation, setDocumentation] = useState("0");
  const [insurance, setInsurance] = useState("0");
  const [other, setOther] = useState("0");

  const calc = useMemo(() => {
    const p = num(principal), r = num(rate), n = Math.round(num(months));
    const rows = schedule(p, r, n, method);
    const emi = rows[0]?.payment || 0;
    const total = rows.reduce((sum, row) => sum + row.payment, 0);
    return { p, rows, emi, total, interest: total - p };
  }, [principal, rate, months, method]);

  const audit = useMemo(() => {
    const p = num(quotePrincipal), stated = num(quoteRate), n = Math.round(num(quoteMonths)), emi = num(quoteEmi);
    const fees = num(processing) + num(documentation) + num(insurance) + num(other);
    const expectedReducing = reducingEmi(p, stated, n), expectedFlat = flatEmi(p, stated, n);
    const realRate = impliedRate(p, emi, n);
    const unexplained = impliedPrincipal(emi, stated, n) - p;
    const apr = impliedRate(Math.max(1, p - fees), emi, n);
    const flatGap = Math.abs(emi - expectedFlat), reducingGap = Math.abs(emi - expectedReducing);
    const likely = !emi ? "Enter the exact EMI" : flatGap + 5 < reducingGap ? "Looks closer to flat-rate pricing" : reducingGap + 5 < flatGap ? "Looks closer to reducing-balance pricing" : "Method unclear — request the KFS";
    const flags: string[] = [];
    if (stated && stated < 7) flags.push("The stated rate is below Sundaram’s published indicative 7%–20% annualised car-loan range. Ask for written confirmation of a special rate.");
    if (emi && flatGap + 5 < reducingGap) flags.push("The EMI is closer to the flat-rate result than the reducing-balance result.");
    if (emi && unexplained > 100) flags.push(`At the stated reducing rate, the EMI behaves as if about ${money(unexplained)} extra principal was financed.`);
    if (emi && realRate > stated + .1) flags.push(`The EMI implies approximately ${realRate.toFixed(2)}% reducing interest, higher than the stated ${stated.toFixed(2)}%.`);
    if (fees && apr > realRate + .05) flags.push(`Upfront charges raise the estimated APR to about ${apr.toFixed(2)}%.`);
    if (num(processing) > p * .05) flags.push("Processing fee is above Sundaram’s published maximum of 5% of the financed amount, before GST.");
    if (num(documentation) > 5500) flags.push("Documentation charge is above Sundaram’s published maximum of ₹5,500, before GST.");
    return { emi, expectedReducing, expectedFlat, realRate, unexplained, apr, total: emi * n, likely, flags };
  }, [quotePrincipal, quoteRate, quoteMonths, quoteEmi, processing, documentation, insurance, other]);

  return <main>
    <header className="topbar"><div className="brand-mark"><ShieldCheck size={22}/></div><div><p>PERSONAL FINANCE TOOL</p><h1>Loan Truth Checker</h1></div><span className="private">Private</span></header>
    <section className="intro"><div><span className="eyebrow">SUNDARAM + RBI CHECK</span><h2>Know what the loan really costs.</h2><p>Calculate the EMI, reconstruct the lender’s formula and expose unexplained amounts before signing.</p></div><div className="trust"><BadgeCheck size={18}/><span>Rules snapshot<br/><strong>28 Aug 2026</strong></span></div></section>

    <Tabs defaultValue="calculate" className="workspace">
      <TabsList className="tab-list">
        <TabsTrigger value="calculate"><Calculator size={17}/>Calculate</TabsTrigger>
        <TabsTrigger value="audit"><SearchCheck size={17}/>Check quote</TabsTrigger>
        <TabsTrigger value="rules"><FileCheck2 size={17}/>Rules</TabsTrigger>
      </TabsList>

      <TabsContent value="calculate" className="panel">
        <div className="panel-heading"><div><span>01</span><h3>EMI calculator</h3></div><p>Monthly reducing or flat interest</p></div>
        <div className="form-grid">
          <Field label="Loan amount" value={principal} onChange={setPrincipal} suffix="₹"/>
          <Field label="Annual interest" value={rate} onChange={setRate} suffix="%"/>
          <Field label="Tenure" value={months} onChange={setMonths} suffix="months"/>
          <div className="field"><Label>Interest method</Label><div className="segmented">
            <Button type="button" variant={method === "reducing" ? "default" : "outline"} onClick={() => setMethod("reducing")}>Reducing</Button>
            <Button type="button" variant={method === "flat" ? "default" : "outline"} onClick={() => setMethod("flat")}>Flat</Button>
          </div></div>
        </div>
        <div className="result-hero"><span>Estimated monthly EMI</span><strong>{money(calc.emi)}</strong><small>{method === "reducing" ? "Interest falls with the outstanding principal" : "Interest remains based on the original principal"}</small></div>
        <div className="metrics"><Metric label="Principal" value={money(calc.p)}/><Metric label="Total interest" value={money(calc.interest)} tone="warn"/><Metric label="Total repayment" value={money(calc.total)}/></div>
        <Button className="schedule-button" variant="outline" onClick={() => setShowSchedule(!showSchedule)}>Full principal–interest schedule <ChevronDown className={showSchedule ? "rotate" : ""} size={18}/></Button>
        {showSchedule && <div className="schedule"><div className="schedule-head"><span>Month</span><span>EMI</span><span>Interest</span><span>Principal</span><span>Balance</span></div>{calc.rows.map(row => <div className="schedule-row" key={row.month}><b>{row.month}</b><span>{money(row.payment)}</span><span className="interest">{money(row.interest)}</span><span className="principal">{money(row.principal)}</span><span>{money(row.balance)}</span></div>)}</div>}
      </TabsContent>

      <TabsContent value="audit" className="panel">
        <div className="panel-heading"><div><span>02</span><h3>Quotation investigator</h3></div><p>Enter exactly what the lender gives you</p></div>
        <div className="form-grid">
          <Field label="Loan amount stated" value={quotePrincipal} onChange={setQuotePrincipal} suffix="₹"/>
          <Field label="Interest stated" value={quoteRate} onChange={setQuoteRate} suffix="%"/>
          <Field label="Tenure" value={quoteMonths} onChange={setQuoteMonths} suffix="months"/>
          <Field label="Exact EMI quoted" value={quoteEmi} onChange={setQuoteEmi} suffix="₹"/>
        </div>
        <div className="subhead">Charges paid or deducted before disbursement</div>
        <div className="form-grid">
          <Field label="Processing + GST" value={processing} onChange={setProcessing} suffix="₹"/>
          <Field label="Documentation + GST" value={documentation} onChange={setDocumentation} suffix="₹"/>
          <Field label="Mandatory insurance" value={insurance} onChange={setInsurance} suffix="₹"/>
          <Field label="Other compulsory charges" value={other} onChange={setOther} suffix="₹"/>
        </div>
        <div className={"verdict " + (audit.flags.length ? "warning" : "clear")}>{audit.flags.length ? <AlertTriangle/> : <BadgeCheck/>}<div><span>FORMULA RESULT</span><strong>{audit.likely}</strong></div></div>
        <div className="metrics audit-metrics">
          <Metric label="Expected EMI: stated reducing rate" value={money(audit.expectedReducing)} tone="good"/>
          <Metric label="Expected EMI: stated flat rate" value={money(audit.expectedFlat)} tone="warn"/>
          <Metric label="Rate implied by quoted EMI" value={audit.emi ? audit.realRate.toFixed(2) + "%" : "—"}/>
          <Metric label="Estimated APR after charges" value={audit.emi ? audit.apr.toFixed(2) + "%" : "—"}/>
          <Metric label="Total of all EMIs" value={audit.emi ? money(audit.total) : "—"}/>
          <Metric label="Possible extra financed amount" value={audit.emi ? money(Math.max(0, audit.unexplained)) : "—"} tone={audit.unexplained > 100 ? "warn" : ""}/>
        </div>
        <div className="flags"><h4>What needs attention</h4>{!audit.emi && <p>Enter the exact EMI from the quotation to reverse-calculate the loan.</p>}{audit.flags.map((flag,i) => <div key={i}><AlertTriangle size={16}/><p>{flag}</p></div>)}{audit.emi && !audit.flags.length && <div className="ok"><BadgeCheck size={16}/><p>No mathematical mismatch found. Still verify the official KFS.</p></div>}</div>
        <p className="fine-print">APR is estimated assuming entered charges are paid upfront or deducted from the sanctioned amount. The official KFS remains authoritative.</p>
      </TabsContent>

      <TabsContent value="rules" className="panel">
        <div className="panel-heading"><div><span>03</span><h3>Signing checklist</h3></div><p>Evidence to collect before disbursement</p></div>
        <div className="rule-card featured"><ShieldCheck/><div><span>SUNDARAM METHOD</span><h4>Outstanding principal at monthly rests</h4><p>Sundaram’s published terms say Customer IRR is applied to outstanding principal at monthly rests: a reducing-balance structure.</p></div></div>
        <div className="rule-grid">
          <article><span>RBI KFS</span><h4>Complete price label</h4><p>Must show annual rate, APR, EMI, charges and amortisation schedule.</p></article>
          <article><span>RATE RANGE</span><h4>7%–20% indicative</h4><p>Sundaram’s published annualised car-loan range. A stated 6.5% needs written clarification.</p></article>
          <article><span>UNLISTED FEES</span><h4>Ask before paying</h4><p>An undisclosed fee cannot be added later without explicit consent.</p></article>
          <article><span>THIRD-PARTY COSTS</span><h4>Receipts required</h4><p>Insurance and similar collected charges should be separately disclosed.</p></article>
        </div>
        <div className="checklist"><h4>Collect these seven items</h4>{["Official sanction letter","Key Facts Statement (KFS)","Customer IRR and calculation method","APR computation sheet","Complete 60-month amortisation schedule","All fees with GST and third-party receipts","Part-payment and foreclosure terms"].map((item,i)=><label key={item}><input type="checkbox"/><span>{String(i+1).padStart(2,"0")}</span>{item}</label>)}</div>
        <div className="sources"><h4>Official references</h4><a href="https://www.sundaramfinance.in/assets/app_docs/termsandconditions.pdf" target="_blank" rel="noreferrer">Sundaram Finance — Loan terms</a><a href="https://sundaramfinance.in/fair-practices-code" target="_blank" rel="noreferrer">Sundaram Finance — Rate policy</a><a href="https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12550" target="_blank" rel="noreferrer">Reserve Bank of India — KFS rules</a></div>
        <p className="fine-print">Independent personal calculator—not an official Sundaram Finance or RBI app. Rules may change; verify the latest KFS before signing.</p>
      </TabsContent>
    </Tabs>
  </main>;
}

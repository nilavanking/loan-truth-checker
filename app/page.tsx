"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Calculator, Check, ChevronDown, FileCheck2, IndianRupee, Printer, ScanLine, Scale, SearchCheck, Share2, ShieldCheck, ShieldEllipsis, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentAudit } from "@/app/document-audit";
import { ApprovalGate } from "@/app/approval-gate";

type Method = "reducing" | "flat";
type Rest = "monthly" | "annual";
type PayFrequency = "monthly" | "annual";
type ScheduleView = "monthly" | "yearly";
const INR0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const INR2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: number) => INR0.format(Number.isFinite(v) ? v : 0);
const money2 = (v: number) => INR2.format(Number.isFinite(v) ? v : 0);
const num = (v: string) => Math.max(0, Number(v) || 0);

function reducingEmi(p: number, annual: number, months: number) {
  if (!p || !months) return 0;
  const r = annual / 1200;
  return r ? p * r * (1 + r) ** months / ((1 + r) ** months - 1) : p / months;
}
function flatEmi(p: number, annual: number, months: number) {
  return p && months ? (p + p * annual / 100 * months / 12) / months : 0;
}
function annualPayment(p: number, annual: number, years: number) {
  if (!p || !years) return 0;
  const r = annual / 100;
  return r ? p * r * (1 + r) ** years / ((1 + r) ** years - 1) : p / years;
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
function monthlySchedule(p: number, annual: number, months: number, method: Method) {
  const emi = method === "reducing" ? reducingEmi(p, annual, months) : flatEmi(p, annual, months);
  const rows = []; let balance = p;
  const flatInterest = p * annual / 1200;
  for (let month = 1; month <= months; month++) {
    const opening = balance;
    const interest = method === "reducing" ? opening * annual / 1200 : flatInterest;
    const principal = month === months ? opening : Math.min(opening, emi - interest);
    balance = Math.max(0, opening - principal);
    rows.push({ month, opening, payment: month === months ? principal + interest : emi, interest, principal, balance });
  }
  return rows;
}
function yearlySchedule(p: number, annual: number, years: number) {
  const payment = annualPayment(p, annual, years);
  const rows = []; let balance = p;
  for (let year = 1; year <= years; year++) {
    const opening = balance;
    const interest = opening * annual / 100;
    const principal = year === years ? opening : payment - interest;
    balance = Math.max(0, opening - principal);
    rows.push({ year, opening, payment: year === years ? principal + interest : payment, interest, principal, balance });
  }
  return rows;
}
function yearlySummary(rows: ReturnType<typeof monthlySchedule>) {
  const out = [];
  for (let start = 0; start < rows.length; start += 12) {
    const group = rows.slice(start, start + 12);
    out.push({ year: Math.floor(start / 12) + 1, opening: group[0]?.opening || 0, payment: group.reduce((s,r)=>s+r.payment,0), interest: group.reduce((s,r)=>s+r.interest,0), principal: group.reduce((s,r)=>s+r.principal,0), balance: group.at(-1)?.balance || 0 });
  }
  return out;
}
function remainingAfterPrepay(balance: number, annual: number, emi: number) {
  if (balance <= 0 || emi <= 0) return { months: 0, interest: 0 };
  const r = annual / 1200; let b = balance, months = 0, interest = 0;
  while (b > .01 && months < 600) {
    const i = b * r, principal = Math.min(b, emi - i);
    if (principal <= 0) return { months: 600, interest: Infinity };
    interest += i; b -= principal; months++;
  }
  return { months, interest };
}

function Field({ label, value, onChange, suffix, type = "decimal" }: { label:string; value:string; onChange:(v:string)=>void; suffix:string; type?:"decimal"|"date" }) {
  return <div className="field"><Label>{label}</Label><div className="input-wrap"><Input type={type === "date" ? "date" : "text"} inputMode={type === "date" ? undefined : "decimal"} value={value} onChange={e=>onChange(type === "date" ? e.target.value : e.target.value.replace(/[^0-9.]/g,""))} aria-label={label}/>{suffix && <span>{suffix}</span>}</div></div>;
}
function Choice({ active, onClick, children, recommended }: { active:boolean; onClick:()=>void; children:React.ReactNode; recommended?:boolean }) {
  return <Button type="button" variant="outline" className={"choice "+(active?"active":"")} onClick={onClick} aria-pressed={active}>{active&&<Check size={15}/>}<span>{children}</span>{recommended&&<small>Recommended</small>}</Button>;
}
function Metric({ label, value, tone="" }: { label:string; value:string; tone?:string }) {
  return <div className={"metric "+tone}><span>{label}</span><strong>{value}</strong></div>;
}
function ScheduleTable({ rows, yearly }: { rows:Array<{month?:number;year?:number;opening:number;payment:number;interest:number;principal:number;balance:number}>; yearly:boolean }) {
  return <div className="schedule"><div className="schedule-head"><span>{yearly?"Year":"Month"}</span><span>Payment</span><span>Interest</span><span>Principal</span><span>Balance</span></div>{rows.map((r,i)=><div className="schedule-row" key={i}><b>{yearly?r.year:r.month}</b><span>{money(r.payment)}</span><span className="interest">{money(r.interest)}</span><span className="principal">{money(r.principal)}</span><span>{money(r.balance)}</span></div>)}</div>;
}

export default function Home() {
  const [principal,setPrincipal]=useState("611000"), [rate,setRate]=useState("6.5"), [months,setMonths]=useState("60");
  const [method,setMethod]=useState<Method>("reducing"), [rest,setRest]=useState<Rest>("monthly"), [payFrequency,setPayFrequency]=useState<PayFrequency>("monthly");
  const [scheduleView,setScheduleView]=useState<ScheduleView>("monthly"), [showSchedule,setShowSchedule]=useState(false);
  const [quotePrincipal,setQuotePrincipal]=useState("611000"), [quoteRate,setQuoteRate]=useState("6.5"), [quoteMonths,setQuoteMonths]=useState("60"), [quoteEmi,setQuoteEmi]=useState("");
  const [processing,setProcessing]=useState("0"), [documentation,setDocumentation]=useState("0"), [insurance,setInsurance]=useState("0"), [other,setOther]=useState("0"), [advanceEmi,setAdvanceEmi]=useState("0");
  const [disbursalDate,setDisbursalDate]=useState(""), [firstEmiDate,setFirstEmiDate]=useState("");
  const [prepayMonth,setPrepayMonth]=useState("12"), [prepayAmount,setPrepayAmount]=useState("100000"), [chargeRate,setChargeRate]=useState("5"), [chargeGst,setChargeGst]=useState("18");

  const base=useMemo(()=>{
    const p=num(principal),r=num(rate),n=Math.max(1,Math.round(num(months))),years=Math.max(1,Math.ceil(n/12));
    const monthlyRows=monthlySchedule(p,r,n,method),annualRows=yearlySchedule(p,r,years),annualDue=annualRows[0]?.payment||0;
    const isAnnualRest=method==="reducing"&&rest==="annual";
    const displayPayment=isAnnualRest?(payFrequency==="monthly"?annualDue/12:annualDue):(monthlyRows[0]?.payment||0);
    const total=isAnnualRest?annualRows.reduce((s,x)=>s+x.payment,0):monthlyRows.reduce((s,x)=>s+x.payment,0);
    return {p,r,n,years,monthlyRows,annualRows,displayPayment,total,interest:total-p,isAnnualRest};
  },[principal,rate,months,method,rest,payFrequency]);

  const comparisons=useMemo(()=>{
    const p=num(principal),r=num(rate),n=Math.max(1,Math.round(num(months))),years=Math.max(1,Math.ceil(n/12));
    const monthly=monthlySchedule(p,r,n,"reducing"),flat=monthlySchedule(p,r,n,"flat"),annual=yearlySchedule(p,r,years);
    const pack=(label:string,payment:number,total:number)=>({label,payment,total,interest:total-p});
    return [pack("Monthly-rest reducing",monthly[0]?.payment||0,monthly.reduce((s,x)=>s+x.payment,0)),pack("Annual-rest reducing",(annual[0]?.payment||0)/12,annual.reduce((s,x)=>s+x.payment,0)),pack("Flat rate",flat[0]?.payment||0,flat.reduce((s,x)=>s+x.payment,0))];
  },[principal,rate,months]);
  const cheapestInterest=Math.min(...comparisons.map(x=>x.interest)),maxTotal=Math.max(...comparisons.map(x=>x.total),1);

  const audit=useMemo(()=>{
    const p=num(quotePrincipal),stated=num(quoteRate),n=Math.max(1,Math.round(num(quoteMonths))),years=Math.max(1,Math.ceil(n/12)),emi=num(quoteEmi);
    const fees=num(processing)+num(documentation)+num(insurance)+num(other)+num(advanceEmi);
    const expectedMonthly=reducingEmi(p,stated,n),expectedFlat=flatEmi(p,stated,n),expectedAnnual=annualPayment(p,stated,years)/12;
    const candidates=[{name:"monthly-rest reducing",value:expectedMonthly},{name:"annual-rest estimate",value:expectedAnnual},{name:"flat-rate pricing",value:expectedFlat}].sort((a,b)=>Math.abs(emi-a.value)-Math.abs(emi-b.value));
    const realRate=impliedRate(p,emi,n),unexplained=impliedPrincipal(emi,stated,n)-p,apr=impliedRate(Math.max(1,p-fees),emi,n);
    let brokenDays=0;
    if(disbursalDate&&firstEmiDate){const days=(new Date(firstEmiDate).getTime()-new Date(disbursalDate).getTime())/86400000;brokenDays=Math.max(0,Math.round(days-30));}
    const brokenInterest=p*stated/100/365*brokenDays,flags:string[]=[];
    if(stated&&stated<7)flags.push("The stated rate is below Sundaram’s published indicative 7%–20% annualised car-loan range. Obtain written confirmation.");
    if(emi&&candidates[0].name!=="monthly-rest reducing")flags.push("The quoted EMI is closest to "+candidates[0].name+", not Sundaram’s standard monthly-rest result.");
    if(emi&&unexplained>100)flags.push("The EMI behaves as if approximately "+money(unexplained)+" extra principal was financed.");
    if(emi&&realRate>stated+.1)flags.push("The quoted EMI implies approximately "+realRate.toFixed(2)+"% monthly-rest interest.");
    if(fees&&emi)flags.push("Compulsory/upfront charges raise estimated APR to approximately "+apr.toFixed(2)+"%.");
    if(brokenInterest>1)flags.push("Dates indicate about "+brokenDays+" extra days and estimated broken-period interest of "+money(brokenInterest)+".");
    if(num(processing)>p*.05)flags.push("Processing fee exceeds Sundaram’s published maximum of 5% before GST.");
    if(num(documentation)>5500)flags.push("Documentation charge exceeds Sundaram’s published maximum of ₹5,500 before GST.");
    return {emi,expectedMonthly,expectedAnnual,expectedFlat,realRate,unexplained,apr,total:emi*n,likely:emi?candidates[0].name:"Enter the exact EMI",flags,brokenInterest};
  },[quotePrincipal,quoteRate,quoteMonths,quoteEmi,processing,documentation,insurance,other,advanceEmi,disbursalDate,firstEmiDate]);

  const prepay=useMemo(()=>{
    const rows=monthlySchedule(num(principal),num(rate),Math.max(1,Math.round(num(months))),"reducing");
    const at=Math.min(rows.length,Math.max(0,Math.round(num(prepayMonth)))),balance=at?rows[at-1].balance:num(principal);
    const remainingOriginalInterest=rows.slice(at).reduce((s,x)=>s+x.interest,0),extra=Math.min(balance,num(prepayAmount));
    const fee=extra*num(chargeRate)/100,gst=fee*num(chargeGst)/100,newBalance=Math.max(0,balance-extra),newPlan=remainingAfterPrepay(newBalance,num(rate),rows[0]?.payment||0);
    const interestSaved=Math.max(0,remainingOriginalInterest-newPlan.interest),closureFee=balance*num(chargeRate)/100,closureGst=closureFee*num(chargeGst)/100;
    return {balance,newBalance,charge:fee+gst,newMonths:newPlan.months,monthsSaved:Math.max(0,rows.length-at-newPlan.months),interestSaved,netBenefit:interestSaved-fee-gst,settlement:balance+closureFee+closureGst,closureInterestSaved:remainingOriginalInterest,closureNet:remainingOriginalInterest-closureFee-closureGst};
  },[principal,rate,months,prepayMonth,prepayAmount,chargeRate,chargeGst]);

  const summaryText="Loan Truth Checker\\nLoan: "+money(num(principal))+" | Rate: "+num(rate)+"% | Tenure: "+num(months)+" months\\nMonthly-rest reducing EMI: "+money2(comparisons[0].payment)+"\\nTotal interest: "+money(comparisons[0].interest)+"\\nFlat EMI: "+money2(comparisons[2].payment)+"\\nFlat total interest: "+money(comparisons[2].interest)+"\\nSaving with monthly reducing vs flat: "+money(comparisons[2].interest-comparisons[0].interest)+"\\nVerify the official KFS before signing.";
  const share=async()=>{if(navigator.share)await navigator.share({title:"Loan Truth Checker",text:summaryText});else await navigator.clipboard.writeText(summaryText);};
  const scheduleRows=base.isAnnualRest?base.annualRows:scheduleView==="yearly"?yearlySummary(base.monthlyRows):base.monthlyRows;
  const scheduleIsYearly=base.isAnnualRest||scheduleView==="yearly";

  return <main>
    <header className="topbar"><div className="brand-mark"><ShieldCheck size={22}/></div><div><p>PERSONAL FINANCE TOOL</p><h1>Loan Truth Checker</h1></div><span className="private">Private</span></header>
    <section className="intro"><div><span className="eyebrow">SUNDARAM + RBI CHECK</span><h2>Every rupee, accounted for.</h2><p>Compare formulas, reconstruct a quotation and expose charges before signing.</p></div><div className="trust"><BadgeCheck size={18}/><span>Rules snapshot<br/><strong>28 Aug 2026</strong></span></div></section>
    <Tabs defaultValue="calculate" className="workspace">
      <TabsList className="tab-list"><TabsTrigger value="calculate"><Calculator size={16}/>Calculate</TabsTrigger><TabsTrigger value="compare"><Scale size={16}/>Compare</TabsTrigger><TabsTrigger value="scan"><ScanLine size={16}/>Scan KFS</TabsTrigger><TabsTrigger value="gate"><ShieldEllipsis size={16}/>Approval gate</TabsTrigger><TabsTrigger value="audit"><SearchCheck size={16}/>Check quote</TabsTrigger><TabsTrigger value="prepay"><TrendingDown size={16}/>Prepay</TabsTrigger><TabsTrigger value="rules"><FileCheck2 size={16}/>Rules</TabsTrigger></TabsList>

      <TabsContent value="calculate" className="panel">
        <div className="panel-heading"><div><span>01</span><h3>EMI calculator</h3></div><p>Flat, monthly rest and annual rest</p></div>
        <div className="form-grid three"><Field label="Loan amount" value={principal} onChange={setPrincipal} suffix="₹"/><Field label="Annual interest rate" value={rate} onChange={setRate} suffix="% p.a."/><Field label="Tenure" value={months} onChange={setMonths} suffix="months"/></div>
        <div className="option-block"><Label>Interest method</Label><div className="choice-grid two"><Choice active={method==="reducing"} onClick={()=>setMethod("reducing")} recommended>Reducing balance</Choice><Choice active={method==="flat"} onClick={()=>setMethod("flat")}>Flat rate</Choice></div></div>
        {method==="reducing"&&<div className="option-block"><Label>Interest rest period</Label><div className="choice-grid two"><Choice active={rest==="monthly"} onClick={()=>setRest("monthly")} recommended>Monthly rest — Sundaram car-loan method</Choice><Choice active={rest==="annual"} onClick={()=>setRest("annual")}>Annual rest — comparison estimate</Choice></div></div>}
        {method==="reducing"&&rest==="annual"&&<><div className="option-block"><Label>Payment frequency</Label><div className="choice-grid two"><Choice active={payFrequency==="monthly"} onClick={()=>setPayFrequency("monthly")}>Monthly payments</Choice><Choice active={payFrequency==="annual"} onClick={()=>setPayFrequency("annual")}>One annual payment</Choice></div></div><div className="notice"><AlertTriangle size={17}/><p>Annual-rest contracts differ. This estimate recalculates principal once each year. Confirm the lender’s KFS formula.</p></div></>}
        <div className="result-hero"><span>{base.isAnnualRest&&payFrequency==="annual"?"Estimated annual instalment":"Estimated monthly EMI"}</span><strong>{money2(base.displayPayment)}</strong><small>{method==="flat"?"Interest remains based on original principal":rest==="monthly"?"Outstanding principal recalculated every month":"Outstanding principal recalculated yearly"}</small></div>
        <div className="metrics"><Metric label="Principal" value={money(base.p)}/><Metric label="Total interest" value={money(base.interest)} tone="warn"/><Metric label="Total repayment" value={money(base.total)}/></div>
        {rest==="annual"&&method==="reducing"&&num(months)%12!==0&&<div className="notice"><AlertTriangle size={17}/><p>Annual rest needs whole years. Estimate uses {base.years} years ({base.years*12} months).</p></div>}
        {!base.isAnnualRest&&<div className="view-switch"><span>Schedule display</span><div><Choice active={scheduleView==="monthly"} onClick={()=>setScheduleView("monthly")}>Monthly</Choice><Choice active={scheduleView==="yearly"} onClick={()=>setScheduleView("yearly")}>Yearly summary</Choice></div></div>}
        <Button className="schedule-button" variant="outline" onClick={()=>setShowSchedule(!showSchedule)}>Principal–interest working <ChevronDown className={showSchedule?"rotate":""} size={18}/></Button>
        {showSchedule&&<ScheduleTable rows={scheduleRows} yearly={scheduleIsYearly}/>}
      </TabsContent>

      <TabsContent value="compare" className="panel">
        <div className="panel-heading"><div><span>02</span><h3>Method comparison</h3></div><p>Same loan, three different workings</p></div>
        <div className="comparison-grid">{comparisons.map((x,i)=><article className={i===0?"best":""} key={x.label}><div className="compare-title">{i===0&&<BadgeCheck size={17}/>}<h4>{x.label}</h4>{i===0&&<small>Sundaram method</small>}</div><strong>{money2(x.payment)}<small>/month</small></strong><dl><div><dt>Total interest</dt><dd>{money(x.interest)}</dd></div><div><dt>Total repayment</dt><dd>{money(x.total)}</dd></div><div><dt>Extra vs cheapest</dt><dd>{money(x.interest-cheapestInterest)}</dd></div></dl><div className="bar"><i style={{width:(x.total/maxTotal*100)+"%"}}/></div></article>)}</div>
        <div className="saving-card"><IndianRupee/><div><span>SAVING WITH MONTHLY REST VS FLAT</span><strong>{money(comparisons[2].interest-comparisons[0].interest)}</strong><p>{((comparisons[2].interest-comparisons[0].interest)/Math.max(1,comparisons[2].interest)*100).toFixed(1)}% less interest</p></div></div>
        <div className="difference-table"><div><span>Comparison</span><b>EMI difference</b><b>Interest difference</b><b>Total difference</b></div>{comparisons.slice(1).map(x=><div key={x.label}><span>{x.label} vs monthly rest</span><b>{money(x.payment-comparisons[0].payment)}</b><b>{money(x.interest-comparisons[0].interest)}</b><b>{money(x.total-comparisons[0].total)}</b></div>)}</div>
        <div className="action-row"><Button onClick={share}><Share2 size={16}/>Share summary</Button><Button variant="outline" onClick={()=>window.print()}><Printer size={16}/>Save as PDF</Button></div>
      </TabsContent>

      <TabsContent value="scan" className="panel scan-panel">
        <DocumentAudit />
      </TabsContent>

      <TabsContent value="gate" className="panel gate-panel">
        <ApprovalGate />
      </TabsContent>

      <TabsContent value="audit" className="panel">
        <div className="panel-heading"><div><span>05</span><h3>Quotation investigator</h3></div><p>Enter exactly what the lender gives you</p></div>
        <div className="form-grid"><Field label="Loan amount stated" value={quotePrincipal} onChange={setQuotePrincipal} suffix="₹"/><Field label="Interest stated" value={quoteRate} onChange={setQuoteRate} suffix="% p.a."/><Field label="Tenure" value={quoteMonths} onChange={setQuoteMonths} suffix="months"/><Field label="Exact EMI quoted" value={quoteEmi} onChange={setQuoteEmi} suffix="₹"/></div>
        <div className="subhead">Compulsory and deducted charges</div>
        <div className="form-grid"><Field label="Processing + GST" value={processing} onChange={setProcessing} suffix="₹"/><Field label="Documentation + GST" value={documentation} onChange={setDocumentation} suffix="₹"/><Field label="Credit-life insurance" value={insurance} onChange={setInsurance} suffix="₹"/><Field label="Other compulsory charges" value={other} onChange={setOther} suffix="₹"/><Field label="Advance EMI deducted" value={advanceEmi} onChange={setAdvanceEmi} suffix="₹"/></div>
        <div className="subhead">Broken-period interest check</div><div className="form-grid two-cols"><Field label="Disbursal date" value={disbursalDate} onChange={setDisbursalDate} suffix="" type="date"/><Field label="First EMI date" value={firstEmiDate} onChange={setFirstEmiDate} suffix="" type="date"/></div>
        <div className={"verdict "+(audit.flags.length?"warning":"clear")}>{audit.flags.length?<AlertTriangle/>:<BadgeCheck/>}<div><span>CLOSEST FORMULA</span><strong>{audit.likely}</strong></div></div>
        <div className="metrics audit-metrics"><Metric label="Monthly-rest expected EMI" value={money2(audit.expectedMonthly)} tone="good"/><Metric label="Annual-rest monthly estimate" value={money2(audit.expectedAnnual)}/><Metric label="Flat expected EMI" value={money2(audit.expectedFlat)} tone="warn"/><Metric label="Rate implied by EMI" value={audit.emi?audit.realRate.toFixed(2)+"%":"—"}/><Metric label="APR after charges" value={audit.emi?audit.apr.toFixed(2)+"%":"—"}/><Metric label="Possible extra financed" value={audit.emi?money(Math.max(0,audit.unexplained)):"—"} tone={audit.unexplained>100?"warn":""}/><Metric label="All EMIs total" value={audit.emi?money(audit.total):"—"}/><Metric label="Broken-period interest" value={money(audit.brokenInterest)}/></div>
        <div className="flags"><h4>What needs attention</h4>{!audit.emi&&<p>Enter the exact EMI to reverse-calculate the quotation.</p>}{audit.flags.map((x,i)=><div key={i}><AlertTriangle size={16}/><p>{x}</p></div>)}{audit.emi&&!audit.flags.length&&<div className="ok"><BadgeCheck size={16}/><p>No mathematical mismatch found. Verify the KFS before signing.</p></div>}</div>
        <p className="fine-print">APR and broken-period figures are estimates. The official KFS and amortisation schedule remain authoritative.</p>
      </TabsContent>

      <TabsContent value="prepay" className="panel">
        <div className="panel-heading"><div><span>06</span><h3>Prepayment and closure</h3></div><p>See the real benefit after charges</p></div>
        <div className="form-grid"><Field label="Payment after EMI number" value={prepayMonth} onChange={setPrepayMonth} suffix="month"/><Field label="Extra principal payment" value={prepayAmount} onChange={setPrepayAmount} suffix="₹"/><Field label="Prepayment charge" value={chargeRate} onChange={setChargeRate} suffix="%"/><Field label="GST on charge" value={chargeGst} onChange={setChargeGst} suffix="%"/></div>
        <div className="subhead">Part-payment result</div><div className="metrics audit-metrics"><Metric label="Balance at selected month" value={money(prepay.balance)}/><Metric label="New principal balance" value={money(prepay.newBalance)}/><Metric label="Charge including GST" value={money(prepay.charge)} tone="warn"/><Metric label="Interest saved" value={money(prepay.interestSaved)} tone="good"/><Metric label="Months saved" value={String(prepay.monthsSaved)}/><Metric label="Net benefit after charge" value={money(prepay.netBenefit)} tone={prepay.netBenefit>=0?"good":"warn"}/></div>
        <div className="subhead">Full closure result</div><div className="closure-card"><div><span>Estimated settlement amount</span><strong>{money(prepay.settlement)}</strong></div><div><span>Future interest avoided</span><strong>{money(prepay.closureInterestSaved)}</strong></div><div><span>Net benefit after closure charge</span><strong>{money(prepay.closureNet)}</strong></div></div>
        <p className="fine-print">Uses monthly-rest reducing schedule and entered charge rates. Obtain Sundaram’s dated settlement statement before paying.</p>
      </TabsContent>

      <TabsContent value="rules" className="panel">
        <div className="panel-heading"><div><span>07</span><h3>Signing checklist</h3></div><p>Evidence required before disbursement</p></div>
        <div className="rule-card featured"><ShieldCheck/><div><span>CONFIRMED SUNDARAM METHOD</span><h4>Outstanding principal at monthly rests</h4><p>Sundaram’s published car-loan terms apply Customer IRR to outstanding principal at monthly rests.</p></div></div>
        <div className="rule-grid"><article><span>RBI KFS</span><h4>Complete price label</h4><p>Annual rate, APR, EMI, charges and amortisation schedule.</p></article><article><span>RATE RANGE</span><h4>7%–20% indicative</h4><p>A stated 6.5% requires written clarification.</p></article><article><span>UNLISTED FEES</span><h4>Consent required</h4><p>An undisclosed fee cannot be added later without explicit consent.</p></article><article><span>THIRD-PARTY COSTS</span><h4>Collect receipts</h4><p>Insurance and similar charges must be separately disclosed.</p></article></div>
        <div className="checklist"><h4>Check before signing</h4>{["Official sanction letter","Key Facts Statement (KFS)","Customer IRR / annualised interest rate","Flat or reducing method stated","Monthly/annual rest period stated","APR computation sheet","Exact EMI and number of instalments","Total interest and total repayment","Complete amortisation schedule","Processing/documentation fees with GST","Insurance and third-party receipts","Advance EMI and broken-period interest","Part-payment and foreclosure terms"].map((item,i)=><label key={item}><input type="checkbox"/><span>{String(i+1).padStart(2,"0")}</span>{item}</label>)}</div>
        <div className="sources"><h4>Official references</h4><a href="https://www.sundaramfinance.in/assets/app_docs/termsandconditions.pdf" target="_blank" rel="noreferrer">Sundaram Finance — Loan terms</a><a href="https://sundaramfinance.in/fair-practices-code" target="_blank" rel="noreferrer">Sundaram Finance — Fair Practices Code and rates</a><a href="https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12550" target="_blank" rel="noreferrer">Reserve Bank of India — KFS rules</a></div>
        <p className="fine-print">Independent personal calculator—not an official Sundaram Finance or RBI application. Verify the latest written documents.</p>
      </TabsContent>
    </Tabs>
  </main>;
}

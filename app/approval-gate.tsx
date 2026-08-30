"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  FileText,
  LoaderCircle,
  MessageCircle,
  Printer,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuditValues, emptyValues, money, numberValue, parseValues } from "@/app/document-audit";
import { calculateEmi, solveReducingRate } from "@/loan-engine";
import type { ChargeTreatment } from "@/loan-engine";

type DocType = "promise" | "kfs" | "sanction" | "dealer" | "schedule" | "insurance" | "receipt";
type OcrConfidence = "high" | "medium" | "low";
type EvidenceDoc = { id: string; type: DocType; name: string; values: AuditValues; extracted: boolean; confirmed: boolean; confidence: Partial<Record<keyof AuditValues, OcrConfidence>> };
type Level = "green" | "amber" | "red";
type GateFinding = { level: Level; title: string; detail: string; action?: string };

const labels: Record<DocType, string> = {
  promise: "Salesperson promise",
  kfs: "Key Facts Statement",
  sanction: "Sanction letter",
  dealer: "Dealer invoice / quotation",
  schedule: "Repayment schedule",
  insurance: "Insurance invoice",
  receipt: "Payment / disbursement receipt",
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankDoc = (type: DocType, name = labels[type], values: Partial<AuditValues> = {}): EvidenceDoc => ({
  id: makeId(), type, name, extracted: false, confirmed: false, confidence: {}, values: { ...emptyValues, ...values },
});

const defaultPromise = blankDoc("promise", "Oral offer — salesperson", {
  loanAmount: "611000", annualRate: "6.5", months: "60", method: "reducing", rest: "monthly",
});

function impliedRate(principal: number, emi: number, months: number) {
  return solveReducingRate(principal, emi, months);
}

async function extractText(file: File, onStatus: (message: string, progress: number) => void) {
  if (file.size > 15 * 1024 * 1024) throw new Error("File exceeds the 15 MB limit");
  if (file.type.startsWith("text/") || /\.(txt|csv)$/i.test(file.name)) return file.text();
  if (file.type.startsWith("image/")) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, { logger: (event) => {
      if (event.status === "recognizing text") onStatus("Reading photo…", Math.round(event.progress * 100));
    }});
    const result = await worker.recognize(file);
    await worker.terminate();
    return result.data.text;
  }
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pageCount = Math.min(pdf.numPages, 12);
    let text = "";
    const weakPages: number[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      onStatus(`Reading PDF page ${pageNumber}/${pageCount}…`, Math.round(pageNumber / pageCount * 60));
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      text += `\n${pageText}`;
      if (pageText.replace(/\s/g, "").length < 60) weakPages.push(pageNumber);
    }
    if (weakPages.length && weakPages.length <= 4) {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, { logger: (event) => {
        if (event.status === "recognizing text") onStatus("Scanning image-only page…", Math.round(60 + event.progress * 38));
      }});
      for (const pageNumber of weakPages) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        text += `\n${(await worker.recognize(canvas)).data.text}`;
      }
      await worker.terminate();
    }
    return text;
  }
  throw new Error("Unsupported document type");
}

function MiniField({ label, value, suffix, onChange }: { label: string; value: string; suffix: string; onChange: (value: string) => void }) {
  return <div className="field"><Label>{label}</Label><div className="input-shell"><Input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}/><span>{suffix}</span></div></div>;
}

export function ApprovalGate() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<EvidenceDoc[]>([defaultPromise]);
  const [uploadType, setUploadType] = useState<DocType>("kfs");
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("Select a document type, then upload its photo or PDF.");
  const [progress, setProgress] = useState(0);
  const [dealerBalance, setDealerBalance] = useState("611000");
  const [actualDealerReceipt, setActualDealerReceipt] = useState("");
  const [advanceEmi, setAdvanceEmi] = useState("0");
  const [brokenPeriod, setBrokenPeriod] = useState("0");
  const [otherDeduction, setOtherDeduction] = useState("0");
  const [chargeTreatments, setChargeTreatments] = useState<Record<string, ChargeTreatment>>({ processingFee: "unknown", documentationFee: "unknown", insurance: "unknown", advanceEmi: "unknown", brokenPeriod: "unknown", otherDeduction: "unknown" });

  const updateDoc = (id: string, update: Partial<EvidenceDoc>) => setDocuments((current) => current.map((doc) => doc.id === id ? { ...doc, ...update } : doc));
  const updateValue = (id: string, field: keyof AuditValues, value: string) => setDocuments((current) => current.map((doc) => doc.id === id ? { ...doc, values: { ...doc.values, [field]: value } } : doc));

  const processFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setProgress(2); setUploadStatus("Opening the document on this device…");
    try {
      const text = await extractText(file, (message, value) => { setUploadStatus(message); setProgress(value); });
      if (text.trim().length < 20) throw new Error("No readable text found");
      const values = parseValues(text);
      const detected = Object.entries(values).filter(([key, value]) => !["method", "rest"].includes(key) && value).length;
      const confidence = Object.fromEntries(Object.entries(values).filter(([, value]) => value && value !== "unknown").map(([key]) => [key, "medium"])) as EvidenceDoc["confidence"];
      setDocuments((current) => [...current, { id: makeId(), type: uploadType, name: file.name, values, extracted: true, confirmed: false, confidence }]);
      setProgress(100); setUploadStatus(`${labels[uploadType]} added with ${detected} detected figures. Expand it and check every number.`);
    } catch (error) {
      setUploadStatus(`${error instanceof Error ? error.message : "Reading failed"}. Add a manual evidence card instead.`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const evidence = useMemo(() => {
    const byType = (type: DocType) => documents.find((doc) => doc.type === type);
    const promise = byType("promise");
    const kfs = byType("kfs");
    const sanction = byType("sanction");
    const schedule = byType("schedule");
    const authority = kfs || sanction || schedule || promise;
    return { byType, promise, kfs, sanction, schedule, authority };
  }, [documents]);

  const primary = useMemo(() => {
    const values = evidence.authority?.values || emptyValues;
    const basePrincipal = numberValue(values.loanAmount);
    const rate = numberValue(values.annualRate);
    const months = Math.round(numberValue(values.months));
    const amounts: Record<string, number> = { processingFee: numberValue(values.processingFee), documentationFee: numberValue(values.documentationFee), insurance: numberValue(values.insurance), advanceEmi: numberValue(advanceEmi), brokenPeriod: numberValue(brokenPeriod), otherDeduction: numberValue(otherDeduction) };
    const sumTreatment = (treatment: ChargeTreatment) => Object.entries(amounts).filter(([key]) => chargeTreatments[key] === treatment).reduce((sum, [, amount]) => sum + amount, 0);
    const financed = sumTreatment("financed"), deductions = sumTreatment("deducted"), upfront = sumTreatment("upfront");
    const principal = basePrincipal + financed;
    const method = values.method === "flat" || values.method === "reducing" ? values.method : null;
    const calculatedEmi = method ? calculateEmi(principal, rate, months, method) : 0;
    const emi = numberValue(values.emi) || calculatedEmi;
    const charges = financed + deductions + upfront;
    const netDisbursal = basePrincipal - deductions;
    const totalEmis = emi * months;
    return { values, basePrincipal, principal, rate, months, method, emi, calculatedEmi, financed, deductions, upfront, charges, netDisbursal, totalEmis, totalCost: totalEmis + upfront, implied: impliedRate(principal, emi, months) };
  }, [advanceEmi, brokenPeriod, chargeTreatments, evidence.authority, otherDeduction]);

  const findings = useMemo<GateFinding[]>(() => {
    const list: GateFinding[] = [];
    const { promise, kfs, sanction, schedule } = evidence;
    if (!kfs) list.push({ level: "amber", title: "KFS not added", detail: "The loan cannot receive final approval without the official KFS.", action: "Request the signed KFS before disbursement." });
    if (!sanction) list.push({ level: "amber", title: "Sanction letter not added", detail: "The lender’s sanctioned amount and conditions are not independently available.", action: "Upload the sanction letter." });
    if (!schedule) list.push({ level: "amber", title: "Repayment schedule missing", detail: "Principal and interest distribution cannot be checked across all instalments.", action: "Request the complete amortisation schedule." });

    const core = [promise, kfs, sanction, schedule].filter(Boolean) as EvidenceDoc[];
    const lowConfidenceFields = core.flatMap((doc) => Object.entries(doc.confidence).filter(([, confidence]) => confidence === "low").map(([field]) => `${labels[doc.type]}: ${field}`));
    if (lowConfidenceFields.length) list.push({ level: "amber", title: "Low-confidence OCR fields", detail: lowConfidenceFields.join(" · "), action: "Check each value against the original document before relying on the result." });
    const compareField = (field: keyof AuditValues, name: string, tolerance: number, format: (value: number) => string) => {
      const entries = core.map((doc) => ({ doc, value: numberValue(String(doc.values[field])) })).filter((entry) => entry.value > 0);
      if (entries.length < 2) return;
      const minimum = Math.min(...entries.map((entry) => entry.value));
      const maximum = Math.max(...entries.map((entry) => entry.value));
      if (maximum - minimum > tolerance) list.push({
        level: "red", title: `${name} differs between documents`,
        detail: entries.map((entry) => `${labels[entry.doc.type]}: ${format(entry.value)}`).join(" · "),
        action: `Obtain a corrected written ${name.toLowerCase()} before signing.`,
      });
    };
    compareField("loanAmount", "Loan amount", 100, money);
    compareField("annualRate", "Interest rate", 0.05, (value) => `${value.toFixed(2)}%`);
    compareField("months", "Tenure", 0, (value) => `${value} months`);
    compareField("emi", "EMI", 5, money);

    const kfsDoc = kfs;
    if (kfsDoc) {
      for (const [field, label] of [["processingFee", "Processing fee"], ["documentationFee", "Documentation fee"], ["insurance", "Insurance"]] as Array<[keyof AuditValues, string]>) {
        const kfsAmount = numberValue(String(kfsDoc.values[field]));
        const later = [sanction, evidence.byType("receipt")].filter(Boolean).map((doc) => ({ doc: doc!, amount: numberValue(String(doc!.values[field])) })).find((entry) => entry.amount > kfsAmount + 5);
        if (later) list.push({ level: kfsDoc.confirmed && later.doc.confirmed ? "red" : "amber", title: "Charge not found in KFS", detail: `${label}: KFS ${money(kfsAmount)}; later ${labels[later.doc.type]} ${money(later.amount)}.`, action: `Ask why ${label.toLowerCase()} first appeared later and request the supporting receipt and corrected disclosure.` });
      }
    }

    if (promise && kfs) {
      const promised = numberValue(promise.values.annualRate), written = numberValue(kfs.values.annualRate);
      if (promised && written && Math.abs(promised - written) > 0.05) list.push({ level: "red", title: "Oral promise is not honoured", detail: `Promised ${promised}% but KFS states ${written}%.`, action: "Ask the salesperson to correct the KFS or withdraw the promise." });
      if (promise.values.method !== "unknown" && kfs.values.method !== "unknown" && promise.values.method !== kfs.values.method) list.push({ level: "red", title: "Interest method changed", detail: `Promised ${promise.values.method}; KFS states ${kfs.values.method}.`, action: "Do not sign until the calculation method is corrected in writing." });
    }

    if (kfs && !kfs.values.apr) list.push({ level: "red", title: "APR missing from KFS", detail: "The complete annual cost could not be identified.", action: "Request a compliant KFS showing APR and its computation." });
    if (kfs && kfs.values.method === "unknown") list.push({ level: "amber", title: "Flat or reducing method unclear", detail: "The KFS extraction does not establish the interest method.", action: "Obtain written confirmation of monthly-rest reducing balance or flat rate." });
    if (kfs && kfs.values.method === "reducing" && kfs.values.rest === "unknown") list.push({ level: "amber", title: "Rest frequency unclear", detail: "Monthly-rest and annual-rest reducing loans produce different costs.", action: "Confirm the rest period in the KFS." });

    if (primary.principal && primary.rate && primary.months && numberValue(primary.values.emi)) {
      if (primary.method) {
        const calculated = calculateEmi(primary.principal, primary.rate, primary.months, primary.method);
        const difference = primary.emi - calculated;
        if (Math.abs(difference) > 5) list.push({ level: "red", title: "Stated EMI fails the formula check", detail: `Stated ${money(primary.emi)}; ${primary.method} calculation ${money(calculated)}; difference ${money(difference)} each month.`, action: "Ask for the lender’s formula and corrected schedule." });
      }
    }

    const receipt = numberValue(actualDealerReceipt);
    const balance = numberValue(dealerBalance);
    if (receipt && Math.abs(receipt - primary.netDisbursal) > 100) list.push({ level: "red", title: "Net disbursement does not reconcile", detail: `Calculated net ${money(primary.netDisbursal)}; dealer received ${money(receipt)}; unexplained difference ${money(receipt - primary.netDisbursal)}.`, action: "Demand an itemised disbursement statement and receipts." });
    if (balance && receipt && Math.abs(balance - receipt) > 100) list.push({ level: "amber", title: "Dealer balance and receipt differ", detail: `Invoice finance balance ${money(balance)}; dealer receipt ${money(receipt)}.`, action: "Confirm who paid or financed the difference." });
    if (!receipt) list.push({ level: "amber", title: "Actual dealer receipt not entered", detail: `Current calculated net disbursal is ${money(primary.netDisbursal)}.`, action: "Enter the lender’s actual amount paid to the dealer." });
    if (numberValue(primary.values.insurance) > 0 && !evidence.byType("insurance")) list.push({ level: "amber", title: "Insurance financed without invoice", detail: `${money(numberValue(primary.values.insurance))} appears in the loan figures, but no insurance invoice is attached.`, action: "Collect the policy and premium receipt." });
    const unknownChargeNames = Object.entries(chargeTreatments).filter(([key, treatment]) => treatment === "unknown" && ({ processingFee: numberValue(primary.values.processingFee), documentationFee: numberValue(primary.values.documentationFee), insurance: numberValue(primary.values.insurance), advanceEmi: numberValue(advanceEmi), brokenPeriod: numberValue(brokenPeriod), otherDeduction: numberValue(otherDeduction) }[key] || 0) > 0).map(([key]) => key);
    if (unknownChargeNames.length) list.push({ level: "amber", title: "Charge treatment not confirmed", detail: `${unknownChargeNames.join(", ")} cannot be safely applied to net disbursement or APR.`, action: "Classify each charge as financed, deducted, paid upfront, or not applicable from written evidence." });

    if (!list.some((finding) => finding.level === "red") && !list.some((finding) => finding.level === "amber")) list.push({ level: "green", title: "All approval gates passed", detail: "The supplied documents and calculations are mutually consistent within rounding tolerance." });
    const unconfirmedDocument = core.some((doc) => doc.type !== "promise" && !doc.confirmed);
    const noConfirmedWrittenEvidence = !core.some((doc) => doc.type !== "promise" && doc.confirmed);
    return unconfirmedDocument || noConfirmedWrittenEvidence
      ? list.map((finding) => finding.level === "red" ? { ...finding, level: "amber" as const, detail: `${finding.detail} The written evidence is not yet user-confirmed against the original document.` } : finding)
      : list;
  }, [actualDealerReceipt, advanceEmi, brokenPeriod, chargeTreatments, dealerBalance, evidence, otherDeduction, primary]);

  const gate: Level = findings.some((finding) => finding.level === "red") ? "red" : findings.some((finding) => finding.level === "amber") ? "amber" : "green";

  const report = useMemo(() => [
    "LOAN TRUTH CHECKER — FINAL APPROVAL GATE",
    `Decision: ${gate.toUpperCase()} — ${gate === "red" ? "DO NOT SIGN / DISBURSE" : gate === "amber" ? "WRITTEN CLARIFICATION REQUIRED" : "MATHEMATICALLY CONSISTENT"}`,
    `Evidence documents: ${documents.length}`,
    `Primary loan: ${money(primary.principal)} at ${primary.rate}% for ${primary.months} months`,
    `EMI: ${money(primary.emi)} · Implied reducing rate: ${primary.implied.toFixed(2)}%`,
    `Total EMIs: ${money(primary.totalEmis)} · Charges/deductions: ${money(primary.charges)}`,
    `Calculated net disbursal: ${money(primary.netDisbursal)} · Dealer receipt: ${actualDealerReceipt ? money(numberValue(actualDealerReceipt)) : "not entered"}`,
    "",
    ...findings.map((finding) => `${finding.level.toUpperCase()}: ${finding.title} — ${finding.detail}${finding.action ? ` ACTION: ${finding.action}` : ""}`),
    "",
    "Independent calculation only. Verify against signed lender and dealer documents.",
  ].join("\n"), [actualDealerReceipt, documents.length, findings, gate, primary]);

  return <section className="gate-workspace">
    <div className={`gate-banner ${gate}`}>
      <div className="gate-light">{gate === "green" ? <CheckCircle2/> : gate === "red" ? <ShieldAlert/> : <AlertTriangle/>}</div>
      <div><span>FINAL APPROVAL GATE</span><h2>{gate === "red" ? "Do not sign or allow disbursement" : gate === "amber" ? "Written clarification required" : "Mathematically consistent"}</h2><p>{findings.filter((finding) => finding.level !== "green").length} issue(s) require attention · {documents.length} evidence document(s) in this case</p></div>
    </div>

    <div className="gate-columns">
      <div className="card evidence-builder">
        <div className="section-kicker"><span>04</span> Multi-document evidence</div>
        <h2>Build the finance case</h2>
        <p className="section-copy">Add each document separately. Only extracted figures remain in this page; the files are not uploaded or stored.</p>
        <div className="upload-composer">
          <div className="field"><Label htmlFor="evidence-type">Document type</Label><select id="evidence-type" value={uploadType} onChange={(event) => setUploadType(event.target.value as DocType)}>{Object.entries(labels).filter(([type]) => type !== "promise").map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select></div>
          <input ref={fileRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv" onChange={(event) => processFile(event.target.files?.[0])}/>
          <Button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Upload size={17}/>} Upload document</Button>
          <Button type="button" variant="outline" onClick={() => setDocuments((current) => [...current, blankDoc(uploadType)])}><FilePlus2 size={17}/> Add manually</Button>
        </div>
        {busy && <div className="scan-progress"><span style={{ width: `${progress}%` }}/></div>}
        <p className="gate-upload-status">{uploadStatus}</p>

        <div className="evidence-stack">
          {documents.map((doc, index) => <details className="evidence-doc" key={doc.id} open={index === 0}>
            <summary><FileText size={17}/><div><strong>{labels[doc.type]}</strong><span>{doc.name} · {doc.extracted ? "Document extracted" : "Manual evidence"}</span></div><ChevronDown size={17}/></summary>
            <div className="evidence-doc-body">
              <div className="field"><Label>Evidence name</Label><Input value={doc.name} onChange={(event) => updateDoc(doc.id, { name: event.target.value })}/></div>
              <div className="evidence-field-grid">
                <MiniField label="Loan amount" value={doc.values.loanAmount} suffix="₹" onChange={(value) => updateValue(doc.id, "loanAmount", value)}/>
                <MiniField label="Rate" value={doc.values.annualRate} suffix="%" onChange={(value) => updateValue(doc.id, "annualRate", value)}/>
                <MiniField label="APR" value={doc.values.apr} suffix="%" onChange={(value) => updateValue(doc.id, "apr", value)}/>
                <MiniField label="Tenure" value={doc.values.months} suffix="months" onChange={(value) => updateValue(doc.id, "months", value)}/>
                <MiniField label="EMI" value={doc.values.emi} suffix="₹" onChange={(value) => updateValue(doc.id, "emi", value)}/>
                <MiniField label="Total repayment" value={doc.values.totalRepayment} suffix="₹" onChange={(value) => updateValue(doc.id, "totalRepayment", value)}/>
                <MiniField label="Processing fee" value={doc.values.processingFee} suffix="₹" onChange={(value) => updateValue(doc.id, "processingFee", value)}/>
                <MiniField label="Documentation" value={doc.values.documentationFee} suffix="₹" onChange={(value) => updateValue(doc.id, "documentationFee", value)}/>
                <MiniField label="Loan insurance" value={doc.values.insurance} suffix="₹" onChange={(value) => updateValue(doc.id, "insurance", value)}/>
              </div>
              <div className="method-edit-grid"><div className="field"><Label>Interest method</Label><select value={doc.values.method} onChange={(event) => updateValue(doc.id, "method", event.target.value)}><option value="unknown">Not stated</option><option value="reducing">Reducing</option><option value="flat">Flat</option></select></div><div className="field"><Label>Rest frequency</Label><select value={doc.values.rest} onChange={(event) => updateValue(doc.id, "rest", event.target.value)}><option value="unknown">Not stated</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div></div>
              {doc.extracted && <div className="method-edit-grid">{(["loanAmount", "annualRate", "apr", "months", "emi", "totalRepayment"] as const).filter((field) => doc.values[field]).map((field) => <div className="field" key={field}><Label>{field} OCR confidence</Label><select value={doc.confidence[field] || "medium"} onChange={(event) => updateDoc(doc.id, { confidence: { ...doc.confidence, [field]: event.target.value as OcrConfidence } })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>)}</div>}
              <label className="confidence-note"><input type="checkbox" checked={doc.confirmed} onChange={(event) => updateDoc(doc.id, { confirmed: event.target.checked })}/><span> I checked these figures against the original document</span></label>
              {documents.length > 1 && <Button type="button" variant="outline" className="delete-evidence" onClick={() => setDocuments((current) => current.filter((item) => item.id !== doc.id))}><Trash2 size={16}/> Remove evidence</Button>}
            </div>
          </details>)}
        </div>
      </div>

      <div className="card reconciliation-card">
        <div className="section-kicker"><span>A</span> Money reconciliation</div><h2>Where did every rupee go?</h2><p className="section-copy">Match sanctioned finance, deductions and the amount actually received by the dealer.</p>
        <div className="reconcile-equation"><div><span>Base loan</span><strong>{money(primary.basePrincipal)}</strong></div><b>−</b><div><span>Confirmed deductions</span><strong>{money(primary.deductions)}</strong></div><b>=</b><div className="net"><span>Calculated net</span><strong>{money(primary.netDisbursal)}</strong></div></div>
        <div className="form-grid two-cols gate-form"><MiniField label="Dealer invoice finance balance" value={dealerBalance} suffix="₹" onChange={setDealerBalance}/><MiniField label="Actual amount lender paid dealer" value={actualDealerReceipt} suffix="₹" onChange={setActualDealerReceipt}/><MiniField label="Advance EMI deducted" value={advanceEmi} suffix="₹" onChange={setAdvanceEmi}/><MiniField label="Broken-period interest" value={brokenPeriod} suffix="₹" onChange={setBrokenPeriod}/><MiniField label="Other deducted charges" value={otherDeduction} suffix="₹" onChange={setOtherDeduction}/></div>
        <div className="reconcile-table">
          <div><span>Processing fee</span><strong>{money(numberValue(primary.values.processingFee))}</strong></div><div><span>Documentation</span><strong>{money(numberValue(primary.values.documentationFee))}</strong></div><div><span>Insurance</span><strong>{money(numberValue(primary.values.insurance))}</strong></div><div><span>Advance EMI</span><strong>{money(numberValue(advanceEmi))}</strong></div><div><span>Other + broken period</span><strong>{money(numberValue(otherDeduction) + numberValue(brokenPeriod))}</strong></div>
        </div>
        <div className="method-edit-grid">{Object.entries({ processingFee: "Processing fee", documentationFee: "Documentation", insurance: "Insurance", advanceEmi: "Advance EMI", brokenPeriod: "Broken-period interest", otherDeduction: "Other charge" }).map(([key, label]) => <div className="field" key={key}><Label>{label} treatment</Label><select value={chargeTreatments[key]} onChange={(event) => setChargeTreatments((current) => ({ ...current, [key]: event.target.value as ChargeTreatment }))}><option value="unknown">Unknown</option><option value="financed">Financed</option><option value="deducted">Deducted from disbursement</option><option value="upfront">Paid separately upfront</option><option value="not-applicable">Not applicable</option></select></div>)}</div>
      </div>
    </div>

    <div className="card gate-findings-card">
      <div className="section-kicker"><span>B</span> Cross-document findings</div><h2>Contradictions and required action</h2>
      <div className="gate-finding-list">{findings.map((finding, index) => <article className={finding.level} key={`${finding.title}-${index}`}>{finding.level === "green" ? <CheckCircle2/> : <AlertTriangle/>}<div><strong>{finding.title}</strong><p>{finding.detail}</p>{finding.action && <span>Next: {finding.action}</span>}</div></article>)}</div>
    </div>

    <div className="card lender-compare-card"><div className="section-kicker"><span>C</span> Financier comparison</div><h2>Use the full comparison workspace</h2><p className="section-copy">The dedicated Financiers tab audits 2–5 offers with the same central formulas, APR, KFS completeness and prepayment evidence. This Approval Gate no longer keeps a weaker duplicate comparison.</p></div>

    <div className="gate-actions no-print"><Button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(report)}`, "_blank", "noopener,noreferrer")}><MessageCircle size={17}/> WhatsApp approval report</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer size={17}/> Save / print PDF</Button></div>
    <p className="report-disclaimer">Green confirms mathematical consistency only. It is not legal or lender approval. Check the original signed KFS, sanction letter, agreement and receipts.</p>
  </section>;
}

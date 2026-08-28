"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  LoaderCircle,
  MessageCircle,
  Printer,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuditValues = {
  loanAmount: string;
  annualRate: string;
  apr: string;
  months: string;
  emi: string;
  totalInterest: string;
  totalRepayment: string;
  processingFee: string;
  documentationFee: string;
  insurance: string;
  foreclosureRate: string;
  method: "reducing" | "flat" | "unknown";
  rest: "monthly" | "annual" | "unknown";
};

type ScheduleRow = {
  month: number;
  opening?: number;
  payment?: number;
  interest?: number;
  principal?: number;
  closing?: number;
};

type Finding = {
  level: "clear" | "verify" | "serious";
  title: string;
  detail: string;
};

const emptyValues: AuditValues = {
  loanAmount: "",
  annualRate: "",
  apr: "",
  months: "",
  emi: "",
  totalInterest: "",
  totalRepayment: "",
  processingFee: "",
  documentationFee: "",
  insurance: "",
  foreclosureRate: "",
  method: "unknown",
  rest: "unknown",
};

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

const numberValue = (value: string) => Number(value.replace(/[^0-9.-]/g, "")) || 0;

function reducingEmi(principal: number, annualRate: number, months: number) {
  if (!principal || !months) return 0;
  const rate = annualRate / 1200;
  if (!rate) return principal / months;
  const growth = Math.pow(1 + rate, months);
  return (principal * rate * growth) / (growth - 1);
}

function flatEmi(principal: number, annualRate: number, months: number) {
  if (!principal || !months) return 0;
  return (principal + principal * (annualRate / 100) * (months / 12)) / months;
}

function cleanAmount(raw?: string) {
  if (!raw) return "";
  const value = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? String(value) : "";
}

function capture(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanAmount(match[1]);
  }
  return "";
}

function parseValues(text: string): AuditValues {
  const compact = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lower = compact.toLowerCase();
  const tenureMatch = compact.match(/(?:loan tenure|tenure|loan term|number of (?:instalments|installments|emis))[^\d]{0,35}(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|mos?)?/i);
  let months = tenureMatch?.[1] || "";
  if (months && tenureMatch?.[2]?.toLowerCase().startsWith("y")) months = String(Math.round(Number(months) * 12));

  return {
    loanAmount: capture(compact, [
      /(?:sanctioned loan amount|amount financed|net loan amount|loan amount|principal amount)[^\d]{0,35}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
    annualRate: capture(compact, [
      /(?:annualised interest rate|annualized interest rate|customer irr|rate of interest|interest rate|\broi\b)[^\d]{0,30}(\d+(?:\.\d+)?)\s*%/i,
    ]),
    apr: capture(compact, [/(?:annual percentage rate|\bapr\b)[^\d]{0,30}(\d+(?:\.\d+)?)\s*%/i]),
    months,
    emi: capture(compact, [
      /(?:monthly instalment|monthly installment|monthly emi|emi amount|equated monthly instalment)[^\d]{0,35}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
      /(?:\bemi\b)[^\d]{0,20}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
    totalInterest: capture(compact, [/(?:total interest payable|total interest|interest payable)[^\d]{0,35}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i]),
    totalRepayment: capture(compact, [/(?:total amount payable|total repayment|total of instalments|total of installments)[^\d]{0,35}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i]),
    processingFee: capture(compact, [/(?:processing fee|processing charges)[^\d]{0,35}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i]),
    documentationFee: capture(compact, [/(?:documentation fee|document charges|documentation charges)[^\d]{0,35}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i]),
    insurance: capture(compact, [/(?:credit life insurance|loan protection insurance|insurance premium|insurance charge)[^\d]{0,35}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i]),
    foreclosureRate: capture(compact, [/(?:foreclosure|prepayment|part payment|part-payment)[^\d%]{0,45}(\d+(?:\.\d+)?)\s*%/i]),
    method: /\bflat(?: rate| interest)?\b/i.test(compact)
      ? "flat"
      : /reducing|diminishing|outstanding balance|monthly rests?/i.test(compact)
        ? "reducing"
        : "unknown",
    rest: /monthly rests?|month(?:ly)? reducing/i.test(compact)
      ? "monthly"
      : /annual rests?|year(?:ly)? reducing/i.test(compact)
        ? "annual"
        : "unknown",
  };
}

function parseSchedule(text: string): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const line of text.split(/\n/)) {
    const raw = line.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    if (raw.length < 5) continue;
    const values = raw.map((item) => Number(item.replace(/,/g, "")));
    const month = values[0];
    if (!Number.isInteger(month) || month < 1 || month > 360) continue;
    if (values.length >= 6) {
      rows.push({ month, opening: values[1], payment: values[2], interest: values[3], principal: values[4], closing: values[5] });
    } else {
      rows.push({ month, payment: values[1], interest: values[2], principal: values[3], closing: values[4] });
    }
  }
  return Array.from(new Map(rows.map((row) => [row.month, row])).values()).sort((a, b) => a.month - b.month);
}

function expectedRow(principal: number, rate: number, months: number, month: number) {
  const payment = reducingEmi(principal, rate, months);
  const monthlyRate = rate / 1200;
  let balance = principal;
  let opening = balance;
  let interest = 0;
  let principalPaid = 0;
  for (let index = 1; index <= month; index += 1) {
    opening = balance;
    interest = opening * monthlyRate;
    principalPaid = Math.min(payment - interest, opening);
    balance = Math.max(0, opening - principalPaid);
  }
  return { opening, payment, interest, principal: principalPaid, closing: balance };
}

export function DocumentAudit() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [values, setValues] = useState<AuditValues>(emptyValues);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a KFS, sanction letter, quotation, photo, PDF, TXT or CSV.");

  const analyseText = (text: string, name = fileName || "Pasted text") => {
    const parsed = parseValues(text);
    const rows = parseSchedule(text);
    setRawText(text);
    setValues(parsed);
    setScheduleRows(rows);
    setFileName(name);
    const detected = Object.entries(parsed).filter(([key, value]) => !["method", "rest"].includes(key) && value).length;
    setStatus(`Detected ${detected} loan figures${rows.length ? ` and ${rows.length} schedule rows` : ""}. Review and correct any OCR errors below.`);
  };

  const recognizeImage = async (source: File | string, progressStart = 0, progressSpan = 100) => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (message) => {
        if (message.status === "recognizing text") setProgress(Math.round(progressStart + message.progress * progressSpan));
      },
    });
    const result = await worker.recognize(source);
    await worker.terminate();
    return result.data.text;
  };

  const readPdf = async (file: File) => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pageCount = Math.min(pdf.numPages, 12);
    let text = "";
    const weakPages: number[] = [];
    for (let index = 1; index <= pageCount; index += 1) {
      setStatus(`Reading PDF page ${index} of ${pageCount}…`);
      setProgress(Math.round((index / pageCount) * 55));
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      text += `\n${pageText}`;
      if (pageText.replace(/\s/g, "").length < 60) weakPages.push(index);
    }

    if (weakPages.length && weakPages.length <= 4) {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") setProgress(Math.round(55 + message.progress * 40));
        },
      });
      for (const pageNumber of weakPages) {
        setStatus(`Scanning image-only PDF page ${pageNumber}…`);
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.55 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas);
        text += `\n${result.data.text}`;
      }
      await worker.terminate();
    }
    if (pdf.numPages > pageCount) text += `\n[Only the first ${pageCount} pages were analysed]`;
    return text;
  };

  const processFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setStatus("File is larger than 15 MB. Please use a smaller PDF or clearer photo.");
      return;
    }
    setBusy(true);
    setProgress(2);
    setFileName(file.name);
    setStatus("Opening document on this device…");
    try {
      let text = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        text = await readPdf(file);
      } else if (file.type.startsWith("image/")) {
        setStatus("Reading the photo with on-device OCR…");
        text = await recognizeImage(file);
      } else {
        text = await file.text();
      }
      setProgress(100);
      if (text.trim().length < 20) throw new Error("No readable text was found");
      analyseText(text, file.name);
    } catch (error) {
      setStatus(`${error instanceof Error ? error.message : "Document reading failed"}. Try a clearer photo or paste the figures below.`);
    } finally {
      setBusy(false);
    }
  };

  const calculation = useMemo(() => {
    const principal = numberValue(values.loanAmount);
    const rate = numberValue(values.annualRate);
    const months = Math.round(numberValue(values.months));
    const expectedEmi = values.method === "flat" ? flatEmi(principal, rate, months) : reducingEmi(principal, rate, months);
    const expectedRepayment = expectedEmi * months;
    const expectedInterest = expectedRepayment - principal;
    return { principal, rate, months, expectedEmi, expectedRepayment, expectedInterest };
  }, [values]);

  const findings = useMemo<Finding[]>(() => {
    const list: Finding[] = [];
    const { principal, rate, months, expectedEmi, expectedInterest, expectedRepayment } = calculation;
    if (!principal || !rate || !months) {
      list.push({ level: "serious", title: "Core figures incomplete", detail: "Loan amount, annual rate and tenure are needed for an independent calculation." });
      return list;
    }
    if (values.method === "unknown") list.push({ level: "verify", title: "Interest method not stated", detail: "Ask whether the quoted rate is flat or reducing balance." });
    if (values.method === "reducing" && values.rest === "unknown") list.push({ level: "verify", title: "Rest frequency not stated", detail: "Ask whether the balance is reduced monthly or annually. Sundaram’s published policy describes monthly rests." });
    if (!values.apr) list.push({ level: "verify", title: "APR not detected", detail: "APR is the best comparison number because it includes applicable charges." });

    const statedEmi = numberValue(values.emi);
    if (!statedEmi) {
      list.push({ level: "verify", title: "EMI not detected", detail: `Calculated ${values.method === "flat" ? "flat" : "monthly reducing"} EMI is ${money(expectedEmi)}.` });
    } else {
      const difference = statedEmi - expectedEmi;
      const percentage = Math.abs(difference) / expectedEmi;
      list.push({
        level: Math.abs(difference) <= 5 ? "clear" : percentage <= 0.005 ? "verify" : "serious",
        title: Math.abs(difference) <= 5 ? "EMI calculation matches" : "EMI does not match",
        detail: `Document: ${money(statedEmi)} · Calculated: ${money(expectedEmi)} · Difference: ${money(difference)} per month.`,
      });
    }

    const statedInterest = numberValue(values.totalInterest);
    if (statedInterest) {
      const difference = statedInterest - expectedInterest;
      list.push({
        level: Math.abs(difference) <= Math.max(100, expectedInterest * 0.002) ? "clear" : "serious",
        title: "Total interest check",
        detail: `Document: ${money(statedInterest)} · Calculated: ${money(expectedInterest)} · Difference: ${money(difference)}.`,
      });
    } else list.push({ level: "verify", title: "Total interest not detected", detail: `Calculated interest before fees is ${money(expectedInterest)}.` });

    const statedRepayment = numberValue(values.totalRepayment);
    if (statedRepayment) {
      const difference = statedRepayment - expectedRepayment;
      list.push({
        level: Math.abs(difference) <= Math.max(100, expectedRepayment * 0.001) ? "clear" : "serious",
        title: "Total repayment check",
        detail: `Document: ${money(statedRepayment)} · EMI schedule: ${money(expectedRepayment)} · Difference: ${money(difference)}.`,
      });
    }

    if (!values.processingFee) list.push({ level: "verify", title: "Processing fee not detected", detail: "Confirm the fee and GST, including whether it is deducted before disbursement." });
    if (!values.foreclosureRate) list.push({ level: "verify", title: "Foreclosure charge not detected", detail: "Ask for part-payment and foreclosure charges in writing." });

    if (scheduleRows.length && values.method !== "flat") {
      let mismatches = 0;
      for (const row of scheduleRows) {
        if (row.month > months) continue;
        const expected = expectedRow(principal, rate, months, row.month);
        if (row.interest !== undefined && Math.abs(row.interest - expected.interest) > 5) mismatches += 1;
        if (row.principal !== undefined && Math.abs(row.principal - expected.principal) > 5) mismatches += 1;
        if (row.closing !== undefined && Math.abs(row.closing - expected.closing) > 10) mismatches += 1;
      }
      list.push({
        level: mismatches ? "serious" : "clear",
        title: mismatches ? "Schedule rows differ" : "Schedule rows match",
        detail: `${scheduleRows.length} rows detected; ${mismatches} component differences exceed the rounding tolerance.`,
      });
    }
    return list;
  }, [calculation, scheduleRows, values]);

  const overall = findings.some((finding) => finding.level === "serious")
    ? "serious"
    : findings.some((finding) => finding.level === "verify")
      ? "verify"
      : "clear";

  const reportText = useMemo(() => {
    const method = values.method === "reducing" ? `${values.rest === "annual" ? "annual-rest" : "monthly-rest"} reducing` : values.method;
    return [
      "LOAN TRUTH CHECKER — DOCUMENT AUDIT",
      fileName ? `Document: ${fileName}` : "",
      `Loan amount: ${money(calculation.principal)}`,
      `Rate: ${calculation.rate || "not found"}% · Method: ${method}`,
      `Tenure: ${calculation.months || "not found"} months`,
      `Stated EMI: ${values.emi ? money(numberValue(values.emi)) : "not found"}`,
      `Calculated EMI: ${money(calculation.expectedEmi)}`,
      `Calculated interest: ${money(calculation.expectedInterest)}`,
      `Calculated repayment: ${money(calculation.expectedRepayment)}`,
      "",
      ...findings.map((finding) => `${finding.level.toUpperCase()}: ${finding.title} — ${finding.detail}`),
      "",
      "Extracted figures must be checked against the original signed KFS/sanction letter.",
    ].filter(Boolean).join("\n");
  }, [calculation, fileName, findings, values]);

  const clearDocument = () => {
    setFileName("");
    setRawText("");
    setValues(emptyValues);
    setScheduleRows([]);
    setProgress(0);
    setStatus("Upload a KFS, sanction letter, quotation, photo, PDF, TXT or CSV.");
    if (inputRef.current) inputRef.current.value = "";
  };

  const setField = (field: keyof AuditValues, value: string) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <section className="scan-grid">
      <div className="card scan-upload-card">
        <div className="section-kicker"><span>03</span> Document truth scanner</div>
        <h2>Upload the lender’s document</h2>
        <p className="section-copy">The document stays in this browser. It is not uploaded to us or saved after you leave.</p>

        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv"
          onChange={(event) => processFile(event.target.files?.[0])}
        />
        <button className="drop-zone" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={28} /> : <Upload size={28} />}
          <strong>{busy ? "Reading document…" : "Choose photo, PDF, TXT or CSV"}</strong>
          <span>Maximum 15 MB · First 12 PDF pages analysed</span>
        </button>
        {busy && <div className="scan-progress"><span style={{ width: `${progress}%` }} /></div>}
        <div className="scan-status" aria-live="polite"><ShieldCheck size={17} /> <span>{status}</span></div>
        {fileName && !busy && (
          <div className="file-chip"><FileSearch size={16} /><span>{fileName}</span><button type="button" onClick={clearDocument} aria-label="Remove document"><X size={16} /></button></div>
        )}

        <details className="paste-fallback">
          <summary><ClipboardPaste size={17} /> Paste document text instead</summary>
          <textarea value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="Paste KFS, sanction-letter or repayment-schedule text here…" />
          <Button type="button" variant="outline" onClick={() => analyseText(rawText)} disabled={rawText.trim().length < 20}>Analyse pasted text</Button>
        </details>
      </div>

      <div className="card detected-card">
        <div className="section-kicker"><span>A</span> Detected facts</div>
        <h2>Check every extracted figure</h2>
        <p className="section-copy">OCR may misread numbers. Edit them here; calculations update immediately.</p>
        <div className="detected-fields">
          {([
            ["loanAmount", "Loan amount", "₹"],
            ["annualRate", "Annual interest", "%"],
            ["apr", "APR", "%"],
            ["months", "Tenure", "months"],
            ["emi", "Monthly EMI", "₹"],
            ["totalInterest", "Total interest", "₹"],
            ["totalRepayment", "Total repayment", "₹"],
            ["processingFee", "Processing fee", "₹"],
            ["documentationFee", "Documentation", "₹"],
            ["insurance", "Loan insurance", "₹"],
            ["foreclosureRate", "Foreclosure rate", "%"],
          ] as Array<[keyof AuditValues, string, string]>).map(([field, label, suffix]) => (
            <div className="field" key={field}>
              <Label htmlFor={`scan-${field}`}>{label}</Label>
              <div className="input-shell"><Input id={`scan-${field}`} inputMode="decimal" value={values[field]} onChange={(event) => setField(field, event.target.value)} /><span>{suffix}</span></div>
            </div>
          ))}
        </div>
        <div className="method-edit-grid">
          <div className="field">
            <Label htmlFor="scan-method">Interest method</Label>
            <select id="scan-method" value={values.method} onChange={(event) => setField("method", event.target.value)}>
              <option value="unknown">Not stated</option><option value="reducing">Reducing balance</option><option value="flat">Flat rate</option>
            </select>
          </div>
          <div className="field">
            <Label htmlFor="scan-rest">Reducing frequency</Label>
            <select id="scan-rest" value={values.rest} disabled={values.method === "flat"} onChange={(event) => setField("rest", event.target.value)}>
              <option value="unknown">Not stated</option><option value="monthly">Monthly rest</option><option value="annual">Annual rest</option>
            </select>
          </div>
        </div>
        <p className="confidence-note"><span>Document extracted</span> means the app found the figure; it is not lender confirmation until you check the original.</p>
      </div>

      <div className={`card audit-report-card ${overall}`}>
        <div className="report-heading">
          <div>
            <div className="section-kicker"><span>B</span> Independent verification</div>
            <h2>{overall === "serious" ? "Serious mismatch / missing data" : overall === "verify" ? "Needs verification" : "Calculation looks consistent"}</h2>
          </div>
          <div className={`status-orb ${overall}`}>{overall === "clear" ? <CheckCircle2 /> : <AlertTriangle />}</div>
        </div>
        <div className="audit-metrics">
          <div><span>Calculated EMI</span><strong>{money(calculation.expectedEmi)}</strong><small>Calculated</small></div>
          <div><span>Total interest</span><strong>{money(calculation.expectedInterest)}</strong><small>Calculated before fees</small></div>
          <div><span>Total repayment</span><strong>{money(calculation.expectedRepayment)}</strong><small>Calculated EMI × tenure</small></div>
          <div><span>Schedule rows</span><strong>{scheduleRows.length}</strong><small>{scheduleRows.length ? "Document extracted" : "Not detected"}</small></div>
        </div>
        <div className="finding-list">
          {findings.map((finding, index) => (
            <div className={`finding ${finding.level}`} key={`${finding.title}-${index}`}>
              {finding.level === "clear" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
              <div><strong>{finding.title}</strong><p>{finding.detail}</p></div>
            </div>
          ))}
        </div>
        <div className="report-actions no-print">
          <Button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank", "noopener,noreferrer")}><MessageCircle size={17} /> WhatsApp report</Button>
          <Button type="button" variant="outline" onClick={() => window.print()}><Printer size={17} /> Save / print PDF</Button>
        </div>
        <p className="report-disclaimer">This is an independent mathematical check, not a Sundaram Finance or RBI app. Confirm every extracted value against the signed KFS and loan agreement.</p>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download, FileClock, Printer, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type SavedAudit = { savedAt?: string; report?: { truthScore?: number; decision?: string; calculatedEmi?: number; apr?: number; totalRepayment?: number } };
const money = (value = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export function AuditToolkit() {
  const [saved, setSaved] = useState<SavedAudit | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setSaved(JSON.parse(localStorage.getItem("loan-truth-checker:truth-audit-v2") || "null")); } catch { setSaved(null); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const download = () => {
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "saved-loan-truth-audit.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  const clearSaved = () => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("loan-truth-checker:")) localStorage.removeItem(key);
    setSaved(null);
  };
  return <section className="toolkit-workspace">
    <div className="panel-heading"><div><span>08</span><h3>Audit toolkit</h3></div><p>Local evidence and report controls</p></div>
    <div className="toolkit-grid">
      <article><FileClock/><div><span>SAVED CASE</span><h2>{saved ? "Local audit available" : "No saved audit yet"}</h2><p>{saved ? `Saved ${saved.savedAt ? new Date(saved.savedAt).toLocaleString("en-IN") : "on this device"}.` : "Open Truth audit and choose Save audit locally after entering the offer."}</p></div></article>
      <article><ShieldCheck/><div><span>LOCAL CALCULATION</span><h2>Your figures stay in this browser</h2><p>The calculator does not upload loan figures. The public website and any lender document-upload controls remain separate facts.</p></div></article>
    </div>
    {saved?.report && <div className="saved-report"><div><span>Truth score</span><strong>{saved.report.truthScore ?? 0}/100</strong></div><div><span>Decision</span><strong>{(saved.report.decision || "verify").replaceAll("-", " ").toUpperCase()}</strong></div><div><span>Calculated EMI</span><strong>{money(saved.report.calculatedEmi)}</strong></div><div><span>True APR</span><strong>{(saved.report.apr || 0).toFixed(2)}%</strong></div><div><span>Total repayment</span><strong>{money(saved.report.totalRepayment)}</strong></div></div>}
    <div className="truth-actions"><Button type="button" onClick={download} disabled={!saved}><Download/> Download saved audit</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer/> Print current view</Button><Button type="button" variant="outline" onClick={clearSaved}><Trash2/> Clear everything saved locally</Button></div>
  </section>;
}

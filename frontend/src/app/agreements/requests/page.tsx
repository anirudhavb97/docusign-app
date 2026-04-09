"use client";
import { useEffect, useRef, useState } from "react";
import {
  FileText, CheckCircle, AlertCircle, Clock, ExternalLink,
  Send, Loader2, Upload, X, Trash2, Database, ArrowLeftRight,
  RotateCcw, Pencil, RefreshCw, ChevronDown,
} from "lucide-react";

interface InboxItem {
  id: string;
  filename: string;
  receivedAt: string;
  status: "processing" | "classified" | "envelope_created" | "signed" | "error";
  source?: "docusign" | "upload";
  classification?: {
    bucket: string;
    label: string;
    confidence: number;
    action: string;
    needsSignature: boolean;
  };
  summary?: string;
  routingDepartment?: string;
  physicianName?: string;
  physicianEmail?: string;
  draftEnvelopeId?: string;
  error?: string;
}

// Per-item user corrections (client-side only)
interface Corrections {
  physicianName?: string;
  physicianEmail?: string;
  classificationLabel?: string;
  classificationBucket?: string;
  routingDepartment?: string;
}

const BUCKET_COLORS: Record<string, string> = {
  DME_ORDER:                "bg-purple-100 text-purple-700",
  HOME_HEALTH_ORDER:        "bg-blue-100 text-blue-700",
  PLAN_OF_CARE:             "bg-teal-100 text-teal-700",
  PRIOR_AUTHORIZATION:      "bg-orange-100 text-orange-700",
  MEDICAL_RECORD_REQUEST:   "bg-yellow-100 text-yellow-700",
  ATTESTATION_AUDIT:        "bg-red-100 text-red-700",
  SIGNATURE_REQUIRED_OTHER: "bg-pink-100 text-pink-700",
  NO_SIGNATURE_REQUIRED:    "bg-gray-100 text-gray-500",
};

const BUCKET_OPTIONS = [
  { id: "DME_ORDER",                label: "DME Order" },
  { id: "HOME_HEALTH_ORDER",        label: "Home Health Order" },
  { id: "PLAN_OF_CARE",             label: "Plan of Care" },
  { id: "PRIOR_AUTHORIZATION",      label: "Prior Authorization" },
  { id: "MEDICAL_RECORD_REQUEST",   label: "Medical Record Request" },
  { id: "ATTESTATION_AUDIT",        label: "Attestation / Audit" },
  { id: "SIGNATURE_REQUIRED_OTHER", label: "Other — Sig Required" },
  { id: "NO_SIGNATURE_REQUIRED",    label: "No Signature Needed" },
];

// Progress bar steps
const STEPS = ["Upload", "Classify", "Sig. Action", "Prepare", "Send"];

function getActiveStep(item: InboxItem): number {
  switch (item.status) {
    case "processing":       return 1; // Classify running
    case "classified":       return item.classification?.needsSignature ? 3 : 2; // Prepare or done at SigAction
    case "envelope_created": return 4; // Send ready
    case "signed":           return 5; // All done
    case "error":            return -1;
    default:                 return 0;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function deriveEmail(name: string): string {
  const SUFFIXES = new Set(["md","do","phd","dds","np","pa","rn","dc","dnp"]);
  const parts = name.toLowerCase().replace(/[^a-z\s]/g,"").trim().split(/\s+/).filter(p => p && !SUFFIXES.has(p));
  if (parts.length === 0) return "physician@hospital.com";
  if (parts.length === 1) return `${parts[0]}@hospital.com`;
  return `${parts[0]}.${parts[parts.length-1]}@hospital.com`;
}

export default function RequestsPage() {
  const [items, setItems]           = useState<InboxItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const [creating, setCreating]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [actioning, setActioning]   = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [corrections, setCorrections] = useState<Record<string, Corrections>>({});
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  function loadItems() {
    fetch("/api/fax?path=inbox-items")
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadItems();
    const t = setInterval(loadItems, 10_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Corrections helpers
  function getField<K extends keyof Corrections>(item: InboxItem, field: K): string {
    const corr = corrections[item.id];
    if (corr?.[field] !== undefined) return corr[field] as string;
    if (field === "physicianName")       return item.physicianName || "";
    if (field === "physicianEmail")      return item.physicianEmail || "";
    if (field === "classificationLabel") return item.classification?.label || "";
    if (field === "classificationBucket") return item.classification?.bucket || "";
    if (field === "routingDepartment")   return item.routingDepartment || "";
    return "";
  }

  function applyCorrection(id: string, field: keyof Corrections, value: string) {
    setCorrections(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function undoCorrections(id: string) {
    setCorrections(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function hasCorrections(id: string) {
    const c = corrections[id];
    return c && Object.keys(c).length > 0;
  }

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".pdf")) { showToast("Only PDF files are supported.", "error"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("document", file);
      const res = await fetch("/api/fax?path=upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      showToast(`"${file.name}" uploaded — AI pipeline running…`, "success");
      loadItems();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  function handleDelete(id: string) {
    setDeleting(id);
    fetch(`/api/fax?path=inbox-items/${id}`, { method: "DELETE" })
      .then(() => { setItems(prev => prev.filter(i => i.id !== id)); undoCorrections(id); })
      .catch(e => showToast(e.message, "error"))
      .finally(() => setDeleting(null));
  }

  function handleCreateEnvelope(item: InboxItem) {
    setCreating(item.id);
    const corr = corrections[item.id] || {};
    const physicianName  = corr.physicianName  || item.physicianName;
    const physicianEmail = corr.physicianEmail || item.physicianEmail || (physicianName ? deriveEmail(physicianName) : undefined);
    fetch(`/api/fax?path=create-envelope/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl: window.location.origin, physicianName, physicianEmail }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        showToast("Envelope created — opening DocuSign…", "success");
        loadItems();
        if (d.senderViewUrl) window.location.href = d.senderViewUrl;
      })
      .catch(e => showToast(e.message, "error"))
      .finally(() => setCreating(null));
  }

  function handleSendToEhr(id: string) {
    setActioning(id);
    fetch(`/api/fax?path=send-to-ehr/${id}`, { method: "POST" })
      .then(() => showToast("Document sent to EHR successfully", "success"))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setActioning(null));
  }

  function handleSendToPayer(id: string) {
    setActioning(id);
    fetch(`/api/fax?path=send-to-payer/${id}`, { method: "POST" })
      .then(() => showToast("Signed document sent back to payer", "success"))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setActioning(null));
  }

  function handlePollNow() {
    setRefreshing(true);
    fetch("/api/fax?path=poll-now", { method: "POST" })
      .then(() => loadItems())
      .finally(() => setRefreshing(false));
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14}/></button>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreement Desk</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-powered document intake and signature routing</p>
        </div>
        <button
          onClick={handlePollNow}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""}/>
          {refreshing ? "Checking…" : "Check Now"}
        </button>
      </div>

      {/* ── Upload hero ─────────────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all mb-8 ${
          dragOver
            ? "border-[#26154a] bg-purple-50 scale-[1.01]"
            : "border-gray-200 bg-white hover:border-[#26154a] hover:bg-purple-50/40"
        }`}
      >
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          {uploading ? (
            <>
              <Loader2 size={36} className="text-[#26154a] animate-spin mb-3"/>
              <p className="font-semibold text-[#26154a]">Uploading & starting AI pipeline…</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center mb-4">
                <Upload size={24} className="text-[#26154a]"/>
              </div>
              <p className="font-semibold text-gray-800 text-base mb-1">
                {dragOver ? "Drop to upload" : "Drop a PDF here or click to upload"}
              </p>
              <p className="text-sm text-gray-400 mb-4">The AI will classify, extract, and prepare the envelope automatically</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="w-8 h-px bg-gray-200"/>
                <span>or email directly to</span>
                <span className="w-8 h-px bg-gray-200"/>
              </div>
              <p className="mt-2 font-mono text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600">
                jane-goodwin-co-part-11@mail31.demo.docusign.net
              </p>
            </>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput}/>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 w-48 bg-gray-200 rounded mb-4"/>
              <div className="flex gap-2 mb-4">
                {STEPS.map(s => <div key={s} className="h-2 flex-1 bg-gray-200 rounded-full"/>)}
              </div>
              <div className="h-3 w-full bg-gray-100 rounded mb-2"/>
              <div className="h-3 w-3/4 bg-gray-100 rounded"/>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <FileText size={32} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">No documents yet — upload one above to get started</p>
        </div>
      )}

      {/* ── Document cards ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        {items.map(item => {
          const activeStep = getActiveStep(item);
          const bucket     = getField(item, "classificationBucket") || item.classification?.bucket || "";
          const label      = getField(item, "classificationLabel")  || item.classification?.label  || "";
          const physician  = getField(item, "physicianName");
          const department = getField(item, "routingDepartment");
          const corrected  = hasCorrections(item.id);
          const needsSig   = item.classification?.needsSignature;

          return (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

              {/* Card header */}
              <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={16} className="text-gray-400"/>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{item.filename}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.receivedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {item.classification && (
                    <span className="text-xs text-gray-400 font-medium">
                      Match {item.classification.confidence}%
                    </span>
                  )}
                  {item.status !== "processing" && (
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      {deleting === item.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center">
                  {STEPS.map((step, idx) => {
                    const done    = activeStep > idx;
                    const active  = activeStep === idx;
                    const isError = item.status === "error";
                    return (
                      <div key={step} className="flex items-center flex-1 last:flex-none">
                        {/* Circle */}
                        <div className="flex flex-col items-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                            isError && idx === activeStep
                              ? "border-red-400 bg-red-50 text-red-500"
                              : done
                                ? "border-[#26154a] bg-[#26154a] text-white"
                                : active
                                  ? "border-[#26154a] bg-white text-[#26154a]"
                                  : "border-gray-200 bg-gray-50 text-gray-300"
                          }`}>
                            {done ? (
                              <CheckCircle size={14}/>
                            ) : active && item.status === "processing" ? (
                              <Loader2 size={12} className="animate-spin"/>
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </div>
                          <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                            done || active ? "text-[#26154a]" : "text-gray-300"
                          }`}>{step}</span>
                        </div>
                        {/* Connector */}
                        {idx < STEPS.length - 1 && (
                          <div className={`h-0.5 flex-1 mx-1 mb-4 rounded-full transition-colors ${
                            done ? "bg-[#26154a]" : "bg-gray-200"
                          }`}/>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Status message under progress bar */}
                {item.status === "processing" && (
                  <p className="text-xs text-blue-500 mt-3 flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin"/>
                    Running AI pipeline — OCR → classify → envelope prep…
                  </p>
                )}
                {item.status === "error" && (
                  <p className="text-xs text-red-500 mt-3 flex items-center gap-1.5">
                    <AlertCircle size={11}/> {item.error || "Pipeline failed"}
                  </p>
                )}
              </div>

              {/* Details (shown once classified) */}
              {(item.status === "classified" || item.status === "envelope_created" || item.status === "signed") && item.classification && (
                <div className="px-6 py-4">

                  {/* AI Summary */}
                  {item.summary && (
                    <p className="text-sm text-gray-500 italic leading-relaxed mb-4 border-l-2 border-purple-100 pl-3">
                      {item.summary}
                    </p>
                  )}

                  {/* Editable fields */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">

                    {/* Classification */}
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Classification</label>
                      <div className="relative">
                        <select
                          value={bucket}
                          onChange={e => {
                            const opt = BUCKET_OPTIONS.find(o => o.id === e.target.value);
                            if (opt) {
                              applyCorrection(item.id, "classificationBucket", opt.id);
                              applyCorrection(item.id, "classificationLabel", opt.label);
                            }
                          }}
                          className="w-full text-xs font-semibold pl-2 pr-7 py-1.5 rounded-lg border border-gray-200 bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300"
                          style={{ color: "inherit" }}
                        >
                          {BUCKET_OPTIONS.map(o => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                      </div>
                    </div>

                    {/* Routing department */}
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Route to Department</label>
                      {editingField?.id === item.id && editingField?.field === "routingDepartment" ? (
                        <input
                          autoFocus
                          type="text"
                          defaultValue={department}
                          onBlur={e => {
                            applyCorrection(item.id, "routingDepartment", e.target.value);
                            setEditingField(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingField(null);
                          }}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingField({ id: item.id, field: "routingDepartment" })}
                          className="w-full text-left flex items-center justify-between gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition-colors group"
                        >
                          <span className={department ? "text-gray-700" : "text-gray-400 italic"}>
                            {department || "Click to set department"}
                          </span>
                          <Pencil size={11} className="text-gray-300 group-hover:text-purple-400 shrink-0"/>
                        </button>
                      )}
                    </div>

                    {/* Physician name */}
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Ordering Physician</label>
                      {editingField?.id === item.id && editingField?.field === "physicianName" ? (
                        <input
                          autoFocus
                          type="text"
                          defaultValue={physician}
                          onBlur={e => {
                            const name = e.target.value;
                            applyCorrection(item.id, "physicianName", name);
                            // Auto-derive email only if not already manually set
                            if (!corrections[item.id]?.physicianEmail) {
                              applyCorrection(item.id, "physicianEmail", deriveEmail(name));
                            }
                            setEditingField(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingField(null);
                          }}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingField({ id: item.id, field: "physicianName" })}
                          className="w-full text-left flex items-center justify-between gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition-colors group"
                        >
                          <span className={physician ? "text-gray-700" : "text-gray-400 italic"}>
                            {physician || "Unknown physician"}
                          </span>
                          <Pencil size={11} className="text-gray-300 group-hover:text-purple-400 shrink-0"/>
                        </button>
                      )}
                    </div>

                    {/* Signature status */}
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Signature</label>
                      <div className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                        {item.status === "signed" ? (
                          <><CheckCircle size={13} className="text-green-500"/> <span className="text-green-600 font-medium">Signed</span></>
                        ) : needsSig ? (
                          <><Clock size={13} className="text-orange-400"/> <span className="text-orange-600 font-medium">Required</span></>
                        ) : (
                          <><CheckCircle size={13} className="text-gray-400"/> <span className="text-gray-500">Not required</span></>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                    {/* Needs signature → Create Envelope */}
                    {item.status === "classified" && needsSig && (
                      <button
                        onClick={() => handleCreateEnvelope(item)}
                        disabled={creating === item.id}
                        className="flex items-center gap-1.5 bg-[#26154a] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#3a2060] disabled:opacity-60 transition-colors"
                      >
                        {creating === item.id
                          ? <><Loader2 size={12} className="animate-spin"/> Creating…</>
                          : <><Send size={12}/> Create Envelope</>}
                      </button>
                    )}

                    {/* No signature needed → Send to EHR */}
                    {item.status === "classified" && !needsSig && (
                      <button
                        onClick={() => handleSendToEhr(item.id)}
                        disabled={actioning === item.id}
                        className="flex items-center gap-1.5 bg-teal-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors"
                      >
                        {actioning === item.id
                          ? <><Loader2 size={12} className="animate-spin"/> Sending…</>
                          : <><Database size={12}/> Send to EHR</>}
                      </button>
                    )}

                    {/* Envelope created → View in DocuSign */}
                    {item.status === "envelope_created" && item.draftEnvelopeId && (
                      <a
                        href={`https://apps-d.docusign.com/send/prepare/${item.draftEnvelopeId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <ExternalLink size={12}/> View in DocuSign
                      </a>
                    )}

                    {/* Signed → Send to Payer */}
                    {item.status === "signed" && (
                      <button
                        onClick={() => handleSendToPayer(item.id)}
                        disabled={actioning === item.id}
                        className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                      >
                        {actioning === item.id
                          ? <><Loader2 size={12} className="animate-spin"/> Sending…</>
                          : <><ArrowLeftRight size={12}/> Send to Payer</>}
                      </button>
                    )}

                    {/* Undo corrections */}
                    {corrected && (
                      <button
                        onClick={() => undoCorrections(item.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-orange-500 px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors ml-auto"
                      >
                        <RotateCcw size={12}/> Undo Changes
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <p className="text-xs text-gray-400 text-center mt-4">
          Auto-refreshes every 10s · Drag & drop a PDF onto the upload zone to add more
        </p>
      )}
    </div>
  );
}

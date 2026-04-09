"use client";
import { useEffect, useRef, useState } from "react";
import {
  FileText, CheckCircle, AlertCircle, Clock, ExternalLink,
  Send, Loader2, Upload, X, Trash2, Database, ArrowLeftRight,
  RotateCcw, Pencil, RefreshCw, ChevronDown, ChevronRight,
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

interface Corrections {
  physicianName?: string;
  physicianEmail?: string;
  classificationLabel?: string;
  classificationBucket?: string;
  routingDepartment?: string;
}

const BUCKET_COLORS: Record<string, string> = {
  DME_ORDER:                "bg-purple-100 text-purple-700 border-purple-200",
  HOME_HEALTH_ORDER:        "bg-blue-100 text-blue-700 border-blue-200",
  PLAN_OF_CARE:             "bg-teal-100 text-teal-700 border-teal-200",
  PRIOR_AUTHORIZATION:      "bg-orange-100 text-orange-700 border-orange-200",
  MEDICAL_RECORD_REQUEST:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  ATTESTATION_AUDIT:        "bg-red-100 text-red-700 border-red-200",
  SIGNATURE_REQUIRED_OTHER: "bg-pink-100 text-pink-700 border-pink-200",
  NO_SIGNATURE_REQUIRED:    "bg-gray-100 text-gray-500 border-gray-200",
};

// Left border accent color per bucket
const BUCKET_ACCENT: Record<string, string> = {
  DME_ORDER:                "border-l-purple-400",
  HOME_HEALTH_ORDER:        "border-l-blue-400",
  PLAN_OF_CARE:             "border-l-teal-400",
  PRIOR_AUTHORIZATION:      "border-l-orange-400",
  MEDICAL_RECORD_REQUEST:   "border-l-yellow-400",
  ATTESTATION_AUDIT:        "border-l-red-400",
  SIGNATURE_REQUIRED_OTHER: "border-l-pink-400",
  NO_SIGNATURE_REQUIRED:    "border-l-gray-300",
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

const STEPS = ["Upload", "Classify", "Sig. Action", "Prepare", "Send"];

function getActiveStep(item: InboxItem): number {
  switch (item.status) {
    case "processing":       return 1;
    case "classified":       return item.classification?.needsSignature ? 3 : 2;
    case "envelope_created": return 4;
    case "signed":           return 5;
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
  const [items, setItems]             = useState<InboxItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [creating, setCreating]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [actioning, setActioning]     = useState<string | null>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [corrections, setCorrections] = useState<Record<string, Corrections>>({});
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null);
  // Expanded state for collapsed (already-processed) items
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function getField<K extends keyof Corrections>(item: InboxItem, field: K): string {
    const corr = corrections[item.id];
    if (corr?.[field] !== undefined) return corr[field] as string;
    if (field === "physicianName")        return item.physicianName || "";
    if (field === "physicianEmail")       return item.physicianEmail || "";
    if (field === "classificationLabel")  return item.classification?.label || "";
    if (field === "classificationBucket") return item.classification?.bucket || "";
    if (field === "routingDepartment")    return item.routingDepartment || "";
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

  function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setDeleting(id);
    fetch(`/api/fax?path=inbox-items/${id}`, { method: "DELETE" })
      .then(() => { setItems(prev => prev.filter(i => i.id !== id)); undoCorrections(id); })
      .catch(err => showToast(err.message, "error"))
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

  function handleSendToEhr(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setActioning(id);
    fetch(`/api/fax?path=send-to-ehr/${id}`, { method: "POST" })
      .then(() => showToast("Document sent to EHR successfully", "success"))
      .catch(err => showToast(err.message, "error"))
      .finally(() => setActioning(null));
  }

  function handleSendToPayer(id: string) {
    setActioning(id);
    fetch(`/api/fax?path=send-to-payer/${id}`, { method: "POST" })
      .then(() => showToast("Signed document sent back to payer", "success"))
      .catch(err => showToast(err.message, "error"))
      .finally(() => setActioning(null));
  }

  // Split items: processing ones shown as active cards, rest as collapsible rows
  const processingItems  = items.filter(i => i.status === "processing");
  const processedItems   = items.filter(i => i.status !== "processing");

  return (
    <div className="max-w-5xl mx-auto pb-12">

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
          <p className="text-sm text-gray-400 mt-0.5">AI-powered document intake and signature routing</p>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetch("/api/fax?path=poll-now", { method: "POST" }).then(() => loadItems()).finally(() => setRefreshing(false)); }}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""}/>
          {refreshing ? "Checking…" : "Check Now"}
        </button>
      </div>

      {/* ── Upload hero ─────────────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 mb-8 overflow-hidden ${
          dragOver
            ? "border-[#26154a] scale-[1.01]"
            : "border-gray-200 hover:border-[#26154a]"
        }`}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-indigo-50 opacity-70"/>
        <div className="relative flex flex-col items-center justify-center py-10 px-6 text-center">
          {uploading ? (
            <>
              <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mb-4 ring-4 ring-purple-50">
                <Loader2 size={24} className="text-[#26154a] animate-spin"/>
              </div>
              <p className="font-semibold text-[#26154a]">Uploading & starting AI pipeline…</p>
              <p className="text-sm text-gray-400 mt-1">OCR → classify → envelope prep</p>
            </>
          ) : (
            <>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ring-4 transition-colors ${
                dragOver ? "bg-[#26154a] ring-purple-200" : "bg-white ring-purple-50 shadow-sm"
              }`}>
                <Upload size={22} className={dragOver ? "text-white" : "text-[#26154a]"}/>
              </div>
              <p className="font-semibold text-gray-800 mb-1">
                {dragOver ? "Drop to upload" : "Drop a PDF or click to upload"}
              </p>
              <p className="text-sm text-gray-400 mb-5">AI classifies, extracts, and prepares the envelope automatically</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="w-10 h-px bg-gray-200"/>
                or email to
                <span className="w-10 h-px bg-gray-200"/>
              </div>
              <p className="mt-2 font-mono text-xs bg-white/80 border border-gray-200 px-3 py-1.5 rounded-lg text-[#26154a] shadow-sm">
                jane-goodwin-co-part-11@mail31.demo.docusign.net
              </p>
            </>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput}/>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 animate-pulse flex items-center gap-4">
              <div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0"/>
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 bg-gray-200 rounded"/>
                <div className="h-3 w-32 bg-gray-100 rounded"/>
              </div>
              <div className="h-6 w-28 bg-gray-100 rounded-full"/>
              <div className="h-6 w-20 bg-gray-100 rounded-full"/>
              <div className="h-8 w-28 bg-gray-200 rounded-lg"/>
            </div>
          ))}
        </div>
      )}

      {/* ── Active / processing cards ────────────────────────────────────── */}
      {!loading && processingItems.length > 0 && (
        <div className="space-y-4 mb-6">
          {processingItems.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm overflow-hidden">
              {/* Animated top bar */}
              <div className="h-1 bg-gradient-to-r from-[#26154a] via-blue-400 to-[#26154a] bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]"/>

              <div className="px-6 py-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                      <FileText size={16} className="text-blue-500"/>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{item.filename}</p>
                      <p className="text-xs text-gray-400">{formatDate(item.receivedAt)}</p>
                    </div>
                  </div>
                  <span className="text-xs text-blue-500 font-medium bg-blue-50 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <Loader2 size={10} className="animate-spin"/> Processing
                  </span>
                </div>

                {/* Progress steps */}
                <div className="flex items-center">
                  {STEPS.map((step, idx) => {
                    const done   = 1 > idx;   // Upload is always done
                    const active = idx === 1;  // Classify is active
                    return (
                      <div key={step} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                            done   ? "border-[#26154a] bg-[#26154a] text-white" :
                            active ? "border-blue-400 bg-white text-blue-500 shadow-md shadow-blue-100" :
                                     "border-gray-200 bg-gray-50 text-gray-300"
                          }`}>
                            {done ? <CheckCircle size={14}/> : active ? <Loader2 size={11} className="animate-spin"/> : idx + 1}
                          </div>
                          <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                            done || active ? "text-[#26154a]" : "text-gray-300"
                          }`}>{step}</span>
                        </div>
                        {idx < STEPS.length - 1 && (
                          <div className={`h-0.5 flex-1 mx-1 mb-4 rounded-full ${done ? "bg-[#26154a]" : "bg-gray-200"}`}/>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-blue-500 mt-3">
                  Running OCR → classification → envelope prep…
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Processed items (collapsible rows) ──────────────────────────── */}
      {!loading && processedItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section header */}
          {processingItems.length > 0 && (
            <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Processed — {processedItems.length} document{processedItems.length !== 1 ? "s" : ""}
            </div>
          )}

          {processedItems.map((item, idx) => {
            const isExpanded = expandedIds.has(item.id);
            const bucket     = getField(item, "classificationBucket") || item.classification?.bucket || "";
            const label      = getField(item, "classificationLabel")  || item.classification?.label  || "";
            const physician  = getField(item, "physicianName");
            const department = getField(item, "routingDepartment");
            const corrected  = hasCorrections(item.id);
            const needsSig   = item.classification?.needsSignature;
            const accentCls  = BUCKET_ACCENT[bucket] || "border-l-gray-200";
            const activeStep = getActiveStep(item);

            return (
              <div
                key={item.id}
                className={`border-b border-gray-100 last:border-0 border-l-4 ${accentCls} transition-colors`}
              >
                {/* ── Collapsed row ── */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50/80 transition-colors"
                  onClick={() => toggleExpanded(item.id)}
                >
                  {/* Expand caret */}
                  <div className="text-gray-300 shrink-0">
                    {isExpanded
                      ? <ChevronDown size={15} className="text-[#26154a]"/>
                      : <ChevronRight size={15}/>}
                  </div>

                  {/* Filename */}
                  <div className="flex items-center gap-2 min-w-0 flex-[2]">
                    <FileText size={14} className="text-gray-300 shrink-0"/>
                    <span className="text-sm font-medium text-gray-800 truncate">{item.filename}</span>
                    {corrected && (
                      <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">edited</span>
                    )}
                  </div>

                  {/* Classification badge */}
                  <div className="flex-[1.5] flex items-center gap-2">
                    {item.status === "error" ? (
                      <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> Error</span>
                    ) : item.classification ? (
                      <>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${BUCKET_COLORS[bucket] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {label}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {item.classification.confidence}%
                        </span>
                      </>
                    ) : null}
                  </div>

                  {/* Department */}
                  <div className="flex-1 hidden md:block">
                    {department ? (
                      <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full font-medium truncate block max-w-[120px]">
                        {department}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>

                  {/* Physician */}
                  <div className="flex-1 hidden lg:block min-w-0">
                    <p className="text-xs text-gray-600 truncate">{physician || "—"}</p>
                  </div>

                  {/* Signature status */}
                  <div className="shrink-0">
                    {item.status === "signed" ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                        <CheckCircle size={12}/> Signed
                      </span>
                    ) : needsSig ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-orange-500">
                        <Clock size={12}/> Sig. required
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <CheckCircle size={12}/> No sig. needed
                      </span>
                    )}
                  </div>

                  {/* Quick action */}
                  <div className="shrink-0 flex items-center gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
                    {item.status === "classified" && needsSig && (
                      <button
                        onClick={() => handleCreateEnvelope(item)}
                        disabled={creating === item.id}
                        className="flex items-center gap-1 bg-[#26154a] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#3a2060] disabled:opacity-60 transition-colors"
                      >
                        {creating === item.id ? <><Loader2 size={11} className="animate-spin"/> Creating…</> : <><Send size={11}/> Envelope</>}
                      </button>
                    )}
                    {item.status === "classified" && !needsSig && (
                      <button
                        onClick={() => handleSendToEhr(item.id)}
                        disabled={actioning === item.id}
                        className="flex items-center gap-1 bg-teal-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors"
                      >
                        {actioning === item.id ? <><Loader2 size={11} className="animate-spin"/> Sending…</> : <><Database size={11}/> EHR</>}
                      </button>
                    )}
                    {item.status === "envelope_created" && item.draftEnvelopeId && (
                      <a
                        href={`https://apps-d.docusign.com/send/prepare/${item.draftEnvelopeId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <ExternalLink size={11}/> DocuSign
                      </a>
                    )}
                    {item.status === "signed" && (
                      <button
                        onClick={() => handleSendToPayer(item.id)}
                        disabled={actioning === item.id}
                        className="flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                      >
                        <ArrowLeftRight size={11}/> Payer
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      {deleting === item.id ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
                    </button>
                  </div>
                </div>

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <div className="px-6 pb-5 pt-1 bg-gray-50/60 border-t border-gray-100">

                    {/* Progress bar */}
                    <div className="flex items-center mb-5 mt-3">
                      {STEPS.map((step, i) => {
                        const done   = activeStep > i;
                        const active = activeStep === i;
                        return (
                          <div key={step} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                                done   ? "border-[#26154a] bg-[#26154a] text-white" :
                                active ? "border-[#26154a] bg-white text-[#26154a]" :
                                         "border-gray-200 bg-white text-gray-300"
                              }`}>
                                {done ? <CheckCircle size={12}/> : i + 1}
                              </div>
                              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                                done || active ? "text-[#26154a]" : "text-gray-300"
                              }`}>{step}</span>
                            </div>
                            {i < STEPS.length - 1 && (
                              <div className={`h-0.5 flex-1 mx-1 mb-4 rounded-full ${done ? "bg-[#26154a]" : "bg-gray-200"}`}/>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* AI Summary */}
                    {item.summary && (
                      <div className="bg-white border border-purple-100 rounded-xl px-4 py-3 mb-4">
                        <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-1">AI Summary</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{item.summary}</p>
                      </div>
                    )}

                    {/* Editable fields grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
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
                          >
                            {BUCKET_OPTIONS.map(o => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                        </div>
                      </div>

                      {/* Department */}
                      <div>
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Route to Department</label>
                        {editingField?.id === item.id && editingField?.field === "routingDepartment" ? (
                          <input
                            autoFocus
                            type="text"
                            defaultValue={department}
                            onBlur={e => { applyCorrection(item.id, "routingDepartment", e.target.value); setEditingField(null); }}
                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingField(null); }}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-purple-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                          />
                        ) : (
                          <button
                            onClick={() => setEditingField({ id: item.id, field: "routingDepartment" })}
                            className="w-full text-left flex items-center justify-between gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30 transition-colors group"
                          >
                            <span className={department ? "text-gray-700" : "text-gray-400 italic"}>
                              {department || "Click to set department"}
                            </span>
                            <Pencil size={10} className="text-gray-300 group-hover:text-purple-400 shrink-0"/>
                          </button>
                        )}
                      </div>

                      {/* Physician */}
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
                              if (!corrections[item.id]?.physicianEmail) applyCorrection(item.id, "physicianEmail", deriveEmail(name));
                              setEditingField(null);
                            }}
                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingField(null); }}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-purple-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                          />
                        ) : (
                          <button
                            onClick={() => setEditingField({ id: item.id, field: "physicianName" })}
                            className="w-full text-left flex items-center justify-between gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30 transition-colors group"
                          >
                            <span className={physician ? "text-gray-700" : "text-gray-400 italic"}>
                              {physician || "Unknown physician"}
                            </span>
                            <Pencil size={10} className="text-gray-300 group-hover:text-purple-400 shrink-0"/>
                          </button>
                        )}
                      </div>

                      {/* Signature */}
                      <div>
                        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Signature Status</label>
                        <div className="flex items-center gap-1.5 text-xs px-2 py-1.5">
                          {item.status === "signed" ? (
                            <><CheckCircle size={13} className="text-green-500"/><span className="text-green-600 font-medium">Signed</span></>
                          ) : needsSig ? (
                            <><Clock size={13} className="text-orange-400"/><span className="text-orange-600 font-medium">Required</span></>
                          ) : (
                            <><CheckCircle size={13} className="text-gray-400"/><span className="text-gray-500">Not required</span></>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions + Undo */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                      {item.status === "classified" && needsSig && (
                        <button
                          onClick={() => handleCreateEnvelope(item)}
                          disabled={creating === item.id}
                          className="flex items-center gap-1.5 bg-[#26154a] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#3a2060] disabled:opacity-60 transition-colors"
                        >
                          {creating === item.id ? <><Loader2 size={12} className="animate-spin"/> Creating…</> : <><Send size={12}/> Create Envelope</>}
                        </button>
                      )}
                      {item.status === "classified" && !needsSig && (
                        <button
                          onClick={() => handleSendToEhr(item.id)}
                          disabled={actioning === item.id}
                          className="flex items-center gap-1.5 bg-teal-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors"
                        >
                          {actioning === item.id ? <><Loader2 size={12} className="animate-spin"/> Sending…</> : <><Database size={12}/> Send to EHR</>}
                        </button>
                      )}
                      {item.status === "envelope_created" && item.draftEnvelopeId && (
                        <a
                          href={`https://apps-d.docusign.com/send/prepare/${item.draftEnvelopeId}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          <ExternalLink size={12}/> View in DocuSign
                        </a>
                      )}
                      {item.status === "signed" && (
                        <button
                          onClick={() => handleSendToPayer(item.id)}
                          disabled={actioning === item.id}
                          className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                        >
                          <ArrowLeftRight size={12}/> Send to Payer
                        </button>
                      )}
                      {corrected && (
                        <button
                          onClick={() => undoCorrections(item.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:text-amber-600 px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors ml-auto"
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
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <FileText size={32} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">No documents yet — upload one above to get started</p>
        </div>
      )}

      {items.length > 0 && (
        <p className="text-xs text-gray-400 text-center mt-4">
          Auto-refreshes every 10s · {processedItems.length} processed, {processingItems.length} in progress
        </p>
      )}
    </div>
  );
}

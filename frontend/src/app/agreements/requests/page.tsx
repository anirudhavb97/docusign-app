"use client";
import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, FileText, CheckCircle, AlertCircle, Clock,
  ExternalLink, Send, Loader2, Upload, X, Trash2, Database, ArrowLeftRight,
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
  physicianName?: string;
  physicianEmail?: string;
  draftEnvelopeId?: string;
  error?: string;
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

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function RequestsPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
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

  function handlePollNow() {
    setRefreshing(true);
    fetch("/api/fax?path=poll-now", { method: "POST" })
      .then(() => loadItems())
      .finally(() => setRefreshing(false));
  }

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".pdf")) {
      showToast("Only PDF files are supported.", "error");
      return;
    }
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
      .then(() => setItems(prev => prev.filter(i => i.id !== id)))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setDeleting(null));
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

  function handleCreateEnvelope(item: InboxItem) {
    setCreating(item.id);
    fetch(`/api/fax?path=create-envelope/${item.id}`, { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        showToast("Draft envelope created — opening DocuSign…", "success");
        loadItems();
        window.open(d.viewUrl, "_blank");
      })
      .catch(e => showToast(e.message, "error"))
      .finally(() => setCreating(null));
  }

  const hasProcessing = items.some(i => i.status === "processing");

  return (
    <div className="max-w-6xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreement Desk</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Upload a PDF or send to{" "}
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
              jane-goodwin-co-part-11@mail31.demo.docusign.net
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 border border-[#26154a] text-[#26154a] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-50 disabled:opacity-60 transition-colors"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Processing…" : "Upload PDF"}
          </button>
          <button
            onClick={handlePollNow}
            disabled={refreshing}
            className="flex items-center gap-2 bg-[#26154a] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a2060] disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Checking…" : "Check Now"}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* AI pipeline running banner */}
      {(hasProcessing || uploading) && (
        <div className="flex items-center gap-2 mb-4 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <Loader2 size={14} className="animate-spin shrink-0" />
          AI pipeline running — OCR → classification → envelope prep in progress…
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 animate-pulse">
              <div className="w-48 h-4 bg-gray-200 rounded" />
              <div className="w-24 h-4 bg-gray-200 rounded" />
              <div className="w-32 h-6 bg-gray-200 rounded-full" />
              <div className="w-20 h-4 bg-gray-200 rounded" />
              <div className="ml-auto w-28 h-8 bg-gray-200 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Drop zone (shown when no items yet) */}
      {!loading && items.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer text-center py-20 border-2 border-dashed rounded-xl transition-colors ${
            dragOver
              ? "border-[#26154a] bg-purple-50"
              : "border-gray-300 bg-white hover:border-[#26154a] hover:bg-purple-50"
          }`}
        >
          <Upload size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-semibold text-gray-500 mb-1">Drop a PDF here or click to upload</p>
          <p className="text-sm text-gray-400">The AI will OCR, classify, and prep the envelope automatically</p>
        </div>
      )}

      {/* Table */}
      {!loading && items.length > 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-white border-2 rounded-xl overflow-hidden transition-colors ${
            dragOver ? "border-[#26154a] bg-purple-50" : "border-gray-200"
          }`}
        >
          {/* Column headers */}
          <div className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_160px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Document</span>
            <span>Received</span>
            <span>Classification</span>
            <span>Signature</span>
            <span>Physician</span>
            <span className="text-right">Action</span>
          </div>

          {items.map(item => (
            <div
              key={item.id}
              className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_160px] gap-4 px-6 py-4 border-b border-gray-100 last:border-0 items-center hover:bg-gray-50 transition-colors"
            >
              {/* Document */}
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={15} className="text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate block">{item.filename}</span>
                  {item.source === "upload" && (
                    <span className="text-xs text-purple-500 font-medium">Uploaded</span>
                  )}
                </div>
              </div>

              {/* Received */}
              <span className="text-xs text-gray-500">{formatDate(item.receivedAt)}</span>

              {/* Classification */}
              <div>
                {item.status === "processing" && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-600">
                    <Loader2 size={12} className="animate-spin" /> Classifying…
                  </span>
                )}
                {item.status === "error" && (
                  <span className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} /> {item.error?.substring(0, 40)}
                  </span>
                )}
                {(item.status === "classified" || item.status === "envelope_created") && item.classification && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BUCKET_COLORS[item.classification.bucket] || "bg-gray-100 text-gray-500"}`}>
                      {item.classification.label}
                    </span>
                    <span className="text-xs text-gray-400">{item.classification.confidence}%</span>
                  </div>
                )}
              </div>

              {/* Signature */}
              <div>
                {item.status === "processing" && <span className="text-xs text-gray-400">—</span>}
                {item.status === "signed" && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                    <CheckCircle size={12} /> Signed
                  </span>
                )}
                {(item.status === "classified" || item.status === "envelope_created") && item.classification && (
                  item.classification.needsSignature ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-orange-600">
                      <Clock size={12} /> Required
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle size={12} /> Not needed
                    </span>
                  )
                )}
              </div>

              {/* Physician */}
              <div className="min-w-0">
                {item.physicianName ? (
                  <div>
                    <p className="text-xs font-medium text-gray-700 truncate">{item.physicianName}</p>
                    <p className="text-xs text-gray-400 truncate">{item.physicianEmail}</p>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>

              {/* Action */}
              <div className="flex items-center justify-end gap-1.5">
                {item.status === "processing" && (
                  <span className="text-xs text-gray-400 italic">Processing…</span>
                )}

                {/* Needs signature → Create Envelope */}
                {item.status === "classified" && item.classification?.needsSignature && (
                  <button
                    onClick={() => handleCreateEnvelope(item)}
                    disabled={creating === item.id}
                    className="flex items-center gap-1.5 bg-[#26154a] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#3a2060] disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {creating === item.id
                      ? <><Loader2 size={12} className="animate-spin" /> Creating…</>
                      : <><Send size={12} /> Create Envelope</>}
                  </button>
                )}

                {/* No signature needed → Send to EHR */}
                {item.status === "classified" && !item.classification?.needsSignature && (
                  <button
                    onClick={() => handleSendToEhr(item.id)}
                    disabled={actioning === item.id}
                    className="flex items-center gap-1.5 bg-teal-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {actioning === item.id
                      ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                      : <><Database size={12} /> Send to EHR</>}
                  </button>
                )}

                {/* Envelope created → View in DocuSign */}
                {item.status === "envelope_created" && item.draftEnvelopeId && (
                  <a
                    href={`https://apps-d.docusign.com/send/prepare/${item.draftEnvelopeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink size={12} /> View in DocuSign
                  </a>
                )}

                {/* Signed → Send back to Payer */}
                {item.status === "signed" && (
                  <button
                    onClick={() => handleSendToPayer(item.id)}
                    disabled={actioning === item.id}
                    className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {actioning === item.id
                      ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                      : <><ArrowLeftRight size={12} /> Send to Payer</>}
                  </button>
                )}

                {item.status === "error" && (
                  <span className="text-xs text-red-400 italic">Failed</span>
                )}

                {/* Delete button — always shown except while processing */}
                {item.status !== "processing" && (
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                    title="Remove from inbox"
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                  >
                    {deleting === item.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Drag hint at bottom of table */}
          {dragOver && (
            <div className="px-6 py-3 bg-purple-50 border-t border-purple-200 text-center text-sm text-purple-600 font-medium">
              Drop PDF to add to queue
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 text-center">
        Auto-refreshes every 10s · Drag & drop a PDF anywhere on the table to upload
      </p>
    </div>
  );
}

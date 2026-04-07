"use client";
import { useEffect, useState } from "react";
import { RefreshCw, FileText, CheckCircle, AlertCircle, Clock, ExternalLink, Send, Loader2 } from "lucide-react";

const BUCKET_COLORS: Record<string, string> = {
  DME_ORDER: "bg-purple-100 text-purple-700",
  HOME_HEALTH_ORDER: "bg-blue-100 text-blue-700",
  PLAN_OF_CARE: "bg-teal-100 text-teal-700",
  PRIOR_AUTHORIZATION: "bg-orange-100 text-orange-700",
  MEDICAL_RECORD_REQUEST: "bg-yellow-100 text-yellow-700",
  ATTESTATION_AUDIT: "bg-red-100 text-red-700",
  SIGNATURE_REQUIRED_OTHER: "bg-pink-100 text-pink-700",
  NO_SIGNATURE_REQUIRED: "bg-gray-100 text-gray-500",
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function RequestsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  function loadItems() {
    fetch("/api/fax?path=inbox-items")
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false); setError(""); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => {
    loadItems();
    const t = setInterval(loadItems, 10000);
    return () => clearInterval(t);
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetch("/api/fax?path=poll-now", { method: "POST" })
      .then(() => loadItems())
      .finally(() => setRefreshing(false));
  }

  function handleCreateEnvelope(id: string) {
    setCreating(id);
    fetch(`/api/fax?path=create-envelope/${id}`, { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setSuccessMsg("Draft created! Opening DocuSign…");
        setTimeout(() => setSuccessMsg(""), 5000);
        loadItems();
        window.open(d.viewUrl, "_blank");
      })
      .catch(e => setError(e.message))
      .finally(() => setCreating(null));
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Success */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium">
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreement Desk Inbox</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Faxes sent to <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">jane-goodwin-co-part-11@mail31.demo.docusign.net</span> appear here automatically
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-[#26154a] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a2060] disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Checking…" : "Check Now"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-20 text-gray-400">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
          <p>Loading inbox…</p>
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && !error && (
        <div className="text-center py-20 bg-white border border-gray-200 rounded-xl">
          <FileText size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-semibold text-gray-500 mb-1">No faxes received yet</p>
          <p className="text-sm text-gray-400">Send an email with a PDF to the address above — it will appear here within 60 seconds</p>
        </div>
      )}

      {/* Table */}
      {!loading && items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_180px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Document</span>
            <span>Received</span>
            <span>Classification</span>
            <span>Signature</span>
            <span>Physician</span>
            <span className="text-right">Action</span>
          </div>

          {items.map((item: any) => {
            const cls = item.classification;
            return (
              <div key={item.id} className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_180px] gap-4 px-6 py-4 border-b border-gray-100 last:border-0 items-center hover:bg-gray-50 transition-colors">

                {/* Document */}
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={15} className="text-gray-400 shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{item.filename}</span>
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
                    <span className="text-xs text-red-500">{item.error?.slice(0, 40)}</span>
                  )}
                  {cls && (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BUCKET_COLORS[cls.bucket] || "bg-gray-100 text-gray-500"}`}>
                        {cls.label}
                      </span>
                      <span className="text-xs text-gray-400">{cls.confidence}%</span>
                    </div>
                  )}
                </div>

                {/* Signature */}
                <div>
                  {!cls && <span className="text-xs text-gray-400">—</span>}
                  {cls && (cls.needsSignature ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-orange-600">
                      <Clock size={12} /> Required
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle size={12} /> Not needed
                    </span>
                  ))}
                </div>

                {/* Physician */}
                <div className="min-w-0">
                  {item.physicianName ? (
                    <div>
                      <p className="text-xs font-medium text-gray-700 truncate">{item.physicianName}</p>
                      <p className="text-xs text-gray-400 truncate">{item.physicianEmail}</p>
                    </div>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </div>

                {/* Action */}
                <div className="flex justify-end">
                  {item.status === "processing" && <span className="text-xs text-gray-400 italic">Processing…</span>}

                  {cls?.needsSignature && item.status === "classified" && (
                    <button
                      onClick={() => handleCreateEnvelope(item.id)}
                      disabled={creating === item.id}
                      className="flex items-center gap-1.5 bg-[#26154a] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#3a2060] disabled:opacity-60 transition-colors whitespace-nowrap"
                    >
                      {creating === item.id ? <><Loader2 size={12} className="animate-spin" /> Creating…</> : <><Send size={12} /> Create Envelope</>}
                    </button>
                  )}

                  {cls && !cls.needsSignature && item.status === "classified" && (
                    <span className="text-xs text-gray-400 italic">No action needed</span>
                  )}

                  {item.status === "envelope_created" && item.draftEnvelopeId && (
                    <a
                      href={`https://apps-d.docusign.com/send/prepare/${item.draftEnvelopeId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
                    >
                      <ExternalLink size={12} /> View Draft
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 text-center">Auto-refreshes every 10s · Polls DocuSign every 60s</p>
    </div>
  );
}

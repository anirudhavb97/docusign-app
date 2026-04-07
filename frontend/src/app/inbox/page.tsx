"use client";
import { useState } from "react";
import { Upload, RefreshCw, CheckCircle, AlertCircle, Clock, FileText, User, Building2, Stethoscope } from "lucide-react";

const BUCKET_COLORS: Record<string, string> = {
  DME_ORDER: "bg-purple-100 text-purple-700",
  HOME_HEALTH_ORDER: "bg-blue-100 text-blue-700",
  PLAN_OF_CARE: "bg-teal-100 text-teal-700",
  PRIOR_AUTHORIZATION: "bg-orange-100 text-orange-700",
  MEDICAL_RECORD_REQUEST: "bg-yellow-100 text-yellow-700",
  ATTESTATION_AUDIT: "bg-red-100 text-red-700",
  SIGNATURE_REQUIRED_OTHER: "bg-pink-100 text-pink-700",
  NO_SIGNATURE_REQUIRED: "bg-gray-100 text-gray-600",
};

const BUCKET_LABELS: Record<string, string> = {
  DME_ORDER: "DME Order",
  HOME_HEALTH_ORDER: "Home Health Order",
  PLAN_OF_CARE: "Plan of Care",
  PRIOR_AUTHORIZATION: "Prior Authorization",
  MEDICAL_RECORD_REQUEST: "Medical Record Request",
  ATTESTATION_AUDIT: "Attestation / Audit",
  SIGNATURE_REQUIRED_OTHER: "Other — Sig Required",
  NO_SIGNATURE_REQUIRED: "No Signature Needed",
};

const ACTION_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  SIGNATURE_NEEDED: { color: "text-orange-600 bg-orange-50 border-orange-200", icon: <AlertCircle size={16} />, label: "Signature Needed" },
  ALREADY_SIGNED: { color: "text-green-600 bg-green-50 border-green-200", icon: <CheckCircle size={16} />, label: "Already Signed" },
  NO_SIGNATURE_REQUIRED: { color: "text-gray-600 bg-gray-50 border-gray-200", icon: <FileText size={16} />, label: "No Signature Required" },
  MANUAL_REVIEW: { color: "text-red-600 bg-red-50 border-red-200", icon: <AlertCircle size={16} />, label: "Manual Review" },
};

export default function InboxPage() {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [pollResults, setPollResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "inbox">("upload");

  async function handleFile(file: File) {
    setProcessing(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("document", file);

    try {
      const res = await fetch("/api/fax/process", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pipeline failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  async function pollInbox() {
    setPolling(true);
    setError(null);
    try {
      const res = await fetch("/api/fax/poll-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Poll failed");
      setPollResults(data.results || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPolling(false);
    }
  }

  const cls = result?.classification?.classification;
  const ing = result?.ingestion;
  const env = result?.envelopePrep;
  const actionCfg = cls ? ACTION_CONFIG[cls.action] : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fax Inbox</h1>
          <p className="text-gray-500 text-sm mt-1">AI-powered fax ingestion via DocuSign Agreement Desk</p>
        </div>
        <button
          onClick={pollInbox}
          disabled={polling}
          className="flex items-center gap-2 bg-[#1a1a4e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a6e] disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={15} className={polling ? "animate-spin" : ""} />
          {polling ? "Polling..." : "Poll Agreement Desk"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[{ id: "upload", label: "Manual Upload" }, { id: "inbox", label: `Agreement Desk Inbox${pollResults.length ? ` (${pollResults.length})` : ""}` }].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[#1a1a4e] text-[#1a1a4e]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 mb-5">
          <AlertCircle size={18} className="text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Upload Tab */}
      {activeTab === "upload" && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors mb-6 ${
              dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:border-gray-400"
            }`}
            onClick={() => document.getElementById("fileInput")?.click()}
          >
            <Upload size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-700 font-medium">Drop a fax PDF here or click to upload</p>
            <p className="text-gray-400 text-sm mt-1">Supports PDF — up to 50MB</p>
            <input id="fileInput" type="file" accept=".pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {processing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center mb-6">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-blue-700 font-medium">Running AI pipeline...</p>
              <p className="text-blue-500 text-sm mt-1">Ingestion → Classification → Envelope Prep</p>
            </div>
          )}

          {result && <PipelineResult result={result} cls={cls} ing={ing} env={env} actionCfg={actionCfg} />}
        </div>
      )}

      {/* Inbox Tab */}
      {activeTab === "inbox" && (
        <div>
          {polling && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center mb-6">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-blue-700 font-medium">Polling Agreement Desk inbox...</p>
            </div>
          )}
          {pollResults.length === 0 && !polling ? (
            <div className="text-center py-16 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium text-gray-500">No results yet</p>
              <p className="text-sm mt-1">Click "Poll Agreement Desk" to check for new faxes</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pollResults.map((item: any, i: number) => (
                <div key={i} className="border border-gray-200 rounded-lg p-5 bg-white">
                  <p className="text-xs text-gray-400 mb-1">Envelope: {item.envelopeId}</p>
                  <p className="font-semibold text-gray-800 mb-3">{item.filename}</p>
                  <PipelineResult
                    result={item.result}
                    cls={item.result?.classification?.classification}
                    ing={item.result?.ingestion}
                    env={item.result?.envelopePrep}
                    actionCfg={item.result?.classification?.classification ? ACTION_CONFIG[item.result.classification.classification.action] : null}
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineResult({ result, cls, ing, env, actionCfg, compact = false }: any) {
  if (!cls) return null;
  const bucket = cls.bucket;

  return (
    <div className="space-y-4">
      {/* Classification header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Document Classification</p>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${BUCKET_COLORS[bucket] || "bg-gray-100 text-gray-600"}`}>
                {BUCKET_LABELS[bucket] || bucket}
              </span>
              {actionCfg && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex items-center gap-1 ${actionCfg.color}`}>
                  {actionCfg.icon}
                  {actionCfg.label}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 mb-1">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${Math.round((cls.confidence || 0) * 100)}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-700">{Math.round((cls.confidence || 0) * 100)}%</span>
            </div>
          </div>
        </div>

        {cls.classification_reasoning && !compact && (
          <div className="bg-gray-50 rounded p-3">
            <p className="text-xs text-gray-400 mb-1">AI Reasoning</p>
            <p className="text-sm text-gray-600">{cls.classification_reasoning}</p>
          </div>
        )}
      </div>

      {/* Patient & Provider */}
      {ing && !compact && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <User size={15} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Patient</p>
            </div>
            <InfoRow label="Name" value={ing.patient?.name} />
            <InfoRow label="DOB" value={ing.patient?.date_of_birth} />
            <InfoRow label="MRN" value={ing.patient?.mrn} />
            <InfoRow label="Member ID" value={ing.patient?.member_id} />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Stethoscope size={15} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ordering Physician</p>
            </div>
            <InfoRow label="Name" value={ing.provider?.ordering_physician_name} />
            <InfoRow label="NPI" value={ing.provider?.npi} />
            <InfoRow label="Practice" value={ing.provider?.practice_name} />
            <InfoRow label="Phone" value={ing.provider?.phone} />
          </div>
        </div>
      )}

      {/* Payer + Clinical */}
      {ing && !compact && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={15} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payer</p>
            </div>
            <InfoRow label="Insurer" value={ing.payer?.name} />
            <InfoRow label="Plan" value={ing.payer?.plan_name} />
            <InfoRow label="Group #" value={ing.payer?.group_number} />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={15} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Clinical Codes</p>
            </div>
            {ing.clinical?.icd10_codes?.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-gray-400">ICD-10</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ing.clinical.icd10_codes.map((c: string) => (
                    <span key={c} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {ing.clinical?.hcpcs_codes?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400">HCPCS</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ing.clinical.hcpcs_codes.map((c: string) => (
                    <span key={c} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-mono">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Envelope result */}
      {env && (
        <div className={`rounded-lg border p-4 ${env.envelope_needed ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
          <div className="flex items-center gap-2 mb-2">
            <Clock size={15} className={env.envelope_needed ? "text-amber-600" : "text-gray-400"} />
            <p className={`text-xs font-semibold uppercase tracking-wide ${env.envelope_needed ? "text-amber-700" : "text-gray-500"}`}>
              DocuSign Envelope
            </p>
          </div>
          {env.envelope_needed ? (
            <div>
              <p className="text-sm text-amber-800 font-medium">{env.envelope_config?.emailSubject}</p>
              <p className="text-xs text-amber-600 mt-1">
                Tabs placed: {[
                  ...(env.envelope_config?.recipients?.signers?.[0]?.tabs?.signHereTabs || []),
                  ...(env.envelope_config?.recipients?.signers?.[0]?.tabs?.dateSignedTabs || []),
                ].length} signature/date fields detected
              </p>
              {result?.envelopeResult?.envelopeId && (
                <div className="mt-2 bg-green-100 rounded p-2">
                  <p className="text-green-700 text-xs font-semibold">Sent for signature</p>
                  <p className="text-green-600 text-xs font-mono">{result.envelopeResult.envelopeId}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600">{env.message || env.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm mb-1.5">
      <span className="text-gray-400 shrink-0 mr-2">{label}</span>
      <span className="text-gray-700 text-right font-medium">{value}</span>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import {
  FileText, CheckCircle, AlertCircle, Clock, ExternalLink,
  Send, Loader2, Upload, X, Trash2, Database, ArrowLeftRight,
  RotateCcw, Pencil, RefreshCw, ChevronDown, ChevronRight,
  Activity, Building2, User, Stethoscope, MapPin, Shield,
  ScanLine, FileSearch, ClipboardList, Info,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface InboxItem {
  id: string;
  filename: string;
  receivedAt: string;
  status: "processing" | "classified" | "envelope_created" | "signed" | "error";
  source?: "docusign" | "upload" | "hl7_277";
  classification?: { bucket: string; label: string; confidence: number; action: string; needsSignature: boolean; };
  summary?: string;
  routingDepartment?: string;
  payer?: string;
  sender?: string;
  claimId?: string;
  hl7RequestType?: string;
  patientName?: string;
  physicianName?: string;
  physicianEmail?: string;
  draftEnvelopeId?: string;
  error?: string;
}

interface Corrections {
  physicianName?: string; physicianEmail?: string;
  classificationLabel?: string; classificationBucket?: string;
  routingDepartment?: string; payer?: string; sender?: string;
}

interface EhrImport { patientName: string; records: string[]; needsSignature: boolean; }

// ── Constants ────────────────────────────────────────────────────────────────

const BUCKET_COLORS: Record<string, string> = {
  DME_ORDER: "bg-purple-100 text-purple-700 border-purple-200",
  HOME_HEALTH_ORDER: "bg-blue-100 text-blue-700 border-blue-200",
  PLAN_OF_CARE: "bg-teal-100 text-teal-700 border-teal-200",
  PRIOR_AUTHORIZATION: "bg-orange-100 text-orange-700 border-orange-200",
  MEDICAL_RECORD_REQUEST: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ATTESTATION_AUDIT: "bg-red-100 text-red-700 border-red-200",
  SIGNATURE_REQUIRED_OTHER: "bg-pink-100 text-pink-700 border-pink-200",
  NO_SIGNATURE_REQUIRED: "bg-gray-100 text-gray-500 border-gray-200",
};

const BUCKET_ACCENT: Record<string, string> = {
  DME_ORDER: "border-l-purple-400", HOME_HEALTH_ORDER: "border-l-blue-400",
  PLAN_OF_CARE: "border-l-teal-400", PRIOR_AUTHORIZATION: "border-l-orange-400",
  MEDICAL_RECORD_REQUEST: "border-l-yellow-400", ATTESTATION_AUDIT: "border-l-red-400",
  SIGNATURE_REQUIRED_OTHER: "border-l-pink-400", NO_SIGNATURE_REQUIRED: "border-l-gray-300",
};

const BUCKET_OPTIONS = [
  { id: "DME_ORDER", label: "DME Order" }, { id: "HOME_HEALTH_ORDER", label: "Home Health Order" },
  { id: "PLAN_OF_CARE", label: "Plan of Care" }, { id: "PRIOR_AUTHORIZATION", label: "Prior Authorization" },
  { id: "MEDICAL_RECORD_REQUEST", label: "Medical Record Request" },
  { id: "ATTESTATION_AUDIT", label: "Attestation / Audit" },
  { id: "SIGNATURE_REQUIRED_OTHER", label: "Other — Sig Required" },
  { id: "NO_SIGNATURE_REQUIRED", label: "No Signature Needed" },
];

const STEPS = ["Upload", "Classify", "Sig. Action", "Prepare", "Send"];

// ── EDI Sample library ───────────────────────────────────────────────────────

const EDI_SAMPLES = [
  {
    id: "xray", label: "X-Ray Request", color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <ScanLine size={12}/>,
    desc: "Aetna requesting chest X-ray images (CPT 71046, 71047) for claim validation",
    content: `ISA*00*          *00*          *ZZ*AETNA001       *ZZ*HOSPITAL01     *240110*0900*^*00501*000000001*0*P*:~
GS*HN*AETNA001*HOSPITAL01*20240110*0900*1*X*005010X214~
ST*277*0001~
BHT*0010*08*CLM-XRAY-2024001*20240110*0900~
HL*1**20*1~
NM1*PR*2*AETNA HEALTH INC*****PI*AETNA001~
HL*2*1*21*1~
NM1*41*2*AVAILITY LLC*****46*987654321~
HL*3*2*22*0~
NM1*1P*2*JOHNSON*MICHAEL*MD***XX*1234567890~
HL*4*3*PT*0~
NM1*QC*1*DOE*JOHN****HN*MEM789012~
TRN*1*CLM-XRAY-2024001*1AETNA~
STC*A3:20*20240110*WQ*1850.00~
REF*D9*CLM-XRAY-2024001~
REF*ZZ*IMAGING_REQUEST~
REF*EA*CHEST-XRAY:CPT-71046,CPT-71047~
DTP*472*D8*20240105~
DTP*435*D8*20240108~
AMT*T3*1850.00~
LQ*RX*71046~
LQ*RX*71047~
SE*21*0001~
GE*1*1~
IEA*1*000000001~`,
  },
  {
    id: "notes", label: "Doctor's Notes", color: "bg-green-50 text-green-700 border-green-200",
    icon: <ClipboardList size={12}/>,
    desc: "Cigna requesting clinical notes and discharge summary for inpatient stay",
    content: `ISA*00*          *00*          *ZZ*CIGNA001       *ZZ*HOSPITAL01     *240112*1100*^*00501*000000002*0*P*:~
GS*HN*CIGNA001*HOSPITAL01*20240112*1100*2*X*005010X214~
ST*277*0002~
BHT*0010*08*CLM-NOTES-2024002*20240112*1100~
HL*1**20*1~
NM1*PR*2*CIGNA HEALTHCARE*****PI*CIGNA001~
HL*2*1*21*1~
NM1*41*2*CHANGE HEALTHCARE*****46*112233445~
HL*3*2*22*0~
NM1*1P*2*PATEL*PRIYA*MD***XX*9876543210~
HL*4*3*PT*0~
NM1*QC*1*DOE*JOHN****HN*MEM334455~
TRN*1*CLM-NOTES-2024002*1CIGNA~
STC*R4:C0*20240112*WQ*4200.00~
REF*D9*CLM-NOTES-2024002~
REF*ZZ*NOTES_REQUEST~
REF*EA*CLINICAL-NOTES:PHYSICIAN-VISIT,DISCHARGE-SUMMARY~
DTP*472*D8*20240103~
DTP*435*D8*20240110~
AMT*T3*4200.00~
SE*19*0002~
GE*1*2~
IEA*1*000000002~`,
  },
  {
    id: "signature", label: "Signature Required", color: "bg-orange-50 text-orange-700 border-orange-200",
    icon: <Pencil size={12}/>,
    desc: "UnitedHealth requiring physician signature on medical necessity form",
    content: `ISA*00*          *00*          *ZZ*UHC0000001     *ZZ*HOSPITAL01     *240114*0800*^*00501*000000003*0*P*:~
GS*HN*UHC0000001*HOSPITAL01*20240114*0800*3*X*005010X214~
ST*277*0003~
BHT*0010*08*CLM-SIG-2024003*20240114*0800~
HL*1**20*1~
NM1*PR*2*UNITEDHEALTH GROUP*****PI*UHC0000001~
HL*2*1*21*1~
NM1*41*2*OPTUM360*****46*556677889~
HL*3*2*22*0~
NM1*1P*2*GARCIA*ROBERTO*MD***XX*5544332211~
HL*4*3*PT*0~
NM1*QC*1*DOE*JOHN****HN*MEM556677~
TRN*1*CLM-SIG-2024003*1UHC~
STC*A7:YY*20240114*WQ*8750.00~
REF*D9*CLM-SIG-2024003~
REF*ZZ*SIGNATURE_REQUEST~
REF*9F*MED-NECESSITY-FORM-2024003~
REF*EA*MEDICAL-NECESSITY-FORM:PHYSICIAN-SIGNATURE-REQUIRED~
DTP*472*D8*20240108~
DTP*435*D8*20240112~
AMT*T3*8750.00~
SE*19*0003~
GE*1*3~
IEA*1*000000003~`,
  },
  {
    id: "mri", label: "MRI Scan Request", color: "bg-purple-50 text-purple-700 border-purple-200",
    icon: <Activity size={12}/>,
    desc: "Humana requesting brain MRI results and radiology report (CPT 70553)",
    content: `ISA*00*          *00*          *ZZ*HUMANA001      *ZZ*HOSPITAL01     *240116*1400*^*00501*000000004*0*P*:~
GS*HN*HUMANA001*HOSPITAL01*20240116*1400*4*X*005010X214~
ST*277*0004~
BHT*0010*08*CLM-MRI-2024004*20240116*1400~
HL*1**20*1~
NM1*PR*2*HUMANA INC*****PI*HUMANA001~
HL*2*1*21*1~
NM1*41*2*WAYSTAR HEALTH*****46*998877665~
HL*3*2*22*0~
NM1*1P*2*CHEN*LINDA*MD***XX*1122334455~
HL*4*3*PT*0~
NM1*QC*1*DOE*JOHN****HN*MEM778899~
TRN*1*CLM-MRI-2024004*1HUMANA~
STC*A3:20*20240116*WQ*3200.00~
REF*D9*CLM-MRI-2024004~
REF*ZZ*IMAGING_REQUEST~
REF*EA*MRI-SCAN:CPT-70553~
DTP*472*D8*20240112~
DTP*435*D8*20240115~
AMT*T3*3200.00~
LQ*RX*70553~
SE*20*0004~
GE*1*4~
IEA*1*000000004~`,
  },
  {
    id: "info", label: "Additional Info", color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    icon: <Info size={12}/>,
    desc: "Blue Cross requesting additional documentation for prior authorization",
    content: `ISA*00*          *00*          *ZZ*BCBSIL001      *ZZ*HOSPITAL01     *240118*1530*^*00501*000000005*0*P*:~
GS*HN*BCBSIL001*HOSPITAL01*20240118*1530*5*X*005010X214~
ST*277*0005~
BHT*0010*08*CLM-INFO-2024005*20240118*1530~
HL*1**20*1~
NM1*PR*2*BLUE CROSS BLUE SHIELD*****PI*BCBSIL001~
HL*2*1*21*1~
NM1*41*2*RELAY HEALTH*****46*443322110~
HL*3*2*22*0~
NM1*1P*2*SMITH*AMANDA*MD***XX*6677889900~
HL*4*3*PT*0~
NM1*QC*1*DOE*JOHN****HN*MEM990011~
TRN*1*CLM-INFO-2024005*1BCBSIL~
STC*R1:N0*20240118*WQ*6400.00~
REF*D9*CLM-INFO-2024005~
REF*ZZ*INFO_REQUEST~
REF*EA*PRIOR-AUTH-DOCS:PA-FORM,CLINICAL-RATIONALE,LAB-RESULTS~
DTP*472*D8*20240115~
DTP*435*D8*20240117~
AMT*T3*6400.00~
SE*19*0005~
GE*1*5~
IEA*1*000000005~`,
  },
];

// ── Mock EHR data ─────────────────────────────────────────────────────────────

const MOCK_PATIENTS = [
  { id: "P001", name: "John Doe", dob: "Mar 15, 1965", age: 59, mrn: "MRN-789012", matchScore: 98, autoSelected: true, matchReason: "Claim # and date of birth match" },
  { id: "P002", name: "John A. Doe", dob: "Nov 22, 1978", age: 46, mrn: "MRN-445521", matchScore: 71, autoSelected: false, matchReason: "Name match only" },
  { id: "P003", name: "John Doe Sr.", dob: "Jul 4, 1942", age: 82, mrn: "MRN-112233", matchScore: 45, autoSelected: false, matchReason: "Partial name match" },
];

const EHR_RECORDS: Record<string, Array<{ id: string; type: string; date: string; desc: string; size: string; icon: string; preselected?: boolean }>> = {
  IMAGING_REQUEST: [
    { id: "r1", type: "X-Ray", date: "Jan 10, 2024", desc: "Chest X-Ray PA & Lateral (CPT 71046, 71047)", size: "4.2 MB", icon: "🔬", preselected: true },
    { id: "r2", type: "Radiology Report", date: "Jan 10, 2024", desc: "Radiologist interpretation of chest X-ray", size: "48 KB", icon: "📋", preselected: true },
    { id: "r3", type: "MRI", date: "Jan 8, 2024", desc: "Brain MRI without contrast (CPT 70553)", size: "128 MB", icon: "🧲" },
    { id: "r4", type: "Clinical Notes", date: "Jan 9, 2024", desc: "Physician visit notes — follow-up", size: "32 KB", icon: "📝" },
    { id: "r5", type: "Lab Results", date: "Jan 11, 2024", desc: "CBC, BMP panel results", size: "18 KB", icon: "🧪" },
  ],
  NOTES_REQUEST: [
    { id: "r1", type: "Physician Notes", date: "Jan 12, 2024", desc: "Attending physician visit notes", size: "48 KB", icon: "📝", preselected: true },
    { id: "r2", type: "Discharge Summary", date: "Jan 10, 2024", desc: "Hospital discharge summary w/ diagnoses", size: "64 KB", icon: "🏥", preselected: true },
    { id: "r3", type: "Progress Notes", date: "Jan 5–9, 2024", desc: "Nursing progress notes — 5 days", size: "96 KB", icon: "📋" },
    { id: "r4", type: "X-Ray", date: "Jan 8, 2024", desc: "Chest X-Ray (CPT 71046)", size: "4.2 MB", icon: "🔬" },
    { id: "r5", type: "Lab Results", date: "Jan 11, 2024", desc: "CBC, BMP panel results", size: "18 KB", icon: "🧪" },
  ],
  SIGNATURE_REQUEST: [
    { id: "r1", type: "Medical Necessity Form", date: "Jan 14, 2024", desc: "CMN — Certificate of Medical Necessity (unsigned)", size: "128 KB", icon: "✍️", preselected: true },
    { id: "r2", type: "Prior Auth Form", date: "Jan 13, 2024", desc: "Prior authorization request — physician sign-off required", size: "96 KB", icon: "📋", preselected: true },
    { id: "r3", type: "Clinical Notes", date: "Jan 9, 2024", desc: "Supporting clinical documentation", size: "32 KB", icon: "📝" },
    { id: "r4", type: "X-Ray", date: "Jan 8, 2024", desc: "Chest X-Ray supporting medical necessity", size: "4.2 MB", icon: "🔬" },
  ],
  INFO_REQUEST: [
    { id: "r1", type: "Prior Auth Docs", date: "Jan 15, 2024", desc: "PA request form and clinical rationale", size: "96 KB", icon: "📋", preselected: true },
    { id: "r2", type: "Lab Results", date: "Jan 11, 2024", desc: "CBC, BMP — supporting prior auth", size: "18 KB", icon: "🧪", preselected: true },
    { id: "r3", type: "X-Ray", date: "Jan 10, 2024", desc: "Chest X-Ray (CPT 71046)", size: "4.2 MB", icon: "🔬" },
    { id: "r4", type: "MRI", date: "Jan 8, 2024", desc: "Brain MRI without contrast", size: "128 MB", icon: "🧲" },
    { id: "r5", type: "Clinical Notes", date: "Jan 9, 2024", desc: "Physician visit notes", size: "32 KB", icon: "📝" },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function deriveEmail(name: string): string {
  const SUFFIXES = new Set(["md","do","phd","dds","np","pa","rn","dc","dnp"]);
  const parts = name.toLowerCase().replace(/[^a-z\s]/g,"").trim().split(/\s+/).filter(p => p && !SUFFIXES.has(p));
  if (!parts.length) return "physician@hospital.com";
  if (parts.length === 1) return `${parts[0]}@hospital.com`;
  return `${parts[0]}.${parts[parts.length-1]}@hospital.com`;
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set());
  const [hl7Content, setHl7Content]     = useState("");
  const [hl7Tab, setHl7Tab]             = useState(false);
  const [submittingHl7, setSubmittingHl7] = useState(false);
  // EHR import modal state
  const [ehrModal, setEhrModal] = useState<{
    itemId: string; step: "match" | "records";
    selectedPatient: number; selectedRecords: Set<string>;
  } | null>(null);
  const [importedItems, setImportedItems] = useState<Record<string, EhrImport>>({});
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

  useEffect(() => { loadItems(); const t = setInterval(loadItems, 10_000); return () => clearInterval(t); }, []); // eslint-disable-line

  function toggleExpanded(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function getField<K extends keyof Corrections>(item: InboxItem, field: K): string {
    const c = corrections[item.id];
    if (c?.[field] !== undefined) return c[field] as string;
    if (field === "physicianName")        return item.physicianName || "";
    if (field === "physicianEmail")       return item.physicianEmail || "";
    if (field === "classificationLabel")  return item.classification?.label || "";
    if (field === "classificationBucket") return item.classification?.bucket || "";
    if (field === "routingDepartment")    return item.routingDepartment || "";
    if (field === "payer")                return item.payer || "";
    if (field === "sender")               return item.sender || "";
    return "";
  }

  function applyCorrection(id: string, field: keyof Corrections, value: string) {
    setCorrections(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }
  function undoCorrections(id: string) {
    setCorrections(prev => { const n = { ...prev }; delete n[id]; return n; });
  }
  function hasCorrections(id: string) { const c = corrections[id]; return c && Object.keys(c).length > 0; }

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".pdf")) { showToast("Only PDF files are supported.", "error"); return; }
    setUploading(true);
    try {
      const form = new FormData(); form.append("document", file);
      const res = await fetch("/api/fax?path=upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      showToast(`"${file.name}" uploaded — AI pipeline running…`, "success"); loadItems();
    } catch (e: any) { showToast(e.message, "error"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) handleUpload(f); }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }

  async function handleSubmitHl7() {
    const content = hl7Content.trim();
    if (!content) { showToast("Paste an X12 277 EDI message first.", "error"); return; }
    if (!content.startsWith("ISA")) { showToast("Content must start with ISA.", "error"); return; }
    setSubmittingHl7(true);
    try {
      const res = await fetch("/api/fax?path=ingest-hl7", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ediContent: content }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingestion failed");
      showToast("HL7 277 ingested successfully", "success"); setHl7Content(""); setHl7Tab(false); loadItems();
    } catch (e: any) { showToast(e.message, "error"); }
    finally { setSubmittingHl7(false); }
  }

  function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation(); setDeleting(id);
    fetch(`/api/fax?path=inbox-items/${id}`, { method: "DELETE" })
      .then(() => { setItems(p => p.filter(i => i.id !== id)); undoCorrections(id); })
      .catch(err => showToast(err.message, "error"))
      .finally(() => setDeleting(null));
  }

  function handleCreateEnvelope(item: InboxItem) {
    setCreating(item.id);
    const corr = corrections[item.id] || {};
    const physicianName  = corr.physicianName  || item.physicianName;
    const physicianEmail = corr.physicianEmail || item.physicianEmail || (physicianName ? deriveEmail(physicianName) : undefined);
    fetch(`/api/fax?path=create-envelope/${item.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl: window.location.origin, physicianName, physicianEmail }),
    })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); showToast("Envelope created — opening DocuSign…", "success"); loadItems(); if (d.senderViewUrl) window.location.href = d.senderViewUrl; })
      .catch(e => showToast(e.message, "error"))
      .finally(() => setCreating(null));
  }

  function handleSendToPayer(id: string) {
    setActioning(id);
    fetch(`/api/fax?path=send-to-payer/${id}`, { method: "POST" })
      .then(() => showToast("Response sent back to payer", "success"))
      .catch(err => showToast(err.message, "error"))
      .finally(() => setActioning(null));
  }

  // Open EHR import modal — auto-preselect first patient and preselected records
  function openEhrModal(item: InboxItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    const reqType = item.hl7RequestType || "INFO_REQUEST";
    const records = EHR_RECORDS[reqType] || EHR_RECORDS.INFO_REQUEST;
    const preSelected = new Set(records.filter(r => r.preselected).map(r => r.id));
    setEhrModal({ itemId: item.id, step: "match", selectedPatient: 0, selectedRecords: preSelected });
  }

  function handleEhrImport() {
    if (!ehrModal) return;
    const item = items.find(i => i.id === ehrModal.itemId);
    const patient = MOCK_PATIENTS[ehrModal.selectedPatient];
    const needsSignature = item?.hl7RequestType === "SIGNATURE_REQUEST";
    setImportedItems(prev => ({
      ...prev,
      [ehrModal.itemId]: { patientName: patient.name, records: Array.from(ehrModal.selectedRecords), needsSignature },
    }));
    showToast(`${ehrModal.selectedRecords.size} record(s) imported from EHR`, "success");
    setEhrModal(null);
  }

  const processingItems = items.filter(i => i.status === "processing");
  const processedItems  = items.filter(i => i.status !== "processing");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto pb-12">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.type === "success" ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14}/></button>
        </div>
      )}

      {/* EHR Import Modal */}
      {ehrModal && <EhrModal
        item={items.find(i => i.id === ehrModal.itemId)!}
        modal={ehrModal}
        onClose={() => setEhrModal(null)}
        onImport={handleEhrImport}
        onUpdate={setEhrModal}
      />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreement Desk</h1>
          <p className="text-sm text-gray-400 mt-0.5">AI-powered document intake and signature routing</p>
        </div>
        <button onClick={() => { setRefreshing(true); fetch("/api/fax?path=poll-now", { method: "POST" }).then(() => loadItems()).finally(() => setRefreshing(false)); }} disabled={refreshing}
          className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors">
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""}/>{refreshing ? "Checking…" : "Check Now"}
        </button>
      </div>

      {/* Upload / Intake zone */}
      <div className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8">
        <div className="flex border-b border-gray-100 bg-gray-50">
          <button onClick={() => setHl7Tab(false)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${!hl7Tab ? "border-[#26154a] text-[#26154a] bg-white" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            <Upload size={14}/> PDF / Document
          </button>
          <button onClick={() => setHl7Tab(true)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${hl7Tab ? "border-[#26154a] text-[#26154a] bg-white" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            <Activity size={14}/> HL7 X12 277
          </button>
        </div>

        {!hl7Tab && (
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`relative cursor-pointer transition-all ${dragOver ? "bg-purple-50" : "bg-white hover:bg-gray-50/60"}`}>
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              {uploading ? (
                <><div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-3"><Loader2 size={22} className="text-[#26154a] animate-spin"/></div>
                <p className="font-semibold text-[#26154a]">Uploading & starting AI pipeline…</p></>
              ) : (
                <><div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${dragOver ? "bg-[#26154a]" : "bg-purple-50 border border-purple-100"}`}>
                  <Upload size={20} className={dragOver ? "text-white" : "text-[#26154a]"}/></div>
                <p className="font-semibold text-gray-800 mb-1">{dragOver ? "Drop to upload" : "Drop a PDF or click to upload"}</p>
                <p className="text-sm text-gray-400 mb-4">AI classifies, extracts, and prepares the envelope automatically</p>
                <div className="flex items-center gap-3 text-xs text-gray-400 mb-2"><span className="w-10 h-px bg-gray-200"/> or email directly to <span className="w-10 h-px bg-gray-200"/></div>
                <p className="font-mono text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-[#26154a]">jane-goodwin-co-part-11@mail31.demo.docusign.net</p></>
              )}
            </div>
          </div>
        )}

        {hl7Tab && (
          <div className="bg-white p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Activity size={18} className="text-indigo-500"/>
              </div>
              <div>
                <p className="font-semibold text-gray-800">Submit an HL7 X12 277</p>
                <p className="text-sm text-gray-400 mt-0.5">Paste a raw X12 EDI 277 Health Care Information Status Notification. Payer, sender, and claim details are decoded automatically. No document attachment required.</p>
              </div>
            </div>
            {/* Sample chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {EDI_SAMPLES.map(s => (
                <button key={s.id} onClick={() => setHl7Content(s.content)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors hover:opacity-80 ${s.color}`}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
            {hl7Content && (
              <p className="text-xs text-gray-500 italic mb-2">
                {EDI_SAMPLES.find(s => s.content === hl7Content)?.desc}
              </p>
            )}
            <textarea value={hl7Content} onChange={e => setHl7Content(e.target.value)}
              placeholder={"Paste X12 277 EDI here, or click a sample above…"}
              rows={7}
              className="w-full font-mono text-xs border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50 text-gray-700 resize-none"/>
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-400">Must start with <code className="bg-gray-100 px-1 rounded">ISA</code> — X12 5010 format</p>
              <button onClick={handleSubmitHl7} disabled={submittingHl7 || !hl7Content.trim()}
                className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {submittingHl7 ? <><Loader2 size={13} className="animate-spin"/> Ingesting…</> : <><Activity size={13}/> Ingest 277</>}
              </button>
            </div>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput}/>

      {/* Loading skeleton */}
      {loading && <div className="space-y-3">{[1,2,3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 animate-pulse flex items-center gap-4">
          <div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0"/>
          <div className="flex-1 space-y-2"><div className="h-3.5 w-48 bg-gray-200 rounded"/><div className="h-3 w-32 bg-gray-100 rounded"/></div>
          <div className="h-6 w-28 bg-gray-100 rounded-full"/><div className="h-8 w-28 bg-gray-200 rounded-lg"/>
        </div>
      ))}</div>}

      {/* Processing cards */}
      {!loading && processingItems.length > 0 && (
        <div className="space-y-4 mb-6">
          {processingItems.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-[#26154a] via-blue-400 to-[#26154a] bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]"/>
              <div className="px-6 py-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><FileText size={16} className="text-blue-500"/></div>
                    <div><p className="font-semibold text-gray-900">{item.filename}</p><p className="text-sm text-gray-400">{formatDate(item.receivedAt)}</p></div>
                  </div>
                  <span className="text-sm text-blue-500 font-medium bg-blue-50 px-2.5 py-1 rounded-full flex items-center gap-1.5"><Loader2 size={11} className="animate-spin"/> Processing</span>
                </div>
                <ProgressBar activeStep={1} small/>
                <p className="text-sm text-blue-500 mt-3">Running OCR → classification → envelope prep…</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Processed items */}
      {!loading && processedItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {processingItems.length > 0 && (
            <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Processed — {processedItems.length} document{processedItems.length !== 1 ? "s" : ""}
            </div>
          )}

          {processedItems.map(item => {
            const isExpanded  = expandedIds.has(item.id);
            const bucket      = getField(item, "classificationBucket") || item.classification?.bucket || "";
            const label       = getField(item, "classificationLabel")  || item.classification?.label  || "";
            const physician   = getField(item, "physicianName");
            const department  = getField(item, "routingDepartment");
            const payer       = getField(item, "payer");
            const corrected   = hasCorrections(item.id);
            const needsSig    = item.classification?.needsSignature;
            const accentCls   = BUCKET_ACCENT[bucket] || "border-l-gray-200";
            const activeStep  = getActiveStep(item);
            const isHl7       = item.source === "hl7_277";
            const imported    = importedItems[item.id];
            const reqType     = item.hl7RequestType || "INFO_REQUEST";

            return (
              <div key={item.id} className={`border-b border-gray-100 last:border-0 border-l-4 ${accentCls}`}>
                {/* Collapsed row */}
                <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50/70 transition-colors"
                  onClick={() => toggleExpanded(item.id)}>
                  <div className="text-gray-300 shrink-0">
                    {isExpanded ? <ChevronDown size={14} className="text-[#26154a]"/> : <ChevronRight size={14}/>}
                  </div>
                  <div className="flex items-center gap-2 min-w-0 flex-[2]">
                    {isHl7 ? <Activity size={13} className="text-indigo-400 shrink-0"/> : <FileText size={13} className="text-gray-300 shrink-0"/>}
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-800 truncate block">{item.filename}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400">{formatDate(item.receivedAt)}</span>
                        {isHl7 && <span className="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-px rounded-full font-medium">HL7 277</span>}
                        {corrected && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-px rounded-full font-medium">edited</span>}
                        {imported && <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-px rounded-full font-medium">EHR imported</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex-[1.5] flex items-center gap-2">
                    {item.status === "error" ? <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> Error</span>
                    : item.classification ? <>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${BUCKET_COLORS[bucket] || "bg-gray-100 text-gray-500 border-gray-200"}`}>{label}</span>
                      <span className="text-xs text-gray-400">{item.classification.confidence}%</span>
                    </> : null}
                  </div>
                  <div className="flex-1 hidden md:block min-w-0">
                    {payer ? <div className="flex items-center gap-1"><Building2 size={11} className="text-gray-400 shrink-0"/><span className="text-xs text-gray-600 truncate">{payer}</span></div>
                    : <span className="text-xs text-gray-300">—</span>}
                  </div>
                  <div className="shrink-0">
                    {item.status === "signed" ? <span className="flex items-center gap-1 text-xs font-medium text-green-600"><CheckCircle size={12}/> Signed</span>
                    : needsSig ? <span className="flex items-center gap-1 text-xs font-medium text-orange-500"><Clock size={12}/> Required</span>
                    : <span className="flex items-center gap-1 text-xs text-gray-400"><CheckCircle size={12}/> Not needed</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                    <ItemActions item={item} imported={imported} reqType={reqType} creating={creating} actioning={actioning}
                      onEnvelope={() => handleCreateEnvelope(item)} onEhr={e => openEhrModal(item, e)}
                      onPayer={() => handleSendToPayer(item.id)} compact/>
                    <button onClick={e => handleDelete(item.id, e)} disabled={deleting === item.id}
                      className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                      {deleting === item.id ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
                    </button>
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 bg-gray-50/50 border-t border-gray-100">
                    <ProgressBar activeStep={activeStep} small={false}/>

                    {/* AI Summary */}
                    {item.summary && (
                      <div className="bg-white border border-purple-100 rounded-xl px-4 py-3 mb-4 mt-4">
                        <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
                          {isHl7 ? "HL7 Decoded Summary" : "AI Summary"}
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">{item.summary}</p>
                        {item.claimId && <p className="text-xs text-gray-400 mt-1.5 font-mono">Claim # {item.claimId}</p>}
                      </div>
                    )}

                    {/* Info grid — 3 columns */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <InfoCard label="Classification" icon={<FileSearch size={13} className="text-gray-400"/>}>
                        <div className="relative mt-1">
                          <select value={bucket}
                            onChange={e => { const o = BUCKET_OPTIONS.find(x => x.id === e.target.value); if (o) { applyCorrection(item.id, "classificationBucket", o.id); applyCorrection(item.id, "classificationLabel", o.label); } }}
                            className="w-full text-sm font-semibold pl-1 pr-6 py-0.5 rounded-lg border-0 bg-transparent appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300">
                            {BUCKET_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                        </div>
                      </InfoCard>

                      <InfoCard label="Department" icon={<MapPin size={13} className="text-gray-400"/>}>
                        <EditableField id={item.id} field="routingDepartment" value={department} placeholder="Click to set"
                          editingField={editingField} setEditingField={setEditingField} applyCorrection={applyCorrection}/>
                      </InfoCard>

                      <InfoCard label="Signature" icon={<Shield size={13} className="text-gray-400"/>}>
                        <div className="mt-1">
                          {item.status === "signed" ? <span className="flex items-center gap-1 text-sm font-medium text-green-600"><CheckCircle size={14}/> Signed</span>
                          : needsSig ? <span className="flex items-center gap-1 text-sm font-medium text-orange-500"><Clock size={14}/> Required</span>
                          : <span className="flex items-center gap-1 text-sm text-gray-500"><CheckCircle size={14} className="text-gray-400"/> Not required</span>}
                        </div>
                      </InfoCard>

                      {!isHl7 && (
                        <InfoCard label="Patient" icon={<User size={13} className="text-gray-400"/>}>
                          <p className="text-sm text-gray-800 mt-1 font-medium">{item.patientName || <span className="text-gray-400 italic font-normal">Unknown patient</span>}</p>
                        </InfoCard>
                      )}

                      {!isHl7 && (
                        <InfoCard label="Ordering Physician" icon={<Stethoscope size={13} className="text-gray-400"/>}>
                          <EditableField id={item.id} field="physicianName" value={physician} placeholder="Unknown physician"
                            editingField={editingField} setEditingField={setEditingField}
                            applyCorrection={(id, field, val) => {
                              applyCorrection(id, field, val);
                              if (!corrections[id]?.physicianEmail) applyCorrection(id, "physicianEmail", deriveEmail(val));
                            }}/>
                        </InfoCard>
                      )}

                      <InfoCard label="Payer" icon={<Building2 size={13} className="text-gray-400"/>}>
                        <EditableField id={item.id} field="payer" value={payer} placeholder="Unknown payer"
                          editingField={editingField} setEditingField={setEditingField} applyCorrection={applyCorrection}/>
                      </InfoCard>
                    </div>

                    {/* EHR import summary if done */}
                    {imported && (
                      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
                        <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5"/>
                        <div>
                          <p className="text-sm font-semibold text-green-700">EHR Records Imported</p>
                          <p className="text-xs text-green-600 mt-0.5">
                            Patient: {imported.patientName} · {imported.records.length} record(s) attached
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                      <ItemActions item={item} imported={imported} reqType={reqType} creating={creating} actioning={actioning}
                        onEnvelope={() => handleCreateEnvelope(item)} onEhr={() => openEhrModal(item)}
                        onPayer={() => handleSendToPayer(item.id)} compact={false}/>
                      {item.status === "signed" && (
                        <button onClick={() => handleSendToPayer(item.id)} disabled={actioning === item.id}
                          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
                          <ArrowLeftRight size={13}/> Send to Payer
                        </button>
                      )}
                      {item.status === "envelope_created" && item.draftEnvelopeId && (
                        <a href={`https://apps-d.docusign.com/send/prepare/${item.draftEnvelopeId}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                          <ExternalLink size={13}/> View in DocuSign
                        </a>
                      )}
                      {corrected && (
                        <button onClick={() => undoCorrections(item.id)}
                          className="flex items-center gap-1.5 text-sm font-medium text-amber-500 hover:text-amber-600 px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors ml-auto">
                          <RotateCcw size={13}/> Undo Changes
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

      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <FileText size={32} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">No documents yet — upload a PDF or submit an HL7 277 above</p>
        </div>
      )}

      {items.length > 0 && (
        <p className="text-xs text-gray-400 text-center mt-4">
          Auto-refreshes every 10s · {processedItems.length} processed · {processingItems.length} in progress
        </p>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ activeStep, small }: { activeStep: number; small: boolean }) {
  const steps = ["Upload", "Classify", "Sig. Action", "Prepare", "Send"];
  return (
    <div className={`flex items-center ${small ? "mb-4" : "my-4"}`}>
      {steps.map((step, i) => {
        const done = activeStep > i; const active = activeStep === i;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`${small ? "w-7 h-7 text-xs" : "w-6 h-6 text-[11px]"} rounded-full flex items-center justify-center font-bold border-2 ${
                done ? "border-[#26154a] bg-[#26154a] text-white" : active ? "border-blue-400 bg-white text-blue-500 shadow-sm" : "border-gray-200 bg-white text-gray-300"}`}>
                {done ? <CheckCircle size={small ? 14 : 12}/> : active ? <Loader2 size={small ? 11 : 10} className="animate-spin"/> : i + 1}
              </div>
              <span className={`text-[11px] mt-1 font-medium whitespace-nowrap ${done || active ? "text-[#26154a]" : "text-gray-300"}`}>{step}</span>
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-1 mb-4 rounded-full ${done ? "bg-[#26154a]" : "bg-gray-200"}`}/>}
          </div>
        );
      })}
    </div>
  );
}

function InfoCard({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      {children}
    </div>
  );
}

function EditableField({ id, field, value, placeholder, editingField, setEditingField, applyCorrection }: {
  id: string; field: keyof Corrections; value: string; placeholder: string;
  editingField: { id: string; field: string } | null;
  setEditingField: (v: { id: string; field: string } | null) => void;
  applyCorrection: (id: string, field: keyof Corrections, val: string) => void;
}) {
  const editing = editingField?.id === id && editingField?.field === field;
  if (editing) {
    return (
      <input autoFocus type="text" defaultValue={value}
        onBlur={e => { applyCorrection(id, field, e.target.value); setEditingField(null); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingField(null); }}
        className="w-full text-sm mt-1 px-2 py-0.5 rounded border border-purple-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"/>
    );
  }
  return (
    <button onClick={() => setEditingField({ id, field: field as string })}
      className="w-full text-left flex items-center justify-between gap-1 mt-1 group">
      <span className={`text-sm ${value ? "text-gray-800 font-medium" : "text-gray-400 italic"}`}>{value || placeholder}</span>
      <Pencil size={10} className="text-gray-300 group-hover:text-purple-400 shrink-0"/>
    </button>
  );
}

function ItemActions({ item, imported, reqType, creating, actioning, onEnvelope, onEhr, onPayer, compact }: {
  item: InboxItem; imported?: EhrImport; reqType: string;
  creating: string | null; actioning: string | null;
  onEnvelope: () => void; onEhr: (e?: React.MouseEvent) => void;
  onPayer: () => void; compact: boolean;
}) {
  const cls = compact
    ? "flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
    : "flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60";
  const iconSz = compact ? 11 : 13;

  // After EHR import
  if (imported) {
    if (imported.needsSignature) {
      return (
        <button onClick={onEnvelope} disabled={creating === item.id} className={`${cls} bg-[#26154a] text-white hover:bg-[#3a2060]`}>
          {creating === item.id ? <><Loader2 size={iconSz} className="animate-spin"/> Sending…</> : <><Send size={iconSz}/> {compact ? "Physician Workspace" : "Send to Physician Workspace"}</>}
        </button>
      );
    }
    return (
      <button onClick={onPayer} disabled={actioning === item.id} className={`${cls} bg-blue-600 text-white hover:bg-blue-700`}>
        {actioning === item.id ? <><Loader2 size={iconSz} className="animate-spin"/> Sending…</> : <><ArrowLeftRight size={iconSz}/> {compact ? "Send to Payer" : "Send Back to Payer"}</>}
      </button>
    );
  }

  const isHl7 = item.source === "hl7_277";
  const needsSig = item.classification?.needsSignature;

  // HL7 items always show Import from EHR until imported
  if (isHl7 && item.status === "classified") {
    return (
      <button onClick={e => onEhr(e)} className={`${cls} bg-indigo-600 text-white hover:bg-indigo-700`}>
        <Database size={iconSz}/> {compact ? "Import EHR" : "Import from EHR"}
      </button>
    );
  }

  // PDF items
  if (item.status === "classified" && needsSig) {
    return (
      <button onClick={onEnvelope} disabled={creating === item.id} className={`${cls} bg-[#26154a] text-white hover:bg-[#3a2060]`}>
        {creating === item.id ? <><Loader2 size={iconSz} className="animate-spin"/> Sending…</> : <><Send size={iconSz}/> {compact ? "Physician Workspace" : "Send to Physician Workspace"}</>}
      </button>
    );
  }
  if (item.status === "classified" && !needsSig) {
    return (
      <button onClick={e => onEhr(e)} className={`${cls} bg-teal-600 text-white hover:bg-teal-700`}>
        <Database size={iconSz}/> {compact ? "Import EHR" : "Import from EHR"}
      </button>
    );
  }
  return null;
}

// ── EHR Import Modal ──────────────────────────────────────────────────────────

function EhrModal({ item, modal, onClose, onImport, onUpdate }: {
  item: InboxItem;
  modal: { itemId: string; step: "match" | "records"; selectedPatient: number; selectedRecords: Set<string> };
  onClose: () => void; onImport: () => void;
  onUpdate: (m: typeof modal) => void;
}) {
  const reqType = item?.hl7RequestType || "INFO_REQUEST";
  const records = EHR_RECORDS[reqType] || EHR_RECORDS.INFO_REQUEST;

  function toggleRecord(id: string) {
    const next = new Set(modal.selectedRecords);
    next.has(id) ? next.delete(id) : next.add(id);
    onUpdate({ ...modal, selectedRecords: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Import from EHR</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {modal.step === "match" ? "Step 1 of 2 — Match patient record" : "Step 2 of 2 — Select records to import"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><X size={16}/></button>
        </div>

        {/* Step 1 — Patient match */}
        {modal.step === "match" && (
          <div className="px-6 py-5">
            <p className="text-sm text-gray-500 mb-4">3 records matched on <strong className="text-gray-800">John Doe</strong>. One was auto-selected based on age and claim number.</p>
            <div className="space-y-3">
              {MOCK_PATIENTS.map((p, idx) => (
                <button key={p.id} onClick={() => onUpdate({ ...modal, selectedPatient: idx })}
                  className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${modal.selectedPatient === idx ? "border-[#26154a] bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        {p.autoSelected && <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-semibold">Auto-matched</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">DOB: {p.dob} · Age {p.age} · MRN: {p.mrn}</p>
                      <p className="text-xs text-gray-400">{p.matchReason}</p>
                    </div>
                    <div className={`text-sm font-bold ${p.matchScore >= 90 ? "text-green-600" : p.matchScore >= 60 ? "text-orange-500" : "text-red-500"}`}>
                      {p.matchScore}%
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className={`h-full rounded-full ${p.matchScore >= 90 ? "bg-green-500" : p.matchScore >= 60 ? "bg-orange-400" : "bg-red-400"}`} style={{ width: `${p.matchScore}%` }}/>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => onUpdate({ ...modal, step: "records" })}
                className="flex items-center gap-1.5 bg-[#26154a] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#3a2060] transition-colors">
                Next <ChevronRight size={14}/>
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Records selection */}
        {modal.step === "records" && (
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-700">
              <User size={14} className="text-gray-400"/>
              <strong>{MOCK_PATIENTS[modal.selectedPatient].name}</strong>
              <span className="text-gray-400">· MRN: {MOCK_PATIENTS[modal.selectedPatient].mrn}</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">Select which records to import. Pre-selected records match this request type.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {records.map(r => (
                <button key={r.id} onClick={() => toggleRecord(r.id)}
                  className={`w-full text-left flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${modal.selectedRecords.has(r.id) ? "border-[#26154a] bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${modal.selectedRecords.has(r.id) ? "border-[#26154a] bg-[#26154a]" : "border-gray-300"}`}>
                    {modal.selectedRecords.has(r.id) && <CheckCircle size={12} className="text-white"/>}
                  </div>
                  <span className="text-xl shrink-0">{r.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800">{r.type}</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{r.size}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{r.desc}</p>
                    <p className="text-xs text-gray-400">{r.date}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mt-5">
              <button onClick={() => onUpdate({ ...modal, step: "match" })}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                <ChevronRight size={13} className="rotate-180"/> Back
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={onImport} disabled={modal.selectedRecords.size === 0}
                  className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  <Database size={13}/> Import {modal.selectedRecords.size} Record{modal.selectedRecords.size !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

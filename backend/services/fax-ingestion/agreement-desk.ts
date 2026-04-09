/**
 * Agreement Desk Ingestion Service
 *
 * Polls the DocuSign Agreement Desk Inbox folder every 60 seconds.
 * New documents (faxed/emailed to jane-goodwin-co-part-11@mail31.demo.docusign.net)
 * are automatically downloaded and run through the 3-skill AI pipeline:
 *   1. healthcare-fax-ingestion  — OCR + field extraction
 *   2. healthcare-doc-classification — bucket + action
 *   3. healthcare-envelope-prep  — tab placement config
 *
 * Results are kept in memory. The UI polls GET /api/fax/inbox-items for updates.
 */
import axios from "axios";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { simpleParser } from "mailparser";
import { runFullPipeline } from "../ai-pipeline";
import { getAccessToken } from "../docusign/jwt-auth";
import { parseX12_277, build277Summary } from "../hl7/x12-277-parser";

const DS_BASE_URL = () => process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi";
const DS_ACCOUNT_ID = () => process.env.DOCUSIGN_ACCOUNT_ID!;
const INBOX_FOLDER_ID = process.env.AGREEMENT_DESK_INBOX_FOLDER_ID || "d612e145-619c-4525-87f1-0d14a5300eb2";

// ── Persistence (JSON file) ───────────────────────────────────────────────────
// Items survive server restarts (but not Railway redeploys, which wipe the FS).
// _pdfBase64 is excluded from the persisted file to keep it small.

const PERSIST_PATH = process.env.INBOX_PERSIST_PATH
  || path.join(process.cwd(), "data", "inbox.json");

function persistItems() {
  try {
    const dir = path.dirname(PERSIST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rows = Array.from(inboxItems.values()).map(item => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _pdfBase64, pipelineResult, ...rest } = item;
      return rest;
    });
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(rows, null, 2), "utf8");
  } catch (e: any) {
    console.warn("[agreement-desk] Could not persist inbox:", e.message);
  }
}

function loadPersistedItems() {
  try {
    if (!fs.existsSync(PERSIST_PATH)) return;
    const raw = fs.readFileSync(PERSIST_PATH, "utf8");
    const rows: InboxItem[] = JSON.parse(raw);
    for (const item of rows) {
      // Don't restore items stuck in "processing" — they'll never finish
      if (item.status === "processing") item.status = "error" as any;
      inboxItems.set(item.id, item);
    }
    console.log(`[agreement-desk] Loaded ${rows.length} persisted inbox item(s)`);
  } catch (e: any) {
    console.warn("[agreement-desk] Could not load persisted inbox:", e.message);
  }
}

// ── In-memory store ──────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;                 // DocuSign envelope ID or upload_<uuid>
  filename: string;
  receivedAt: string;
  status: "processing" | "classified" | "envelope_created" | "signed" | "error";
  source?: "docusign" | "upload" | "hl7_277";
  classification?: {
    bucket: string;
    label: string;
    confidence: number;
    action: string;           // SIGNATURE_NEEDED | ALREADY_SIGNED | NO_SIGNATURE_REQUIRED | MANUAL_REVIEW
    needsSignature: boolean;
  };
  summary?: string;           // AI-generated or parsed document summary
  routingDepartment?: string; // clinical department this routes to
  payer?: string;             // insurance payer (populated from HL7 277 or AI)
  sender?: string;            // submitter / clearing-house (populated from HL7 277)
  claimId?: string;           // claim reference number from HL7 277
  patientName?: string;       // patient name extracted from AI pipeline
  physicianName?: string;
  physicianEmail?: string;    // derived as firstname.lastname@hospital.com
  pipelineResult?: any;
  draftEnvelopeId?: string;   // set once draft is created in DocuSign
  error?: string;
  _pdfBase64?: string;        // stored for uploaded files (no DocuSign envelope to re-download)
}

const inboxItems = new Map<string, InboxItem>();
let pollingInterval: NodeJS.Timeout | null = null;

// Load any previously persisted items on module load
loadPersistedItems();

// ── Helpers ──────────────────────────────────────────────────────────────────

// Medical suffixes to strip from physician names before deriving email
const MEDICAL_SUFFIXES = new Set(["md", "do", "phd", "dds", "dmd", "np", "pa", "rn", "dc", "od", "dpm", "pharmd", "dnp"]);

export function derivePhysicianEmail(name: string | undefined): string {
  if (!name) return "physician@hospital.com";
  const parts = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")  // strip punctuation
    .trim()
    .split(/\s+/)
    .filter(p => p && !MEDICAL_SUFFIXES.has(p));  // drop medical suffixes

  if (parts.length === 0) return "physician@hospital.com";
  if (parts.length === 1) return `${parts[0]}@hospital.com`;
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first}.${last}@hospital.com`;
}

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

// ── DocuSign API helpers ─────────────────────────────────────────────────────

async function getInboxEnvelopes(): Promise<any[]> {
  const accessToken = await getAccessToken();

  // Look back 90 days to catch all recent faxes
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 90);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  // Try folder-specific first, fall back to all envelopes if empty
  const tryFetch = async (params: Record<string, any>) => {
    const response = await axios.get(
      `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes`,
      { headers: { Authorization: `Bearer ${accessToken}` }, params }
    );
    return response.data?.envelopes || [];
  };

  // First: poll the specific Agreement Desk inbox folder
  let envelopes = await tryFetch({
    folder_ids: INBOX_FOLDER_ID,
    from_date: fromDateStr,
    count: 50,
    start_position: 0,
  });

  // Fallback: if folder returns nothing new, also check all recent envelopes
  // (catches faxes that may land in a different folder)
  if (envelopes.length === 0) {
    envelopes = await tryFetch({
      from_date: fromDateStr,
      count: 50,
      start_position: 0,
      status: "created,sent,delivered,signed,completed",
    });
  }

  return envelopes;
}

async function downloadDocumentAsBase64(
  envelopeId: string
): Promise<{ pdfBase64: string; filename: string } | null> {
  const accessToken = await getAccessToken();
  try {
    const docsResponse = await axios.get(
      `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes/${envelopeId}/documents`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const docs = docsResponse.data?.envelopeDocuments || [];
    const doc = docs.find((d: any) => d.documentId !== "certificate") || docs[0];
    if (!doc) return null;

    const pdfResponse = await axios.get(
      `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes/${envelopeId}/documents/${doc.documentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "arraybuffer" }
    );
    return {
      pdfBase64: Buffer.from(pdfResponse.data).toString("base64"),
      filename: doc.name || `fax_${envelopeId}.pdf`,
    };
  } catch (err: any) {
    console.error(`[agreement-desk] Download failed for ${envelopeId}:`, err.message);
    return null;
  }
}

// ── Core processing ──────────────────────────────────────────────────────────

async function processEnvelope(envelopeId: string, emailSubject: string, receivedAt: string) {
  // Mark as processing immediately so UI shows spinner
  inboxItems.set(envelopeId, {
    id: envelopeId,
    filename: emailSubject.replace(/^Complete with Docusign:\s*/i, "").trim() || `fax_${envelopeId}.pdf`,
    receivedAt,
    status: "processing",
  });
  persistItems();

  try {
    const downloaded = await downloadDocumentAsBase64(envelopeId);
    if (!downloaded) throw new Error("Could not download PDF from DocuSign");

    // Update filename from actual document
    const item = inboxItems.get(envelopeId)!;
    item.filename = downloaded.filename;
    inboxItems.set(envelopeId, item);

    console.log(`[agreement-desk] Running AI pipeline on: ${downloaded.filename}`);
    const pipeline = await runFullPipeline(downloaded.pdfBase64, downloaded.filename);

    const cls = pipeline.classification?.classification;
    const ing = pipeline.ingestion;
    const physicianName = ing?.provider?.ordering_physician_name ?? undefined;
    const physicianEmail = derivePhysicianEmail(physicianName);
    const patientName = ing?.patient?.name ?? pipeline.envelopePrep?.patient_name ?? undefined;

    const needsSignature = cls?.action === "SIGNATURE_NEEDED";
    const bucket = cls?.bucket || "UNKNOWN";

    inboxItems.set(envelopeId, {
      id: envelopeId,
      filename: downloaded.filename,
      receivedAt,
      status: "classified",
      classification: {
        bucket,
        label: BUCKET_LABELS[bucket] || bucket,
        confidence: Math.round((cls?.confidence || 0) * 100),
        action: cls?.action || "MANUAL_REVIEW",
        needsSignature,
      },
      summary: cls?.summary ?? undefined,
      routingDepartment: cls?.routing_department ?? undefined,
      patientName: patientName ?? undefined,
      physicianName: physicianName ?? undefined,
      physicianEmail: physicianEmail ?? undefined,
      pipelineResult: pipeline,
    });
    persistItems();

    console.log(`[agreement-desk] ✓ ${downloaded.filename} → ${bucket} (${Math.round((cls?.confidence || 0) * 100)}%) needs_sig=${needsSignature}`);
  } catch (err: any) {
    console.error(`[agreement-desk] Pipeline error for ${envelopeId}:`, err.message);
    const existing = inboxItems.get(envelopeId);
    inboxItems.set(envelopeId, {
      ...(existing || { id: envelopeId, filename: `fax_${envelopeId}.pdf`, receivedAt }),
      status: "error",
      error: err.message,
    });
    persistItems();
  }
}

// ── Manual upload processing ─────────────────────────────────────────────────

/** Process a manually uploaded PDF — adds to inbox and runs AI pipeline */
export async function processUploadedFile(pdfBase64: string, filename: string): Promise<InboxItem> {
  const id = `upload_${randomUUID()}`;
  const receivedAt = new Date().toISOString();

  const item: InboxItem = { id, filename, receivedAt, status: "processing", source: "upload", _pdfBase64: pdfBase64 };
  inboxItems.set(id, item);
  persistItems();

  // Fire-and-forget pipeline
  (async () => {
    try {
      console.log(`[agreement-desk] Running AI pipeline on uploaded file: ${filename}`);
      const pipeline = await runFullPipeline(pdfBase64, filename);
      const cls = pipeline.classification?.classification;
      const ing = pipeline.ingestion;
      const physicianName = ing?.provider?.ordering_physician_name ?? undefined;
      const physicianEmail = derivePhysicianEmail(physicianName);
      const patientName = ing?.patient?.name ?? pipeline.envelopePrep?.patient_name ?? undefined;
      const needsSignature = cls?.action === "SIGNATURE_NEEDED";
      const bucket = cls?.bucket || "UNKNOWN";

      // Re-fetch item from map (in case it was updated externally) but keep _pdfBase64
      const current = inboxItems.get(id) || item;
      inboxItems.set(id, {
        ...current,
        status: "classified",
        classification: {
          bucket,
          label: BUCKET_LABELS[bucket] || bucket,
          confidence: Math.round((cls?.confidence || 0) * 100),
          action: cls?.action || "MANUAL_REVIEW",
          needsSignature,
        },
        summary: cls?.summary ?? undefined,
        routingDepartment: cls?.routing_department ?? undefined,
        patientName: patientName ?? undefined,
        physicianName,
        physicianEmail,
        pipelineResult: pipeline,
      });
      persistItems();
      console.log(`[agreement-desk] ✓ Upload ${filename} → ${bucket} needs_sig=${needsSignature}`);
    } catch (err: any) {
      console.error(`[agreement-desk] Upload pipeline error for ${filename}:`, err.message);
      inboxItems.set(id, { ...(inboxItems.get(id) || item), status: "error", error: err.message });
      persistItems();
    }
  })();

  return inboxItems.get(id)!;
}

// ── Polling loop ─────────────────────────────────────────────────────────────

export async function runPoll() {
  try {
    const envelopes = await getInboxEnvelopes();
    for (const env of envelopes) {
      if (!inboxItems.has(env.envelopeId)) {
        console.log(`[agreement-desk] New fax detected: ${env.emailSubject} (${env.envelopeId})`);
        processEnvelope(env.envelopeId, env.emailSubject || "", env.createdDateTime || new Date().toISOString());
      }
    }
    // Also check if any pending envelopes have been signed
    await checkSignedEnvelopes();
  } catch (err: any) {
    console.error("[agreement-desk] Poll error:", err.message);
  }
}

export function startPolling(intervalMs = 60_000) {
  if (pollingInterval) return;
  console.log(`[agreement-desk] Auto-polling started (every ${intervalMs / 1000}s)`);
  runPoll(); // immediate first run
  pollingInterval = setInterval(runPoll, intervalMs);
}

export function stopPolling() {
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Returns all inbox items sorted newest-first */
export function getInboxItems(): InboxItem[] {
  return Array.from(inboxItems.values()).sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
}

/** Delete an item from the inbox */
export function deleteInboxItem(id: string): boolean {
  const deleted = inboxItems.delete(id);
  if (deleted) persistItems();
  return deleted;
}

/** Check if any envelope_created items have been signed in DocuSign */
export async function checkSignedEnvelopes(): Promise<void> {
  let accessToken: string;
  try { accessToken = await getAccessToken(); } catch { return; }

  const pending = Array.from(inboxItems.values()).filter(
    i => i.status === "envelope_created" && i.draftEnvelopeId
  );

  for (const item of pending) {
    try {
      const res = await axios.get(
        `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes/${item.draftEnvelopeId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const dsStatus = res.data?.status;
      if (dsStatus === "completed") {
        inboxItems.set(item.id, { ...item, status: "signed" });
        persistItems();
        console.log(`[agreement-desk] ✓ Envelope ${item.draftEnvelopeId} signed — updating status`);
      }
    } catch {
      // Ignore — envelope might not be sent yet
    }
  }
}

/**
 * Ingest an HL7 X12 277 EDI message.
 * 277s have no document — they are purely structured claim-status data.
 * We parse the EDI, extract payer/sender/claim info, and auto-classify
 * as MEDICAL_RECORD_REQUEST / NO_SIGNATURE_REQUIRED.
 */
export async function processHl7277(ediContent: string): Promise<InboxItem> {
  const id = `hl7_${randomUUID()}`;
  const receivedAt = new Date().toISOString();

  const parsed = parseX12_277(ediContent);
  const summary = build277Summary(parsed, ediContent.length);

  const filename = parsed.claimId
    ? `277_Claim_${parsed.claimId}.edi`
    : `277_${parsed.payer?.replace(/\s+/g, "_") || "Payer"}_${Date.now()}.edi`;

  const item: InboxItem = {
    id,
    filename,
    receivedAt,
    status: "classified",
    source: "hl7_277",
    classification: {
      bucket: "MEDICAL_RECORD_REQUEST",
      label: "Claim Status (277)",
      confidence: 98,
      action: "NO_SIGNATURE_REQUIRED",
      needsSignature: false,
    },
    summary,
    routingDepartment: "Medical Records / Claims",
    payer:    parsed.payer,
    sender:   parsed.sender,
    claimId:  parsed.claimId,
  };

  inboxItems.set(id, item);
  persistItems();
  console.log(`[agreement-desk] ✓ HL7 277 ingested: ${filename} | Payer: ${parsed.payer || "unknown"} | Claim: ${parsed.claimId || "unknown"}`);
  return item;
}

/** Strips non-DocuSign fields from tab objects returned by the AI */
function cleanTab(tab: any): any {
  const { skipped, skip_reason, tab_created, already_completed, ...clean } = tab;
  return clean;
}

/**
 * Creates a DRAFT DocuSign envelope for an inbox item and returns an
 * embedded Sender View URL — no extra DocuSign login required.
 */
export async function createDraftEnvelope(
  itemId: string,
  returnUrl?: string,
  overrides?: { physicianName?: string; physicianEmail?: string; routingDepartment?: string },
): Promise<{ draftEnvelopeId: string; senderViewUrl: string }> {
  const item = inboxItems.get(itemId);
  if (!item) throw new Error(`Item ${itemId} not found`);
  if (!item.pipelineResult) throw new Error("Pipeline not yet complete for this item");

  const pipeline = item.pipelineResult;
  const envConfig = pipeline.envelopePrep?.envelope_config;

  // Always get a fresh JWT token
  const accessToken = await getAccessToken();

  // Retrieve the PDF
  const pdfB64 = item._pdfBase64
    ? { pdfBase64: item._pdfBase64, filename: item.filename }
    : await downloadDocumentAsBase64(itemId);
  if (!pdfB64) throw new Error("Could not retrieve PDF");

  // Signer info — use user-corrected values if provided, otherwise fall back to AI-extracted
  const signerEmail = overrides?.physicianEmail || item.physicianEmail || "physician@hospital.com";
  const signerName  = overrides?.physicianName  || item.physicianName  || "Ordering Physician";

  // ── Tab placement ─────────────────────────────────────────────────────────
  // Tabs come entirely from the envelope-prep vision pipeline, which uses
  // percentage-based coordinate detection (no anchor string matching needed).
  // envelope-prep already includes a smart fallback if vision finds nothing.
  // We just pass the tabs through cleanly — no extra hardcoded coords here.
  const prepTabs = envConfig?.recipients?.signers?.[0]?.tabs;
  const signHereTabs: any[] = prepTabs?.signHereTabs?.length > 0
    ? prepTabs.signHereTabs.map(cleanTab)
    : [];
  const dateSignedTabs: any[] = prepTabs?.dateSignedTabs?.length > 0
    ? prepTabs.dateSignedTabs.map(cleanTab)
    : [];

  console.log(`[agreement-desk] Tabs from vision pipeline: ${signHereTabs.length} signHere, ${dateSignedTabs.length} date`);

  const docName = item.filename.endsWith(".pdf") ? item.filename : `${item.filename}.pdf`;

  const envelopeBody = {
    status: "created",   // DRAFT — physician reviews and sends from DocuSign UI
    emailSubject: envConfig?.emailSubject || `Signature Required: ${item.filename}`,
    emailBlurb: `Please review and sign the attached healthcare document: ${item.filename}`,
    documents: [{
      documentBase64: pdfB64.pdfBase64,
      name: docName,
      fileExtension: "pdf",
      documentId: "1",
    }],
    recipients: {
      signers: [{
        email: signerEmail,
        name: signerName,
        recipientId: "1",
        routingOrder: "1",
        tabs: { signHereTabs, dateSignedTabs },
      }],
    },
  };

  // ── Create the envelope ───────────────────────────────────────────────────
  let envelopeResponse: any;
  try {
    envelopeResponse = await axios.post(
      `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes`,
      envelopeBody,
      { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const dsErr = err.response?.data;
    if (dsErr) {
      console.error("[agreement-desk] DocuSign envelope create error:", JSON.stringify(dsErr));
      throw new Error(dsErr.message || dsErr.errorCode || JSON.stringify(dsErr));
    }
    throw err;
  }

  const draftEnvelopeId = envelopeResponse.data.envelopeId;

  // ── Create Embedded Sender View ───────────────────────────────────────────
  // This returns a pre-authenticated URL — no DocuSign login needed.
  const backUrl = returnUrl || process.env.FRONTEND_URL || "https://glistening-nature-production.up.railway.app";
  const senderReturnUrl = `${backUrl}/agreements/requests`;

  let senderViewUrl: string;
  try {
    const viewResponse = await axios.post(
      `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes/${draftEnvelopeId}/views/sender`,
      { returnUrl: senderReturnUrl },
      { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
    );
    senderViewUrl = viewResponse.data.url;
    console.log(`[agreement-desk] Embedded sender view created for ${draftEnvelopeId}`);
  } catch (err: any) {
    // If sender view fails, fall back to the standard DocuSign prepare URL
    console.warn("[agreement-desk] Sender view failed, using fallback URL:", err.response?.data || err.message);
    senderViewUrl = `https://apps-d.docusign.com/send/prepare/${draftEnvelopeId}`;
  }

  // Update item status
  inboxItems.set(itemId, { ...item, status: "envelope_created", draftEnvelopeId });
  persistItems();

  console.log(`[agreement-desk] ✓ Envelope ${draftEnvelopeId} ready for ${signerEmail}`);
  return { draftEnvelopeId, senderViewUrl };
}

/**
 * For email webhook compatibility — parse raw email with PDF attachment.
 */
export async function extractPdfFromEmail(rawEmail: Buffer): Promise<{
  pdfBase64: string; filename: string; from: string; subject: string;
} | null> {
  const parsed = await simpleParser(rawEmail);
  const att = parsed.attachments?.find(
    (a: any) => a.contentType === "application/pdf" || a.filename?.endsWith(".pdf")
  );
  if (!att) return null;
  return {
    pdfBase64: att.content.toString("base64"),
    filename: att.filename || `fax_${Date.now()}.pdf`,
    from: parsed.from?.text || "unknown",
    subject: parsed.subject || "",
  };
}

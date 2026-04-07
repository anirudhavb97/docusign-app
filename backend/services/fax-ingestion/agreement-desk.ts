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
import { simpleParser } from "mailparser";
import { runFullPipeline } from "../ai-pipeline";

const DS_BASE_URL = () => process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi";
const DS_ACCOUNT_ID = () => process.env.DOCUSIGN_ACCOUNT_ID!;
const INBOX_FOLDER_ID = process.env.AGREEMENT_DESK_INBOX_FOLDER_ID || "d612e145-619c-4525-87f1-0d14a5300eb2";

// ── In-memory store ──────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;                 // DocuSign envelope ID or upload_<uuid>
  filename: string;
  receivedAt: string;
  status: "processing" | "classified" | "envelope_created" | "error";
  source?: "docusign" | "upload";
  classification?: {
    bucket: string;
    label: string;
    confidence: number;
    action: string;           // SIGNATURE_NEEDED | ALREADY_SIGNED | NO_SIGNATURE_REQUIRED | MANUAL_REVIEW
    needsSignature: boolean;
  };
  physicianName?: string;
  physicianEmail?: string;    // derived as firstname.lastname@hospital.com
  pipelineResult?: any;
  draftEnvelopeId?: string;   // set once draft is created in DocuSign
  error?: string;
  _pdfBase64?: string;        // stored for uploaded files (no DocuSign envelope to re-download)
}

const inboxItems = new Map<string, InboxItem>();
let pollingInterval: NodeJS.Timeout | null = null;

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
  const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN;
  if (!accessToken) throw new Error("No DOCUSIGN_ACCESS_TOKEN configured");

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
  const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN!;
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
      physicianName: physicianName ?? undefined,
      physicianEmail: physicianEmail ?? undefined,
      pipelineResult: pipeline,
    });

    console.log(`[agreement-desk] ✓ ${downloaded.filename} → ${bucket} (${Math.round((cls?.confidence || 0) * 100)}%) needs_sig=${needsSignature}`);
  } catch (err: any) {
    console.error(`[agreement-desk] Pipeline error for ${envelopeId}:`, err.message);
    const existing = inboxItems.get(envelopeId);
    inboxItems.set(envelopeId, {
      ...(existing || { id: envelopeId, filename: `fax_${envelopeId}.pdf`, receivedAt }),
      status: "error",
      error: err.message,
    });
  }
}

// ── Manual upload processing ─────────────────────────────────────────────────

/** Process a manually uploaded PDF — adds to inbox and runs AI pipeline */
export async function processUploadedFile(pdfBase64: string, filename: string): Promise<InboxItem> {
  const id = `upload_${randomUUID()}`;
  const receivedAt = new Date().toISOString();

  const item: InboxItem = { id, filename, receivedAt, status: "processing", source: "upload", _pdfBase64: pdfBase64 };
  inboxItems.set(id, item);

  // Fire-and-forget pipeline
  (async () => {
    try {
      console.log(`[agreement-desk] Running AI pipeline on uploaded file: ${filename}`);
      const pipeline = await runFullPipeline(pdfBase64, filename);
      const cls = pipeline.classification?.classification;
      const physicianName = pipeline.ingestion?.provider?.ordering_physician_name ?? undefined;
      const physicianEmail = derivePhysicianEmail(physicianName);
      const needsSignature = cls?.action === "SIGNATURE_NEEDED";
      const bucket = cls?.bucket || "UNKNOWN";

      inboxItems.set(id, {
        ...item,
        status: "classified",
        classification: {
          bucket,
          label: BUCKET_LABELS[bucket] || bucket,
          confidence: Math.round((cls?.confidence || 0) * 100),
          action: cls?.action || "MANUAL_REVIEW",
          needsSignature,
        },
        physicianName,
        physicianEmail,
        pipelineResult: pipeline,
      });
      console.log(`[agreement-desk] ✓ Upload ${filename} → ${bucket} needs_sig=${needsSignature}`);
    } catch (err: any) {
      console.error(`[agreement-desk] Upload pipeline error for ${filename}:`, err.message);
      inboxItems.set(id, { ...item, status: "error", error: err.message });
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
        // Fire-and-forget — don't await so poll returns quickly
        processEnvelope(env.envelopeId, env.emailSubject || "", env.createdDateTime || new Date().toISOString());
      }
    }
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

/** Creates a DRAFT DocuSign envelope for an inbox item */
export async function createDraftEnvelope(itemId: string): Promise<{ draftEnvelopeId: string; viewUrl: string }> {
  const item = inboxItems.get(itemId);
  if (!item) throw new Error(`Item ${itemId} not found`);
  if (!item.pipelineResult) throw new Error("Pipeline not yet complete for this item");

  const pipeline = item.pipelineResult;
  const envConfig = pipeline.envelopePrep?.envelope_config;
  const ing = pipeline.ingestion;

  const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN!;

  // For uploaded files use stored PDF; for DocuSign envelopes re-download
  const pdfB64 = item._pdfBase64
    ? { pdfBase64: item._pdfBase64, filename: item.filename }
    : await downloadDocumentAsBase64(itemId);
  if (!pdfB64) throw new Error("Could not retrieve PDF");

  // Derive signer email firstname.lastname@hospital.com
  const signerEmail = item.physicianEmail || "physician@hospital.com";
  const signerName = item.physicianName || "Ordering Physician";

  // Build tabs from envelope prep (or minimal fallback)
  const tabs = envConfig?.recipients?.signers?.[0]?.tabs || {
    signHereTabs: [{ anchorString: "/sig/", anchorXOffset: "0", anchorYOffset: "0", anchorIgnoreIfNotPresent: "true" }],
  };

  const envelopeBody = {
    status: "created",  // DRAFT — user will review and send
    emailSubject: envConfig?.emailSubject || `Signature Required: ${item.filename}`,
    emailBlurb: `Please review and sign the attached healthcare document: ${item.filename}`,
    documents: [{
      documentBase64: pdfB64.pdfBase64,
      name: item.filename,
      fileExtension: "pdf",
      documentId: "1",
    }],
    recipients: {
      signers: [{
        email: signerEmail,
        name: signerName,
        recipientId: "1",
        routingOrder: "1",
        tabs,
      }],
    },
  };

  const response = await axios.post(
    `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes`,
    envelopeBody,
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
  );

  const draftEnvelopeId = response.data.envelopeId;

  // Update item status
  inboxItems.set(itemId, { ...item, status: "envelope_created", draftEnvelopeId });

  // Build the DocuSign web app URL to view the draft
  const viewUrl = `https://apps-d.docusign.com/send/prepare/${draftEnvelopeId}`;

  console.log(`[agreement-desk] Draft envelope created: ${draftEnvelopeId} for ${signerEmail}`);
  return { draftEnvelopeId, viewUrl };
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

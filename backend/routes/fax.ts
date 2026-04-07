/**
 * Fax ingestion routes
 *
 * GET  /api/fax/inbox-items          — All processed inbox items (polled by UI every 10s)
 * POST /api/fax/create-envelope/:id  — Create a DRAFT DocuSign envelope for an inbox item
 * POST /api/fax/process              — Manual PDF upload → full AI pipeline
 * POST /api/fax/email-webhook        — Raw email webhook (SMTP forwarding compat)
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import axios from "axios";
import { runFullPipeline } from "../services/ai-pipeline";
import { sendEnvelope } from "../services/docusign/envelope";
import { getAccessToken } from "../services/docusign/jwt-auth";
import {
  extractPdfFromEmail,
  getInboxItems,
  createDraftEnvelope,
  runPoll,
  processUploadedFile,
  deleteInboxItem,
} from "../services/fax-ingestion/agreement-desk";

const DS_BASE_URL = () => process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi";
const DS_ACCOUNT_ID = () => process.env.DOCUSIGN_ACCOUNT_ID!;

export const faxRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * GET /api/fax/inbox-items
 * Returns all inbox items (processing + classified + envelope_created).
 * UI polls this every 10 seconds to show live status.
 */
faxRouter.get("/inbox-items", (_req: Request, res: Response) => {
  res.json({ items: getInboxItems() });
});

/**
 * POST /api/fax/poll-now
 * Manually trigger an immediate poll (for the refresh button in UI).
 */
faxRouter.post("/poll-now", async (_req: Request, res: Response) => {
  try {
    await runPoll();
    res.json({ success: true, items: getInboxItems() });
  } catch (err: any) {
    console.error("[fax/poll-now] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fax/create-envelope/:id
 * Creates a DRAFT DocuSign envelope for the given inbox item.
 * Physician email is derived as firstname.lastname@hospital.com.
 * User reviews the draft in DocuSign and sends it themselves.
 */
faxRouter.post("/create-envelope/:id", async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const returnUrl = req.body?.returnUrl as string | undefined;
    const result = await createDraftEnvelope(id, returnUrl);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[fax/create-envelope] Error:", err.message);
    if (err.response) console.error("DS response:", err.response.status, JSON.stringify(err.response.data));
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/fax/inbox-items/:id
 * Remove an item from the inbox.
 */
faxRouter.delete("/inbox-items/:id", (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = deleteInboxItem(id);
  res.json({ success: deleted });
});

/**
 * POST /api/fax/send-to-ehr/:id
 * Mock: mark document as sent to EHR system.
 */
faxRouter.post("/send-to-ehr/:id", (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  console.log(`[fax/send-to-ehr] Sending item ${id} to EHR`);
  // TODO: integrate with actual EHR (Epic, Cerner, etc.)
  res.json({ success: true, message: "Document queued for EHR ingestion" });
});

/**
 * POST /api/fax/send-to-payer/:id
 * Mock: mark signed document as sent back to payer.
 */
faxRouter.post("/send-to-payer/:id", (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  console.log(`[fax/send-to-payer] Sending signed item ${id} back to payer`);
  // TODO: integrate with payer notification system
  res.json({ success: true, message: "Signed document sent back to payer" });
});

/**
 * POST /api/fax/upload
 * Upload a PDF directly → runs AI pipeline → adds to inbox table.
 */
faxRouter.post("/upload", upload.single("document"), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file attached. Send PDF as multipart field 'document'." });
    if (!file.mimetype.includes("pdf") && !file.originalname.endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are supported." });
    }
    const pdfBase64 = file.buffer.toString("base64");
    const filename = file.originalname || `upload_${Date.now()}.pdf`;
    console.log(`[fax/upload] Received: ${filename} (${Math.round(file.size / 1024)}KB)`);
    const item = await processUploadedFile(pdfBase64, filename);
    return res.json({ success: true, item });
  } catch (err: any) {
    console.error("[fax/upload] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fax/send-envelope-manual
 * Create & send (or draft) a DocuSign envelope from scratch.
 * Body: multipart with fields: document (file), signerName, signerEmail,
 *       emailSubject, sendNow (true=sent, false=draft+embedded view), returnUrl
 */
faxRouter.post("/send-envelope-manual", upload.single("document"), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No document attached." });

    const signerName  = req.body?.signerName  || "Recipient";
    const signerEmail = req.body?.signerEmail  || "";
    const emailSubject = req.body?.emailSubject || `Signature Required: ${file.originalname}`;
    const sendNow     = req.body?.sendNow === "true";
    const returnUrl   = req.body?.returnUrl || process.env.FRONTEND_URL || "https://glistening-nature-production.up.railway.app";

    if (!signerEmail) return res.status(400).json({ error: "signerEmail is required." });

    const pdfBase64 = file.buffer.toString("base64");
    const docName   = file.originalname || `document_${Date.now()}.pdf`;

    const accessToken = await getAccessToken();

    // Place signHere tab at a sensible default location (last page, lower-left).
    // The embedded sender view lets the user move/add tabs before sending.
    const envelopeBody = {
      status: sendNow ? "sent" : "created",
      emailSubject,
      emailBlurb: `Please review and sign: ${docName}`,
      documents: [{
        documentBase64: pdfBase64,
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
          tabs: {
            signHereTabs: [{
              documentId: "1",
              pageNumber: "1",
              xPosition: "100",
              yPosition: "650",
              tabLabel: "SignHere",
            }],
          },
        }],
      },
    };

    let envRes: any;
    try {
      envRes = await axios.post(
        `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes`,
        envelopeBody,
        { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      const dsErr = err.response?.data;
      if (dsErr) throw new Error(dsErr.message || dsErr.errorCode || JSON.stringify(dsErr));
      throw err;
    }

    const envelopeId = envRes.data.envelopeId;

    if (sendNow) {
      return res.json({ success: true, envelopeId, status: "sent" });
    }

    // Draft → create embedded sender view so user can place tabs + send
    const senderReturnUrl = `${returnUrl}/send-envelope?done=true`;
    let senderViewUrl = `https://apps-d.docusign.com/send/prepare/${envelopeId}`;
    try {
      const viewRes = await axios.post(
        `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes/${envelopeId}/views/sender`,
        { returnUrl: senderReturnUrl },
        { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
      );
      senderViewUrl = viewRes.data.url;
    } catch (e: any) {
      console.warn("[send-envelope-manual] Sender view failed:", e.response?.data || e.message);
    }

    return res.json({ success: true, envelopeId, status: "created", senderViewUrl });
  } catch (err: any) {
    console.error("[send-envelope-manual]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fax/process
 * Manual PDF upload → full AI pipeline (for testing without Agreement Desk).
 */
faxRouter.post("/process", upload.single("document"), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No document attached. Send PDF as multipart field 'document'." });

    const pdfBase64 = file.buffer.toString("base64");
    const documentName = file.originalname || `fax_${Date.now()}.pdf`;
    console.log(`[fax/process] Processing: ${documentName} (${Math.round(file.size / 1024)}KB)`);

    const pipelineResult = await runFullPipeline(pdfBase64, documentName);

    let envelopeResult = null;
    if (pipelineResult.envelopePrep.envelope_needed && req.body.signerEmail && req.body.dsAccessToken) {
      envelopeResult = await sendEnvelope(
        req.body.dsAccessToken, pdfBase64, pipelineResult.envelopePrep,
        req.body.signerEmail, req.body.signerName
      );
    }

    return res.json({ success: true, documentName, ...pipelineResult, envelopeResult });
  } catch (err: any) {
    console.error("[fax/process] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fax/email-webhook
 * Raw email webhook for SMTP-forwarded faxes (compat).
 */
faxRouter.post("/email-webhook", upload.fields([{ name: "email" }, { name: "document" }]), async (req: Request, res: Response) => {
  try {
    const files = (req as any).files as Record<string, Express.Multer.File[]>;
    let pdfBase64: string;
    let documentName: string;

    if (files?.email?.[0]) {
      const extracted = await extractPdfFromEmail(files.email[0].buffer);
      if (!extracted) return res.status(400).json({ error: "No PDF attachment found in email" });
      pdfBase64 = extracted.pdfBase64;
      documentName = extracted.filename;
    } else if (files?.document?.[0]) {
      pdfBase64 = files.document[0].buffer.toString("base64");
      documentName = files.document[0].originalname || `fax_${Date.now()}.pdf`;
    } else {
      return res.status(400).json({ error: "No email or document field found" });
    }

    const pipelineResult = await runFullPipeline(pdfBase64, documentName);
    return res.json({ received: true, action: pipelineResult.classification?.classification?.action });
  } catch (err: any) {
    console.error("[email-webhook] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

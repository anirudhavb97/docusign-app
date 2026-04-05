import { Router, Request, Response } from "express";
import multer from "multer";
import { runDocumentPipeline } from "../services/ai-pipeline";
import { createAndSendEnvelope } from "../services/docusign/envelope";

export const faxRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/fax/ingest - Called by Agreement Desk webhook on fax receipt
faxRouter.post("/ingest", upload.single("document"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No document attached" });

    const pdfBase64 = file.buffer.toString("base64");

    // Run OCR + classification pipeline
    const { ocrText, classification } = await runDocumentPipeline(pdfBase64);

    const result: any = {
      classification,
      ocrTextPreview: ocrText.slice(0, 500),
      requiresSignature: classification.requiresSignature,
    };

    // If signature required, auto-create envelope
    if (classification.requiresSignature && req.body.signerEmail) {
      const envelopeId = await createAndSendEnvelope(
        req.body.accessToken,
        pdfBase64,
        classification,
        req.body.signerEmail,
        req.body.signerName || "Provider",
      );
      result.envelopeId = envelopeId;
      result.envelopeCreated = true;
    }

    return res.json(result);
  } catch (err: any) {
    console.error("[fax/ingest]", err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/fax/send - Simulate payer sending a fax
faxRouter.post("/send", upload.single("document"), async (req: Request, res: Response) => {
  try {
    // In production: call SRFax/eFax API to send to Agreement Desk number
    return res.json({ message: "Fax queued for sending", toNumber: req.body.toNumber });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

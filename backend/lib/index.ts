import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { faxRouter } from "../routes/fax";
import { documentsRouter } from "../routes/documents";
import { envelopesRouter } from "../routes/envelopes";
import { webhooksRouter } from "../routes/webhooks";
import { startPolling } from "../services/fax-ingestion/agreement-desk";
import { initJwtAuth } from "../services/docusign/jwt-auth";

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Routes
app.use("/api/fax", faxRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/envelopes", envelopesRouter);
app.use("/api/webhooks", webhooksRouter);

app.get("/health", (_req, res) => res.json({
  status: "ok",
  endpoints: {
    "POST /api/fax/process": "Upload PDF → run full AI pipeline (ingest → classify → envelope prep)",
    "POST /api/fax/send-envelope": "Send a prepared envelope to DocuSign",
    "POST /api/fax/email-webhook": "Agreement Desk email webhook — auto-processes fax PDFs from inbox",
  }
}));

app.listen(PORT, () => {
  console.log(`\nHealthcare DocuSign Backend running on port ${PORT}`);
  // Init JWT auth (auto-refreshing token), then start inbox polling
  initJwtAuth().then(() => {
    startPolling(60_000);
  });
  console.log(`\nKey endpoints:`);
  console.log(`  POST /api/fax/process        — Process a fax PDF through full AI pipeline`);
  console.log(`  POST /api/fax/email-webhook  — Agreement Desk email webhook`);
  console.log(`  POST /api/fax/send-envelope  — Create & send DocuSign envelope`);
  console.log(`  GET  /health                 — Health check\n`);
});

export default app;

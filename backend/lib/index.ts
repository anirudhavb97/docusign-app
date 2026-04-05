import express from "express";
import dotenv from "dotenv";
import { faxRouter } from "./routes/fax";
import { documentsRouter } from "./routes/documents";
import { envelopesRouter } from "./routes/envelopes";
import { webhooksRouter } from "./routes/webhooks";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Routes
app.use("/api/fax", faxRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/envelopes", envelopesRouter);
app.use("/api/webhooks", webhooksRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Healthcare DocuSign backend running on port ${PORT}`);
});

export default app;

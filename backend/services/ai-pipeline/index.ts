/**
 * Full pipeline orchestrator:
 * PDF → Ingest → Classify → Envelope Prep
 */
import { ingestFaxDocument, IngestionResult } from "./ingestion";
import { classifyDocument, ClassificationResult } from "./classification";
import { prepareEnvelope, EnvelopePrepResult } from "./envelope-prep";

export { IngestionResult, ClassificationResult, EnvelopePrepResult };

export interface FullPipelineResult {
  ingestion: IngestionResult;
  classification: ClassificationResult;
  envelopePrep: EnvelopePrepResult;
  processingTimeMs: number;
}

export async function runFullPipeline(
  pdfBase64: string,
  documentName?: string
): Promise<FullPipelineResult> {
  const start = Date.now();

  console.log("[pipeline] Step 1/3: Ingesting fax document...");
  const ingestion = await ingestFaxDocument(pdfBase64);
  console.log(`[pipeline] Ingested — confidence: ${ingestion.confidence.overall}, pages: ${ingestion.source.total_pages}`);

  console.log("[pipeline] Step 2/3: Classifying document...");
  const classification = await classifyDocument(ingestion);
  console.log(`[pipeline] Classified as: ${classification.classification.bucket} (${Math.round(classification.classification.confidence * 100)}%) → action: ${classification.classification.action}`);

  console.log("[pipeline] Step 3/3: Preparing envelope config...");
  const envelopePrep = await prepareEnvelope(ingestion, classification, documentName);
  console.log(`[pipeline] Envelope needed: ${envelopePrep.envelope_needed}`);

  return {
    ingestion,
    classification,
    envelopePrep,
    processingTimeMs: Date.now() - start,
  };
}

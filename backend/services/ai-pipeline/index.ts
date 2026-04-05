import { extractTextFromFax } from "./ocr";
import { classifyDocument } from "./classifier";
import { ClassificationResult } from "../../../shared/types/classification";

export interface PipelineResult {
  ocrText: string;
  classification: ClassificationResult;
}

export async function runDocumentPipeline(pdfBase64: string): Promise<PipelineResult> {
  console.log("[pipeline] Starting OCR...");
  const ocrText = await extractTextFromFax(pdfBase64);

  console.log("[pipeline] Classifying document...");
  const classification = await classifyDocument(pdfBase64, ocrText);

  console.log(`[pipeline] Classified as: ${classification.bucket} (${Math.round(classification.confidence * 100)}% confidence)`);

  return { ocrText, classification };
}

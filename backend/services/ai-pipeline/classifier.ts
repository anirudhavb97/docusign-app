/**
 * AI Document Classifier
 * Uses the healthcare-doc-classification Claude skill to classify
 * incoming fax documents into one of 8 defined buckets.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ClassificationResult, DocumentBucket, SIGNATURE_REQUIRED_BUCKETS } from "../../../shared/types/classification";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function classifyDocument(
  pdfBase64: string,
  ocrText: string
): Promise<ClassificationResult> {
  const prompt = `You are a healthcare document classifier. Analyze the following fax document and classify it into exactly ONE of these 8 buckets:

1. durable_medical_equipment - DME orders (wheelchairs, oxygen, CPAP, prosthetics, orthotics)
2. home_health_orders - Home nursing, PT, OT, skilled care at home
3. plan_of_care - Physician-certified treatment plans with goals and therapies
4. prior_authorization - Payer pre-approval requests for procedures/medications
5. medical_record_request - Requests for patient records, charts, labs, imaging
6. attestation_audit - Compliance attestations, HEDIS audits, risk adjustment, medical necessity
7. other_needs_signature - Any other document requiring physician/provider signature
8. no_signature_required - Informational notices, EOBs, remittance, admin docs

Document OCR Text:
---
${ocrText}
---

Respond ONLY with valid JSON in this exact format:
{
  "bucket": "<one of the 8 bucket IDs above>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>",
  "extractedFields": {
    "patientName": "<if found>",
    "patientDOB": "<if found>",
    "patientMemberId": "<if found>",
    "providerName": "<if found>",
    "providerNPI": "<if found>",
    "providerFacility": "<if found>",
    "diagnosisCodes": ["<ICD-10 codes if found>"],
    "procedureCodes": ["<CPT codes if found>"],
    "serviceStartDate": "<if found>",
    "serviceEndDate": "<if found>",
    "payerName": "<if found>",
    "referenceNumber": "<if found>",
    "urgency": "<routine|urgent|stat>"
  },
  "suggestedTags": [
    {
      "type": "<signHere|initialHere|dateSigned|text|checkbox>",
      "pageNumber": <page number>,
      "anchorText": "<nearby text to anchor placement>",
      "label": "<label>",
      "required": <true|false>,
      "signerRole": "<physician|provider|patient|authorized_rep>"
    }
  ]
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  const parsed = JSON.parse(content.text);
  const bucket = parsed.bucket as DocumentBucket;

  return {
    bucket,
    confidence: parsed.confidence,
    requiresSignature: SIGNATURE_REQUIRED_BUCKETS.includes(bucket),
    reasoning: parsed.reasoning,
    extractedFields: parsed.extractedFields || {},
    suggestedTags: parsed.suggestedTags || [],
  };
}

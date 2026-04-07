/**
 * SKILL: healthcare-fax-ingestion
 * Extracts structured data from fax PDFs using Claude vision at 300 DPI.
 * Input: PDF as base64 string
 * Output: IngestionResult JSON per skill spec
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID as uuid } from "crypto";

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface IngestionResult {
  document_id: string;
  ingested_at: string;
  source: {
    total_pages: number;
    quality: "high" | "medium" | "low";
    handwritten_content_detected: boolean;
    fax_header_detected: boolean;
  };
  patient: {
    name: string | null;
    date_of_birth: string | null;
    mrn: string | null;
    member_id: string | null;
    address: string | null;
    phone: string | null;
  };
  provider: {
    ordering_physician_name: string | null;
    npi: string | null;
    practice_name: string | null;
    address: string | null;
    phone: string | null;
    fax: string | null;
    dea_number: string | null;
  };
  payer: {
    name: string | null;
    plan_name: string | null;
    group_number: string | null;
    insurance_id: string | null;
  };
  clinical: {
    icd10_codes: string[];
    cpt_codes: string[];
    hcpcs_codes: string[];
    diagnosis_descriptions: string[];
    procedure_descriptions: string[];
  };
  document: {
    document_date: string | null;
    fax_transmission_date: string | null;
    subject: string | null;
    total_pages: number;
  };
  signatures: {
    physician_signature_present: boolean;
    patient_signature_present: boolean;
    signature_page_locations: number[];
  };
  raw_text_by_page: Record<string, string>;
  confidence: {
    overall: number;
    patient: number;
    provider: number;
    payer: number;
    clinical: number;
    notes: string;
  };
  flags: {
    illegible_sections: string[];
    missing_required_fields: string[];
    low_confidence_fields: string[];
  };
}

export async function ingestFaxDocument(pdfBase64: string): Promise<IngestionResult> {
  const prompt = `You are a skilled medical records analyst extracting structured data from a faxed healthcare document.

Analyze this document carefully. Faxes are often low resolution with handwritten content.

Extract ALL of the following fields with high accuracy. For handwritten dates, normalize to YYYY-MM-DD.
Distinguish NPI (exactly 10 digits) from phone numbers and DEA numbers (2 letters + 7 digits).
Note fax header transmission data separately from document content.

CRITICAL RULE for physician_signature_present:
- Set to TRUE only if there is an ACTUAL handwritten mark, cursive pen stroke, or electronic signature stamp ON the signature line.
- A BLANK signature line (empty underline, blank box, "Signature:___________") means NO signature is present → set to FALSE.
- A typed name like "Jeremy Ross, MD" printed above a blank line is the LABEL for who should sign, NOT a signature → set to FALSE.
- Only an ink mark, cursive flourish, or stamped signature = TRUE.

Return ONLY valid JSON matching this exact structure:
{
  "document_id": "${uuid()}",
  "ingested_at": "${new Date().toISOString()}",
  "source": {
    "total_pages": <number>,
    "quality": "<high|medium|low>",
    "handwritten_content_detected": <boolean>,
    "fax_header_detected": <boolean>
  },
  "patient": {
    "name": "<Last, First Middle or null>",
    "date_of_birth": "<YYYY-MM-DD or null>",
    "mrn": "<string or null>",
    "member_id": "<string or null>",
    "address": "<string or null>",
    "phone": "<string or null>"
  },
  "provider": {
    "ordering_physician_name": "<string or null>",
    "npi": "<10-digit string or null>",
    "practice_name": "<string or null>",
    "address": "<string or null>",
    "phone": "<string or null>",
    "fax": "<string or null>",
    "dea_number": "<string or null>"
  },
  "payer": {
    "name": "<string or null>",
    "plan_name": "<string or null>",
    "group_number": "<string or null>",
    "insurance_id": "<string or null>"
  },
  "clinical": {
    "icd10_codes": ["<ICD-10 codes>"],
    "cpt_codes": ["<CPT codes>"],
    "hcpcs_codes": ["<HCPCS codes>"],
    "diagnosis_descriptions": ["<descriptions>"],
    "procedure_descriptions": ["<descriptions>"]
  },
  "document": {
    "document_date": "<YYYY-MM-DD or null>",
    "fax_transmission_date": "<YYYY-MM-DD or null>",
    "subject": "<string or null>",
    "total_pages": <number>
  },
  "signatures": {
    "physician_signature_present": <boolean>,
    "patient_signature_present": <boolean>,
    "signature_page_locations": [<page numbers>]
  },
  "raw_text_by_page": {
    "1": "<full verbatim text from page 1>"
  },
  "confidence": {
    "overall": <0.0-1.0>,
    "patient": <0.0-1.0>,
    "provider": <0.0-1.0>,
    "payer": <0.0-1.0>,
    "clinical": <0.0-1.0>,
    "notes": "<any caveats>"
  },
  "flags": {
    "illegible_sections": ["<descriptions>"],
    "missing_required_fields": ["<dot.notation fields>"],
    "low_confidence_fields": ["<dot.notation fields>"]
  }
}`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text = response.content[0];
  if (text.type !== "text") throw new Error("Unexpected response type from ingestion");

  // Extract JSON from response (may have markdown fences)
  const jsonMatch = text.text.match(/```json\n?([\s\S]*?)\n?```/) || text.text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error("No JSON found in ingestion response");

  return JSON.parse(jsonMatch[1] || jsonMatch[0]) as IngestionResult;
}

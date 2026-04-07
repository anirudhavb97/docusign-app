/**
 * SKILL: healthcare-doc-classification
 * Classifies ingested fax into one of 8 buckets and determines action.
 * Input: IngestionResult from ingestion skill
 * Output: ClassificationResult JSON per skill spec
 */
import Anthropic from "@anthropic-ai/sdk";
import { IngestionResult } from "./ingestion";

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ActionType = "SIGNATURE_NEEDED" | "ALREADY_SIGNED" | "NO_SIGNATURE_REQUIRED" | "MANUAL_REVIEW";
export type BucketType =
  | "DME_ORDER"
  | "HOME_HEALTH_ORDER"
  | "PLAN_OF_CARE"
  | "PRIOR_AUTHORIZATION"
  | "MEDICAL_RECORD_REQUEST"
  | "ATTESTATION_AUDIT"
  | "SIGNATURE_REQUIRED_OTHER"
  | "NO_SIGNATURE_REQUIRED";

export interface ClassificationResult {
  classification: {
    bucket: BucketType;
    bucket_label: string;
    confidence: number;
    requires_physician_signature: boolean;
    physician_signature_present: boolean;
    initials_present: boolean;
    action: ActionType;
  };
  bucket_specific_fields: Record<string, any>;
  secondary_classification: string | null;
  urgency: "urgent" | "standard" | "expedited" | null;
  classification_reasoning: string;
  confidence_notes: string;
}

export async function classifyDocument(ingestion: IngestionResult): Promise<ClassificationResult> {
  const rawText = Object.values(ingestion.raw_text_by_page).join("\n\n--- PAGE BREAK ---\n\n");

  const prompt = `You are an experienced medical records specialist. Classify this healthcare fax document into exactly ONE of these 8 buckets:

1. DME_ORDER — Durable Medical Equipment Order (HCPCS A/E/K codes, CMN, equipment names, "medical necessity", requires physician signature)
2. HOME_HEALTH_ORDER — Home Health Order (skilled nursing, PT/OT/ST/HHA, "homebound", "485", visit frequency, lab draw orders, Auth provider field, requires physician signature)
3. PLAN_OF_CARE — Plan of Care (CMS-485, certification period, functional limitations, goals, prognosis, requires physician signature)
4. PRIOR_AUTHORIZATION — Prior Authorization Request (PA/pre-auth/pre-cert, approval request, authorization number, clinical rationale, requires physician signature)
5. MEDICAL_RECORD_REQUEST — Medical Record Request (ROI, HIPAA auth, records request, date ranges, generally NO physician signature)
6. ATTESTATION_AUDIT — Attestation or Audit Request (RAC/OIG/ZPIC audit, ADR, "attest", blank attestation forms, CMS signature attestation templates, documentation request, requires physician signature)
7. SIGNATURE_REQUIRED_OTHER — Other document requiring physician signature (disability, FMLA, letter of medical necessity, misc forms with a blank signature line)
8. NO_SIGNATURE_REQUIRED — Informational/administrative, no physician signature needed (EOBs, remittance, policy guides, notices, referral confirmations)

Ingested document data:
${JSON.stringify(ingestion, null, 2)}

Raw document text:
${rawText}

Physician signature already present (from ingestion): ${ingestion.signatures.physician_signature_present}

CRITICAL CLASSIFICATION RULES — read carefully before deciding:

SIGNATURE DETECTION:
- A blank "Signature: ___________" line = NO signature present. Action = SIGNATURE_NEEDED.
- A typed/printed provider name above a blank line = NOT a signature. Action = SIGNATURE_NEEDED.
- Only an actual ink mark, cursive handwriting, or electronic stamp = signature present. Action = ALREADY_SIGNED.
- If you see "Provider Signature for [Name]" followed by a blank Signature line → physician_signature_present = false → SIGNATURE_NEEDED.

DOCUMENT TYPE RULES:
- If the document contains visit orders (skilled nursing, lab draw, PT, OT) and an "Auth provider" or ordering physician field → HOME_HEALTH_ORDER → SIGNATURE_NEEDED (even if it's page 2 of 2).
- If the document is a BLANK attestation/affidavit FORM with empty fields waiting to be filled in (like a CMS attestation template) → ATTESTATION_AUDIT → SIGNATURE_NEEDED.
- A CMS policy document that explains signature requirements but contains a blank form to be signed → ATTESTATION_AUDIT → SIGNATURE_NEEDED.
- Only use NO_SIGNATURE_REQUIRED for purely informational content with NO blank signature lines (e.g., EOBs, remittance advice, policy guides with no form component).

Return ONLY valid JSON:
{
  "classification": {
    "bucket": "<one of the 8 bucket IDs above>",
    "bucket_label": "<human readable label>",
    "confidence": <0.0-1.0>,
    "requires_physician_signature": <boolean>,
    "physician_signature_present": <boolean>,
    "initials_present": <boolean>,
    "action": "<SIGNATURE_NEEDED|ALREADY_SIGNED|NO_SIGNATURE_REQUIRED|MANUAL_REVIEW>"
  },
  "bucket_specific_fields": {
    <include only the fields relevant to the classified bucket>
  },
  "secondary_classification": "<bucket ID or null>",
  "urgency": "<urgent|standard|expedited|null>",
  "classification_reasoning": "<clear explanation of why this bucket and action were chosen>",
  "confidence_notes": "<any caveats about confidence>"
}

Action decision logic (apply in order):
1. If confidence < 0.65 or document is too illegible → MANUAL_REVIEW
2. If bucket is 5 (MEDICAL_RECORD_REQUEST) or 8 (NO_SIGNATURE_REQUIRED) AND no blank signature line present → NO_SIGNATURE_REQUIRED
3. If requires_physician_signature = true AND physician_signature_present = true (actual ink/stamp) → ALREADY_SIGNED
4. If requires_physician_signature = true AND physician_signature_present = false (blank line or no line) → SIGNATURE_NEEDED
5. Default → MANUAL_REVIEW`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== "text") throw new Error("Unexpected response type from classification");

  const jsonMatch = text.text.match(/```json\n?([\s\S]*?)\n?```/) || text.text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error("No JSON found in classification response");

  return JSON.parse(jsonMatch[1] || jsonMatch[0]) as ClassificationResult;
}

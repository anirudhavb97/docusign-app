/**
 * SKILL: healthcare-envelope-prep
 * Builds a DocuSign envelope configuration from classified fax document.
 * Input: IngestionResult + ClassificationResult
 * Output: EnvelopePrepResult ready for DocuSign REST API
 */
import Anthropic from "@anthropic-ai/sdk";
import { IngestionResult } from "./ingestion";
import { ClassificationResult } from "./classification";

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface EnvelopePrepResult {
  envelope_needed: boolean;
  reason?: string;
  message?: string;
  document_type?: string;
  patient_name?: string;
  physician_name?: string;
  envelope_config?: {
    emailSubject: string;
    emailBlurb: string;
    status: "sent" | "created";
    documents: Array<{
      documentId: string;
      name: string;
      note: string;
    }>;
    recipients: {
      signers: Array<{
        recipientId: string;
        roleName: string;
        name: string;
        email: string;
        routingOrder: string;
        tabs: {
          signHereTabs: any[];
          dateSignedTabs: any[];
          textTabs: any[];
          initialHereTabs?: any[];
        };
      }>;
    };
  };
  detected_signature_areas: Array<{
    page: number;
    field_type: string;
    label_text: string;
    anchor_string_used: string;
    already_completed: boolean;
    tab_created: boolean;
  }>;
  skipped_fields: Array<{
    page: number;
    field_type: string;
    label_text: string;
    reason: string;
  }>;
  missing_expected_fields: string[];
  manual_review_required: boolean;
  manual_review_reasons: string[];
  placement_notes: string;
}

export async function prepareEnvelope(
  ingestion: IngestionResult,
  classification: ClassificationResult,
  documentName: string = "Healthcare_Document.pdf"
): Promise<EnvelopePrepResult> {
  // Check precondition
  if (classification.classification.action !== "SIGNATURE_NEEDED") {
    return {
      envelope_needed: false,
      reason: classification.classification.action,
      message: `No envelope needed — ${
        classification.classification.action === "ALREADY_SIGNED"
          ? "document is already signed"
          : "document does not require physician signature"
      }.`,
      detected_signature_areas: [],
      skipped_fields: [],
      missing_expected_fields: [],
      manual_review_required: false,
      manual_review_reasons: [],
      placement_notes: "",
    };
  }

  const rawText = Object.values(ingestion.raw_text_by_page).join("\n\n--- PAGE BREAK ---\n\n");
  const patientName = ingestion.patient.name || "Unknown Patient";
  const physicianName = ingestion.provider.ordering_physician_name || "Ordering Physician";

  const prompt = `You are a DocuSign integration specialist for a healthcare organization.

Given this classified fax document, produce a ready-to-use DocuSign envelope configuration.

Classification:
${JSON.stringify(classification, null, 2)}

Ingested data:
${JSON.stringify({ patient: ingestion.patient, provider: ingestion.provider, signatures: ingestion.signatures }, null, 2)}

Raw document text:
${rawText}

Your task:
1. Scan the document text to find ALL signature lines, date lines, and initials lines
2. For each field, choose a reliable anchor text string (unique, 3-8 words of printed text near the blank)
3. Build DocuSign anchor-based tab placement
4. Skip any field that already has a handwritten mark

Document name: ${documentName}
Patient: ${patientName}
Physician: ${physicianName}

Return ONLY valid JSON:
{
  "envelope_needed": true,
  "document_type": "${classification.classification.bucket}",
  "patient_name": "${patientName}",
  "physician_name": "${physicianName}",
  "envelope_config": {
    "emailSubject": "Signature Required: ${classification.classification.bucket_label} – ${patientName}",
    "emailBlurb": "<personalized message for physician>",
    "status": "sent",
    "documents": [
      {
        "documentId": "1",
        "name": "${documentName}",
        "note": "${classification.classification.bucket_label}"
      }
    ],
    "recipients": {
      "signers": [
        {
          "recipientId": "1",
          "roleName": "ordering_physician",
          "name": "${physicianName}",
          "email": "RESOLVE_FROM_NPI_REGISTRY",
          "routingOrder": "1",
          "tabs": {
            "signHereTabs": [
              {
                "tabLabel": "<unique label>",
                "anchorString": "<exact text near signature line>",
                "anchorMatchWholeWord": "false",
                "anchorXOffset": "<pixels right of anchor>",
                "anchorYOffset": "0",
                "anchorUnits": "pixels",
                "anchorIgnoreIfNotPresent": "false",
                "scaleValue": "1.0",
                "skipped": false,
                "skip_reason": null
              }
            ],
            "dateSignedTabs": [
              {
                "tabLabel": "<unique label>",
                "anchorString": "<exact text near date line>",
                "anchorMatchWholeWord": "true",
                "anchorXOffset": "40",
                "anchorYOffset": "0",
                "anchorUnits": "pixels",
                "anchorIgnoreIfNotPresent": "true",
                "skipped": false,
                "skip_reason": null
              }
            ],
            "textTabs": [],
            "initialHereTabs": []
          }
        }
      ]
    }
  },
  "detected_signature_areas": [
    {
      "page": <number>,
      "field_type": "<signHere|dateSignedHere|initials|textTab>",
      "label_text": "<text label from document>",
      "anchor_string_used": "<string used as anchor>",
      "already_completed": <boolean>,
      "tab_created": <boolean>
    }
  ],
  "skipped_fields": [],
  "missing_expected_fields": [],
  "manual_review_required": <boolean>,
  "manual_review_reasons": [],
  "placement_notes": "Anchor offsets are estimates — validate in DocuSign sandbox before production."
}`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== "text") throw new Error("Unexpected response type from envelope prep");

  const jsonMatch = text.text.match(/```json\n?([\s\S]*?)\n?```/) || text.text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error("No JSON found in envelope prep response");

  return JSON.parse(jsonMatch[1] || jsonMatch[0]) as EnvelopePrepResult;
}

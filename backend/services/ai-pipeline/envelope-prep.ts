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

/**
 * Detects exact signature tab locations by sending the PDF to Claude vision.
 * Returns coordinate-based tabs (page + x/y in DocuSign units).
 *
 * DocuSign coordinate system: 1 unit = 1pt (1/72 inch).
 * US Letter page = 612 wide × 792 tall.  (0,0) = top-left of page.
 */
async function detectTabsFromPdf(pdfBase64: string, totalPages: number): Promise<{
  signHereTabs: any[];
  dateSignedTabs: any[];
}> {
  const prompt = `You are a DocuSign integration engineer. I will show you a healthcare PDF document.
Your job is to locate EVERY blank signature line and date line so we can place DocuSign signature tabs precisely.

RULES:
- A signature line is a blank underline labeled "Signature", "Provider Signature", "Physician Signature", "Authorized Signature", or similar.
- A date line is a blank underline labeled "Date", "Dated", "Date Signed", or similar next to a signature line.
- A blank underline with NO mark on it = needs a tab. An underline with ink/handwriting on it = already signed, skip it.
- For each blank field, estimate its location on the page as a fraction of page height (yFraction: 0.0 = top, 1.0 = bottom) and page width (xFraction: 0.0 = left, 1.0 = right).
- A US Letter page is 612 wide × 792 tall in DocuSign units (points). Multiply your fractions by these to get xPosition and yPosition.
- Subtract 20 from yPosition so the tab sits above the line, not below it.

Return ONLY valid JSON with this exact structure — no markdown, no explanation:
{
  "signHereTabs": [
    {
      "documentId": "1",
      "pageNumber": "<page number as string, e.g. '1'>",
      "xPosition": "<x in DocuSign points as string>",
      "yPosition": "<y in DocuSign points as string>",
      "tabLabel": "PhysicianSignature_P<page>"
    }
  ],
  "dateSignedTabs": [
    {
      "documentId": "1",
      "pageNumber": "<page number as string>",
      "xPosition": "<x in DocuSign points as string>",
      "yPosition": "<y in DocuSign points as string>",
      "tabLabel": "DateSigned_P<page>"
    }
  ]
}

If there are no blank signature lines, return { "signHereTabs": [], "dateSignedTabs": [] }.`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        },
        { type: "text", text: prompt },
      ],
    }],
  });

  const text = response.content[0];
  if (text.type !== "text") throw new Error("Unexpected response from tab detection");

  const jsonMatch = text.text.match(/```json\n?([\s\S]*?)\n?```/) || text.text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return { signHereTabs: [], dateSignedTabs: [] };

  try {
    const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    return {
      signHereTabs: Array.isArray(result.signHereTabs) ? result.signHereTabs : [],
      dateSignedTabs: Array.isArray(result.dateSignedTabs) ? result.dateSignedTabs : [],
    };
  } catch {
    return { signHereTabs: [], dateSignedTabs: [] };
  }
}

export async function prepareEnvelope(
  ingestion: IngestionResult,
  classification: ClassificationResult,
  documentName: string = "Healthcare_Document.pdf",
  pdfBase64?: string,
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

  const patientName = ingestion.patient.name || "Unknown Patient";
  const physicianName = ingestion.provider.ordering_physician_name || "Ordering Physician";
  const totalPages = ingestion.source.total_pages || 1;

  // ── Vision-based tab detection (primary) ─────────────────────────────────
  // Send the actual PDF to Claude so it can see where the blank lines are.
  let visionTabs: { signHereTabs: any[]; dateSignedTabs: any[] } = { signHereTabs: [], dateSignedTabs: [] };
  if (pdfBase64) {
    try {
      console.log("[envelope-prep] Running vision-based tab detection...");
      visionTabs = await detectTabsFromPdf(pdfBase64, totalPages);
      console.log(`[envelope-prep] Vision found ${visionTabs.signHereTabs.length} signHere + ${visionTabs.dateSignedTabs.length} date tabs`);
    } catch (e: any) {
      console.warn("[envelope-prep] Vision tab detection failed:", e.message);
    }
  }

  // ── Anchor-based fallback (when vision finds nothing) ────────────────────
  // Use common healthcare signature label strings as anchors.
  // anchorIgnoreIfNotPresent=true so DocuSign never rejects with 400.
  const anchorFallbackSign = [
    "Provider Signature",
    "Physician Signature",
    "Authorized Signature",
    "Ordering Physician Signature",
    "Signature of Author",
    "Signature of Physician",
    "Signature:",
    "Signature",
  ];
  const anchorFallbackDate = ["Date:", "Date"];

  const signHereTabs = visionTabs.signHereTabs.length > 0
    ? visionTabs.signHereTabs
    : anchorFallbackSign.map((anchor, i) => ({
        tabLabel: `PhysicianSignature_${i + 1}`,
        anchorString: anchor,
        anchorMatchWholeWord: "false",
        anchorXOffset: "0",
        anchorYOffset: "20",
        anchorUnits: "pixels",
        anchorIgnoreIfNotPresent: "true",
      }));

  const dateSignedTabs = visionTabs.dateSignedTabs.length > 0
    ? visionTabs.dateSignedTabs
    : anchorFallbackDate.map((anchor, i) => ({
        tabLabel: `DateSigned_${i + 1}`,
        anchorString: anchor,
        anchorMatchWholeWord: "false",
        anchorXOffset: "40",
        anchorYOffset: "20",
        anchorUnits: "pixels",
        anchorIgnoreIfNotPresent: "true",
      }));

  return {
    envelope_needed: true,
    document_type: classification.classification.bucket,
    patient_name: patientName,
    physician_name: physicianName,
    envelope_config: {
      emailSubject: `Signature Required: ${classification.classification.bucket_label} – ${patientName}`,
      emailBlurb: `Please review and sign the attached ${classification.classification.bucket_label} for patient ${patientName}.`,
      status: "created",
      documents: [{ documentId: "1", name: documentName, note: classification.classification.bucket_label }],
      recipients: {
        signers: [{
          recipientId: "1",
          roleName: "ordering_physician",
          name: physicianName,
          email: "PLACEHOLDER",
          routingOrder: "1",
          tabs: { signHereTabs, dateSignedTabs, textTabs: [], initialHereTabs: [] },
        }],
      },
    },
    detected_signature_areas: visionTabs.signHereTabs.map((t, i) => ({
      page: parseInt(t.pageNumber) || 1,
      field_type: "signHere",
      label_text: "Physician Signature",
      anchor_string_used: `coordinate: x=${t.xPosition} y=${t.yPosition}`,
      already_completed: false,
      tab_created: true,
    })),
    skipped_fields: [],
    missing_expected_fields: [],
    manual_review_required: false,
    manual_review_reasons: [],
    placement_notes: visionTabs.signHereTabs.length > 0
      ? "Tabs placed via vision analysis of actual PDF."
      : "No signature lines found via vision — using anchor-string fallback.",
  };
}

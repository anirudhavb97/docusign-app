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
 * Anchor-string tab detection via Claude vision.
 *
 * WHY ANCHORS INSTEAD OF COORDINATES:
 * Pixel/point coordinates require us to map Claude's visual perception to
 * DocuSign's internal coordinate system — this mapping is imprecise and
 * produces misplaced tabs. Anchor strings are far more reliable: we find
 * the EXACT TEXT that appears just before each blank signature line and
 * pass it to DocuSign, which does its own precise text search and places
 * the tab right next to that text.
 *
 * For each blank field Claude returns:
 *   anchorString    — the exact printed label text (e.g. "Provider Signature for Jeremy Ross, MD")
 *   blankPosition   — "right" (blank is on the same line, to the right of the label)
 *                     "below" (blank is on the next line below the label)
 *   tabType         — "signature" | "date"
 *   pageNumber      — which page (1-based)
 */
async function detectTabsFromPdf(pdfBase64: string): Promise<{
  signHereTabs: any[];
  dateSignedTabs: any[];
}> {
  const prompt = `You are a DocuSign integration engineer analyzing a healthcare PDF.

Find EVERY blank signature line and blank date line in this document.

WHAT TO LOOK FOR:
- A blank signature line is a printed label (like "Signature:", "Provider Signature", "Physician Signature", "Authorized Signature", "Signature of Author", etc.) followed by a long blank underline (______ or an empty line).
- A blank date line is a label ("Date:", "Dated:", "Date Signed:", "Date:") followed by a blank underline.
- SKIP any line that already has a handwritten mark, a typed name, or ink on it.

FOR EACH BLANK FIELD, identify:
1. anchorString: the EXACT text of the printed label as it appears in the document (copy it character-for-character, including any name like "Provider Signature for Jeremy Ross, MD"). Keep it unique — include enough context to distinguish it from other labels on the page.
2. blankPosition: "right" if the blank underline is on the same line to the right of the label; "below" if the blank is on a separate line underneath the label.
3. tabType: "signature" or "date"
4. pageNumber: which page number (integer, 1-based)

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "fields": [
    {
      "anchorString": "<exact label text from document>",
      "blankPosition": "right" | "below",
      "tabType": "signature" | "date",
      "pageNumber": <integer>
    }
  ]
}

If no blank fields are found, return { "fields": [] }.`;

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

  let fields: any[] = [];
  try {
    const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    fields = Array.isArray(result.fields) ? result.fields : [];
  } catch {
    return { signHereTabs: [], dateSignedTabs: [] };
  }

  const signHereTabs: any[] = [];
  const dateSignedTabs: any[] = [];

  fields.forEach((f: any, i: number) => {
    if (!f.anchorString) return;

    // Offsets depend on whether the blank is to the right or below the label text.
    // "right": tab goes to the right of the anchor text on the same line.
    //   anchorXOffset = ~100px (past the end of the label), anchorYOffset = 0
    // "below": tab goes on the next line under the anchor text.
    //   anchorXOffset = 0, anchorYOffset = ~20px (one line height)
    const isBelow = f.blankPosition === "below";
    const baseTab = {
      tabLabel: `${f.tabType === "date" ? "DateSigned" : "PhysicianSign"}_${i + 1}`,
      anchorString: f.anchorString,
      anchorMatchWholeWord: "false",
      anchorCaseSensitive: "false",
      anchorXOffset: isBelow ? "0" : "100",
      anchorYOffset: isBelow ? "20" : "0",
      anchorUnits: "pixels",
      anchorIgnoreIfNotPresent: "true",   // never causes a 400 if text not found
    };

    if (f.tabType === "date") {
      dateSignedTabs.push(baseTab);
    } else {
      signHereTabs.push(baseTab);
    }
  });

  return { signHereTabs, dateSignedTabs };
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

  // ── Anchor-string detection via Claude vision (primary) ──────────────────
  // Claude reads the PDF visually and returns the EXACT printed label text
  // just before each blank signature/date line. DocuSign then finds that text
  // and places the tab precisely next to it — far more accurate than coordinates.
  let visionTabs: { signHereTabs: any[]; dateSignedTabs: any[] } = { signHereTabs: [], dateSignedTabs: [] };
  if (pdfBase64) {
    try {
      console.log("[envelope-prep] Detecting signature line anchors via vision...");
      visionTabs = await detectTabsFromPdf(pdfBase64);
      console.log(`[envelope-prep] Vision anchors: ${visionTabs.signHereTabs.length} signHere, ${visionTabs.dateSignedTabs.length} date`);
    } catch (e: any) {
      console.warn("[envelope-prep] Vision anchor detection failed:", e.message);
    }
  }

  // ── Generic anchor fallback ───────────────────────────────────────────────
  // If vision found nothing, use the most common healthcare signature label
  // strings. These cover ~95% of real documents. Each has anchorIgnoreIfNotPresent
  // so DocuSign never rejects with 400 if the text isn't there.
  // blankPosition is "below" for most standalone labels, "right" for "Signature:".
  const fallbackSignAnchors: Array<{ text: string; position: "right" | "below" }> = [
    { text: "Provider Signature",           position: "below" },
    { text: "Physician Signature",          position: "below" },
    { text: "Authorized Signature",         position: "below" },
    { text: "Ordering Physician Signature", position: "below" },
    { text: "Signature of Author",          position: "below" },
    { text: "Signature of Physician",       position: "below" },
    { text: "Signature:",                   position: "right" },
    { text: "Signature",                    position: "below" },
  ];
  const fallbackDateAnchors: Array<{ text: string; position: "right" | "below" }> = [
    { text: "Date:", position: "right" },
    { text: "Date",  position: "right" },
  ];

  function makeAnchorTab(anchor: { text: string; position: "right" | "below" }, i: number, prefix: string) {
    return {
      tabLabel: `${prefix}_${i + 1}`,
      anchorString: anchor.text,
      anchorMatchWholeWord: "false",
      anchorCaseSensitive: "false",
      anchorXOffset: anchor.position === "right" ? "100" : "0",
      anchorYOffset: anchor.position === "below" ? "20" : "0",
      anchorUnits: "pixels",
      anchorIgnoreIfNotPresent: "true",
    };
  }

  const signHereTabs = visionTabs.signHereTabs.length > 0
    ? visionTabs.signHereTabs
    : fallbackSignAnchors.map((a, i) => makeAnchorTab(a, i, "PhysicianSign"));

  const dateSignedTabs = visionTabs.dateSignedTabs.length > 0
    ? visionTabs.dateSignedTabs
    : fallbackDateAnchors.map((a, i) => makeAnchorTab(a, i, "DateSigned"));

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

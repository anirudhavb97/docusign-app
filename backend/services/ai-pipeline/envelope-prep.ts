/**
 * SKILL: healthcare-envelope-prep
 * Builds a DocuSign envelope configuration from classified fax document.
 * Input: IngestionResult + ClassificationResult
 * Output: EnvelopePrepResult ready for DocuSign REST API
 *
 * TAB PLACEMENT STRATEGY — percentage-based coordinates:
 *
 * WHY NOT ANCHOR STRINGS:
 *   Anchor strings require DocuSign to find exact text in the PDF text layer.
 *   Scanned PDFs have no text layer. Even text PDFs often have encoding
 *   differences that cause zero matches. Result: invisible/missing tabs.
 *
 * WHY NOT RAW PIXEL COORDINATES:
 *   Claude sees the PDF at an unknown render resolution. There is no reliable
 *   way to convert "pixel 430 in Claude's vision" to DocuSign points.
 *
 * THE SOLUTION — percentage → points:
 *   1. Ask Claude: "Where on the page is this blank line? Give me X% from
 *      left and Y% from top."
 *   2. Convert: x_pt = (xPct / 100) * 612,  y_pt = (yPct / 100) * 792
 *      (DocuSign Letter page = 612pt wide × 792pt tall, origin top-left)
 *   3. These coordinate tabs ALWAYS land in DocuSign — no text matching needed.
 *   4. A hardcoded last-page fallback tab guarantees the signer always sees
 *      at least one tab even if vision returns nothing.
 */
import Anthropic from "@anthropic-ai/sdk";
import { IngestionResult } from "./ingestion";
import { ClassificationResult } from "./classification";

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// DocuSign Letter-page coordinate space (origin = top-left)
const PAGE_W_PT = 612;
const PAGE_H_PT = 792;

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
    xPercent: number;
    yPercent: number;
    xPosition: number;
    yPosition: number;
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
 * Detect blank signature/date lines using visual percentage positioning.
 *
 * Claude looks at the PDF page by page and locates every blank underline
 * associated with "Signature", "Date", or equivalent labels. It reports
 * position as a percentage (0–100) from the top and from the left of the
 * page. We convert those percentages to DocuSign coordinate points.
 *
 * This approach works on BOTH text-layer PDFs AND scanned images because
 * it never relies on text extraction — only on visual analysis.
 */
async function detectTabsFromPdf(pdfBase64: string, totalPages: number): Promise<{
  signHereTabs: any[];
  dateSignedTabs: any[];
  detectedAreas: EnvelopePrepResult["detected_signature_areas"];
}> {
  const prompt = `You are analyzing a healthcare PDF document to locate blank signature lines and blank date lines.

WHAT TO FIND:
- A blank SIGNATURE line: a label like "Signature:", "Physician Signature", "Provider Signature", "Authorized Signature", "Ordering Physician Signature", "Signature of Author", etc. — followed by a BLANK underline (____) or empty space where no one has signed yet.
- A blank DATE line: a label like "Date:", "Date Signed:", "Dated:", "Date of Service:" — followed by a BLANK underline or empty space where no date has been written.

SKIP any field that already has:
- Handwriting or ink
- A typed or printed name/date
- A digital signature mark

FOR EACH BLANK FIELD you find:
1. page     — which page (integer, 1-based)
2. yPercent — vertical position of the BLANK LINE ITSELF as % from TOP of page (0 = top edge, 100 = bottom edge). This should be the line where a pen would touch, not the label above it.
3. xPercent — horizontal position where the BLANK LINE STARTS as % from LEFT edge (0 = left margin, 100 = right edge). Most signature blanks start around 10–30%.
4. type     — "signature" or "date"
5. label    — the short label text printed near this blank (e.g. "Physician Signature", "Date:")

BE PRECISE — estimate yPercent to the nearest 2–3%. If a signature line is near the bottom of the page it might be at yPercent 75–90. If it's in the middle, yPercent 40–60.

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "fields": [
    { "page": 1, "yPercent": 82, "xPercent": 12, "type": "signature", "label": "Physician Signature" },
    { "page": 1, "yPercent": 82, "xPercent": 58, "type": "date", "label": "Date:" }
  ]
}

If no blank fields are found, return { "fields": [] }.`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
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

  const textBlock = response.content[0];
  if (textBlock.type !== "text") throw new Error("Unexpected response type from tab detection");

  // Extract JSON — handle both raw and code-fenced responses
  const rawText = textBlock.text.trim();
  const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    console.warn("[envelope-prep] No JSON found in tab detection response:", rawText.slice(0, 200));
    return { signHereTabs: [], dateSignedTabs: [], detectedAreas: [] };
  }

  let fields: any[] = [];
  try {
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    fields = Array.isArray(parsed.fields) ? parsed.fields : [];
  } catch (e: any) {
    console.warn("[envelope-prep] JSON parse failed:", e.message);
    return { signHereTabs: [], dateSignedTabs: [], detectedAreas: [] };
  }

  console.log(`[envelope-prep] Vision detected ${fields.length} blank field(s):`, fields.map((f: any) => `${f.type}@p${f.page} y=${f.yPercent}% x=${f.xPercent}%`).join(", "));

  const signHereTabs: any[] = [];
  const dateSignedTabs: any[] = [];
  const detectedAreas: EnvelopePrepResult["detected_signature_areas"] = [];

  fields.forEach((f: any, i: number) => {
    const page = typeof f.page === "number" ? f.page : 1;
    const yPct = typeof f.yPercent === "number" ? Math.max(0, Math.min(100, f.yPercent)) : 80;
    const xPct = typeof f.xPercent === "number" ? Math.max(0, Math.min(100, f.xPercent)) : 10;

    // Convert percentages to DocuSign coordinate points
    // DocuSign origin is TOP-LEFT, Y increases downward
    const xPosition = Math.round((xPct / 100) * PAGE_W_PT);
    const yPosition = Math.round((yPct / 100) * PAGE_H_PT);

    const isDate = f.type === "date";
    const tab = {
      documentId: "1",
      pageNumber: String(page),
      xPosition: String(xPosition),
      yPosition: String(yPosition),
      tabLabel: `${isDate ? "DateSigned" : "PhysicianSign"}_${i + 1}`,
    };

    if (isDate) {
      dateSignedTabs.push(tab);
    } else {
      signHereTabs.push(tab);
    }

    detectedAreas.push({
      page,
      field_type: isDate ? "dateSigned" : "signHere",
      label_text: f.label || (isDate ? "Date" : "Signature"),
      xPercent: xPct,
      yPercent: yPct,
      xPosition,
      yPosition,
      tab_created: true,
    });
  });

  return { signHereTabs, dateSignedTabs, detectedAreas };
}

export async function prepareEnvelope(
  ingestion: IngestionResult,
  classification: ClassificationResult,
  documentName: string = "Healthcare_Document.pdf",
  pdfBase64?: string,
): Promise<EnvelopePrepResult> {
  // Skip envelope creation for documents that don't need signatures
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

  // ── Step 1: Vision-based percentage positioning ────────────────────────────
  // Claude reads the document visually and reports where each blank signature
  // line sits as a % from the top/left. We convert to DocuSign points.
  let visionResult: { signHereTabs: any[]; dateSignedTabs: any[]; detectedAreas: EnvelopePrepResult["detected_signature_areas"] } = {
    signHereTabs: [],
    dateSignedTabs: [],
    detectedAreas: [],
  };

  if (pdfBase64) {
    try {
      console.log("[envelope-prep] Running vision-based blank-line detection...");
      visionResult = await detectTabsFromPdf(pdfBase64, totalPages);
      console.log(`[envelope-prep] Vision result: ${visionResult.signHereTabs.length} signature tab(s), ${visionResult.dateSignedTabs.length} date tab(s)`);
    } catch (e: any) {
      console.warn("[envelope-prep] Vision detection failed:", e.message);
    }
  }

  // ── Step 2: Fallback if vision found nothing ───────────────────────────────
  // Place tabs in the typical signature zone of the last page.
  // Healthcare documents almost universally have signatures near the bottom.
  // These are coordinate tabs so they always appear — the sender can move them.
  let signHereTabs = visionResult.signHereTabs;
  let dateSignedTabs = visionResult.dateSignedTabs;
  let placementNotes: string;

  if (signHereTabs.length === 0) {
    // Fallback: last page, 85% down (≈ y=673pt), left margin (≈ x=75pt)
    // This is a safer default than the old y=620 which was too high
    signHereTabs = [{
      documentId: "1",
      pageNumber: String(totalPages),
      xPosition: "75",
      yPosition: "673",
      tabLabel: "PhysicianSign_Fallback",
    }];
    placementNotes = "Vision found no blank signature lines — fallback tab placed at bottom of last page. Move it to the correct position before sending.";
    console.warn("[envelope-prep] Vision returned no signature tabs — using fallback coordinates");
  } else {
    placementNotes = `Vision detection placed ${signHereTabs.length} signature tab(s) and ${dateSignedTabs.length} date tab(s) at visually detected blank line positions.`;
  }

  if (dateSignedTabs.length === 0 && signHereTabs.length > 0) {
    // Place a date tab to the right of the first signature tab
    const firstSig = signHereTabs[0];
    const sigY = parseInt(firstSig.yPosition, 10);
    const sigPage = firstSig.pageNumber;
    dateSignedTabs = [{
      documentId: "1",
      pageNumber: sigPage,
      xPosition: "340",
      yPosition: String(sigY),
      tabLabel: "DateSigned_Fallback",
    }];
  }

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
    detected_signature_areas: visionResult.detectedAreas,
    skipped_fields: [],
    missing_expected_fields: [],
    manual_review_required: false,
    manual_review_reasons: [],
    placement_notes: placementNotes,
  };
}

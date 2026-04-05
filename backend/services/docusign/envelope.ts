/**
 * DocuSign Envelope Service
 * Creates and sends envelopes via eSign API based on AI classification results.
 */
import axios from "axios";
import { ClassificationResult } from "../../../shared/types/classification";
import { EnvelopeConfig, Tab } from "../../../shared/types/envelope";

const DS_BASE_URL = process.env.DOCUSIGN_BASE_URL;
const DS_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;

function buildTabsFromClassification(classification: ClassificationResult): Tab[] {
  return classification.suggestedTags.map((tag) => ({
    tabType: tag.type === "signature" ? "signHere"
      : tag.type === "initials" ? "initialHere"
      : tag.type === "date_signed" ? "dateSigned"
      : tag.type === "checkbox" ? "checkbox"
      : "text",
    pageNumber: String(tag.pageNumber),
    xPosition: String(Math.round((tag.xPosition || 0.5) * 792)),
    yPosition: String(Math.round((tag.yPosition || 0.9) * 612)),
    anchorString: tag.anchorText,
    anchorXOffset: "0",
    anchorYOffset: "0",
    required: tag.required,
    tabLabel: tag.label,
  }));
}

export async function createAndSendEnvelope(
  accessToken: string,
  pdfBase64: string,
  classification: ClassificationResult,
  signerEmail: string,
  signerName: string,
  config: Partial<EnvelopeConfig> = {}
): Promise<string> {
  const tabs = buildTabsFromClassification(classification);
  const fields = classification.extractedFields;

  const subject = config.subject
    || `Signature Required: ${fields.patientName ? `Patient ${fields.patientName} - ` : ""}${classification.bucket.replace(/_/g, " ").toUpperCase()}`;

  const envelopeDefinition = {
    emailSubject: subject,
    emailBlurb: config.message || "Please review and sign the attached healthcare document.",
    status: "sent",
    documents: [
      {
        documentBase64: pdfBase64,
        name: `Healthcare_Document_${Date.now()}.pdf`,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: [
        {
          email: signerEmail,
          name: signerName,
          recipientId: "1",
          routingOrder: "1",
          tabs: {
            signHereTabs: tabs.filter((t) => t.tabType === "signHere").map((t) => ({
              anchorString: t.anchorString,
              anchorXOffset: t.anchorXOffset,
              anchorYOffset: t.anchorYOffset,
              pageNumber: t.pageNumber,
              xPosition: t.xPosition,
              yPosition: t.yPosition,
            })),
            initialHereTabs: tabs.filter((t) => t.tabType === "initialHere"),
            dateSignedTabs: tabs.filter((t) => t.tabType === "dateSigned"),
          },
        },
      ],
    },
  };

  const response = await axios.post(
    `${DS_BASE_URL}/v2.1/accounts/${DS_ACCOUNT_ID}/envelopes`,
    envelopeDefinition,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.envelopeId as string;
}

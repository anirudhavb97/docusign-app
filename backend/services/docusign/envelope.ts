/**
 * DocuSign Envelope Sender
 * Takes the EnvelopePrepResult and the actual PDF bytes, creates and sends the envelope.
 */
import axios from "axios";
import { EnvelopePrepResult } from "../ai-pipeline/envelope-prep";

const DS_BASE_URL = () => process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi";
const DS_ACCOUNT_ID = () => process.env.DOCUSIGN_ACCOUNT_ID;

export interface SendEnvelopeResult {
  envelopeId: string;
  status: string;
  sentAt: string;
}

export async function sendEnvelope(
  accessToken: string,
  pdfBase64: string,
  prepResult: EnvelopePrepResult,
  signerEmail: string,        // resolved physician email (from NPI registry or manual)
  signerName?: string
): Promise<SendEnvelopeResult> {
  if (!prepResult.envelope_needed || !prepResult.envelope_config) {
    throw new Error(`Envelope not needed: ${prepResult.reason}`);
  }

  const config = prepResult.envelope_config;

  // Inject actual signer email (replaces RESOLVE_FROM_NPI_REGISTRY placeholder)
  const signers = config.recipients.signers.map((s) => ({
    ...s,
    email: signerEmail,
    name: signerName || s.name,
  }));

  const envelopeDefinition = {
    emailSubject: config.emailSubject,
    emailBlurb: config.emailBlurb,
    status: config.status,
    documents: config.documents.map((doc) => ({
      documentBase64: pdfBase64,
      name: doc.name,
      fileExtension: "pdf",
      documentId: doc.documentId,
    })),
    recipients: {
      signers: signers.map((signer) => ({
        recipientId: signer.recipientId,
        name: signer.name,
        email: signer.email,
        routingOrder: signer.routingOrder,
        tabs: {
          signHereTabs: (signer.tabs.signHereTabs || []).filter((t: any) => !t.skipped).map((t: any) => ({
            anchorString: t.anchorString,
            anchorMatchWholeWord: t.anchorMatchWholeWord,
            anchorXOffset: t.anchorXOffset,
            anchorYOffset: t.anchorYOffset,
            anchorUnits: t.anchorUnits,
            anchorIgnoreIfNotPresent: t.anchorIgnoreIfNotPresent,
            tabLabel: t.tabLabel,
            scaleValue: t.scaleValue || "1.0",
          })),
          dateSignedTabs: (signer.tabs.dateSignedTabs || []).filter((t: any) => !t.skipped).map((t: any) => ({
            anchorString: t.anchorString,
            anchorMatchWholeWord: t.anchorMatchWholeWord,
            anchorXOffset: t.anchorXOffset,
            anchorYOffset: t.anchorYOffset,
            anchorUnits: t.anchorUnits,
            anchorIgnoreIfNotPresent: t.anchorIgnoreIfNotPresent,
            tabLabel: t.tabLabel,
          })),
          textTabs: signer.tabs.textTabs || [],
          initialHereTabs: signer.tabs.initialHereTabs || [],
        },
      })),
    },
  };

  const response = await axios.post(
    `${DS_BASE_URL()}/v2.1/accounts/${DS_ACCOUNT_ID()}/envelopes`,
    envelopeDefinition,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    envelopeId: response.data.envelopeId,
    status: response.data.status,
    sentAt: new Date().toISOString(),
  };
}

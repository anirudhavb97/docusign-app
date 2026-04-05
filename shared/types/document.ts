import { DocumentBucket, ClassificationResult } from "./classification";

export enum DocumentStatus {
  RECEIVED = "received",
  PROCESSING = "processing",
  CLASSIFIED = "classified",
  ENVELOPE_CREATED = "envelope_created",
  SENT_FOR_SIGNATURE = "sent_for_signature",
  SIGNED = "signed",
  COMPLETED = "completed",
  ERROR = "error",
  NO_ACTION_REQUIRED = "no_action_required",
}

export interface FaxDocument {
  id: string;
  faxId: string;
  receivedAt: string;
  payerName: string;
  payerFaxNumber: string;
  providerFaxNumber: string;
  status: DocumentStatus;
  bucket?: DocumentBucket;
  classification?: ClassificationResult;
  s3Key: string;
  pageCount: number;
  envelopeId?: string;
  envelopeStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export enum DocumentBucket {
  DME = "durable_medical_equipment",
  HOME_HEALTH = "home_health_orders",
  PLAN_OF_CARE = "plan_of_care",
  PRIOR_AUTH = "prior_authorization",
  MEDICAL_RECORDS = "medical_record_request",
  ATTESTATION = "attestation_audit",
  SIGNATURE_OTHER = "other_needs_signature",
  NO_SIGNATURE = "no_signature_required",
}

export const SIGNATURE_REQUIRED_BUCKETS: DocumentBucket[] = [
  DocumentBucket.DME,
  DocumentBucket.HOME_HEALTH,
  DocumentBucket.PLAN_OF_CARE,
  DocumentBucket.PRIOR_AUTH,
  DocumentBucket.ATTESTATION,
  DocumentBucket.SIGNATURE_OTHER,
];

export const BUCKET_LABELS: Record<DocumentBucket, string> = {
  [DocumentBucket.DME]: "Durable Medical Equipment Order",
  [DocumentBucket.HOME_HEALTH]: "Home Health Order",
  [DocumentBucket.PLAN_OF_CARE]: "Plan of Care",
  [DocumentBucket.PRIOR_AUTH]: "Prior Authorization",
  [DocumentBucket.MEDICAL_RECORDS]: "Medical Record Request",
  [DocumentBucket.ATTESTATION]: "Attestation / Audit Request",
  [DocumentBucket.SIGNATURE_OTHER]: "Other - Signature Required",
  [DocumentBucket.NO_SIGNATURE]: "Informational - No Signature Required",
};

export interface ClassificationResult {
  bucket: DocumentBucket;
  confidence: number;
  requiresSignature: boolean;
  reasoning: string;
  extractedFields: ExtractedFields;
  suggestedTags: SignatureTag[];
}

export interface ExtractedFields {
  patientName?: string;
  patientDOB?: string;
  patientMemberId?: string;
  providerName?: string;
  providerNPI?: string;
  providerFacility?: string;
  diagnosisCodes?: string[];
  procedureCodes?: string[];
  serviceStartDate?: string;
  serviceEndDate?: string;
  payerName?: string;
  referenceNumber?: string;
  urgency?: "routine" | "urgent" | "stat";
  additionalNotes?: string;
}

export interface SignatureTag {
  type: "signature" | "initials" | "date_signed" | "text" | "checkbox";
  pageNumber: number;
  anchorText?: string;
  xPosition?: number;
  yPosition?: number;
  label?: string;
  required: boolean;
  signerRole: "physician" | "provider" | "patient" | "authorized_rep";
}

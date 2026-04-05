export interface EnvelopeConfig {
  documentId: string;
  subject: string;
  message: string;
  signers: Signer[];
  ccRecipients?: CcRecipient[];
  expiresInDays?: number;
  reminderDays?: number;
  urgency: "routine" | "urgent" | "stat";
}

export interface Signer {
  email: string;
  name: string;
  role: string;
  routingOrder: number;
  tabs: Tab[];
}

export interface CcRecipient {
  email: string;
  name: string;
  routingOrder: number;
}

export interface Tab {
  tabType: "signHere" | "initialHere" | "dateSigned" | "text" | "checkbox";
  pageNumber: string;
  xPosition: string;
  yPosition: string;
  anchorString?: string;
  anchorXOffset?: string;
  anchorYOffset?: string;
  required?: boolean;
  tabLabel?: string;
}

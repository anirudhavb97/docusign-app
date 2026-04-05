export interface IncomingFax {
  faxId: string;
  fromNumber: string;
  toNumber: string;
  receivedAt: string;
  pageCount: number;
  fileUrl?: string;
  rawBytes?: Buffer;
  agreementDeskEmailId?: string;
}

export interface FaxSendRequest {
  toNumber: string;
  fromNumber: string;
  documentPath: string;
  coverPageText?: string;
  subject?: string;
}

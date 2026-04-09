/**
 * X12 EDI 277 Parser — Health Care Information Status Notification
 *
 * The 277 is sent by payers (insurance companies) to notify providers of
 * claim status. It contains no attached document — just structured EDI data.
 *
 * Key segments parsed:
 *   ISA — Interchange header (sender/receiver IDs, date)
 *   GS  — Functional group header
 *   NM1*PR  — Payer name
 *   NM1*41  — Submitter / sender name
 *   NM1*1P  — Billing provider
 *   NM1*QC  — Patient name
 *   TRN — Trace / claim reference number
 *   STC — Status information (category + code)
 *   DTP — Date of service
 *   AMT — Claim amount
 */

export interface X12_277_Result {
  payer?: string;
  payerId?: string;
  sender?: string;
  senderId?: string;
  provider?: string;
  patient?: string;
  claimId?: string;
  claimStatus?: string;
  claimStatusDescription?: string;
  serviceDate?: string;
  totalAmount?: number;
  interchangeDate?: string;
  requestType?: string;        // IMAGING_REQUEST | NOTES_REQUEST | SIGNATURE_REQUEST | INFO_REQUEST
  requestedServices?: string[]; // human-readable list of requested items (X-rays, MRI, etc.)
}

// Well-known payer IDs → display names (augmented with dummy names for demo)
const KNOWN_PAYERS: Record<string, string> = {
  AETNA:       "Aetna Health Inc.",
  AETNA001:    "Aetna Health Inc.",
  "1AETNA":    "Aetna Health Inc.",
  BCBS:        "Blue Cross Blue Shield",
  "1BCBS":     "Blue Cross Blue Shield",
  BCBSIL:      "Blue Cross Blue Shield of Illinois",
  CIGNA:       "Cigna Healthcare",
  CIGNA001:    "Cigna Healthcare",
  UHC:         "UnitedHealth Group",
  UNITED:      "UnitedHealth Group",
  HUMANA:      "Humana Inc.",
  HUMANA001:   "Humana Inc.",
  CMS:         "Medicare / CMS",
  MEDICARE:    "Medicare / CMS",
  MEDICAID:    "State Medicaid Program",
  ANTHEM:      "Anthem Blue Cross",
  MOLINA:      "Molina Healthcare",
  CENTENE:     "Centene Corporation",
  MAGELLAN:    "Magellan Health",
  TRICARE:     "TRICARE / Defense Health Agency",
  KAISER:      "Kaiser Permanente",
};

// Well-known submitter / clearing-house names
const KNOWN_SENDERS: Record<string, string> = {
  AVAILITY:    "Availity LLC",
  CHANGE:      "Change Healthcare",
  WAYSTAR:     "Waystar Health",
  TRIZETTO:    "Trizetto Provider Solutions",
  OPTUM:       "Optum360",
  EMDEON:      "Emdeon Business Services",
  CLAIMREMEDI: "ClaimRemedi",
  CAPARIO:     "Capario Inc.",
  RELAY:       "Relay Health",
};

// STC status code descriptions (partial — most common)
const STC_DESCRIPTIONS: Record<string, string> = {
  "A1": "Acknowledged",
  "A2": "Accepted",
  "A3": "Accepted with Changes",
  "A4": "Acknowledged — Received",
  "A7": "Acknowledged — Not Found",
  "F0": "Finalized — Paid",
  "F1": "Finalized — Denied",
  "F2": "Finalized — Revised",
  "F3": "Finalized — Adjusted",
  "R0": "Received",
  "R1": "Pending",
  "R3": "Returned to Provider",
  "R4": "Pended for Review",
  "20": "Accepted without Errors",
  "21": "Missing/Invalid Data",
};

function lookupPayer(id?: string): string | undefined {
  if (!id) return undefined;
  const clean = id.trim().toUpperCase().replace(/\s+/g, "");
  return KNOWN_PAYERS[clean];
}

function lookupSender(id?: string): string | undefined {
  if (!id) return undefined;
  const clean = id.trim().toUpperCase().replace(/\s+/g, "");
  return KNOWN_SENDERS[clean];
}

function stcDescription(code?: string): string {
  if (!code) return "Unknown";
  const [cat] = code.split(":");
  return STC_DESCRIPTIONS[cat] || `Status ${code}`;
}

function formatDate(yymmdd?: string): string | undefined {
  if (!yymmdd || yymmdd.length < 8) return undefined;
  const y = yymmdd.slice(0, 4);
  const m = yymmdd.slice(4, 6);
  const d = yymmdd.slice(6, 8);
  try {
    return new Date(`${y}-${m}-${d}`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return yymmdd;
  }
}

export function parseX12_277(raw: string): X12_277_Result {
  // Detect separators from ISA segment (always 106 chars in standard X12)
  // Element separator = char at position 3; segment terminator = char at 105
  const elementSep   = raw.length > 3 ? raw[3] : "*";
  const segmentTerm  = raw.length > 105 ? raw[105] : "~";

  const segments = raw
    .split(segmentTerm)
    .map(s => s.replace(/\r|\n/g, "").trim())
    .filter(s => s.length > 0)
    .map(s => s.split(elementSep));

  const result: X12_277_Result = {};

  for (const seg of segments) {
    const id = seg[0]?.trim();

    if (id === "ISA") {
      result.senderId      = seg[6]?.trim();
      result.interchangeDate = formatDate(seg[9]);
    }

    if (id === "NM1") {
      const qualifier = seg[1]?.trim();
      // Name: last in [3], first in [4]; for org it's all in [3]
      const lastName  = seg[3]?.trim();
      const firstName = seg[4]?.trim();
      const name = firstName ? `${firstName} ${lastName}` : lastName;
      const entityId = seg[9]?.trim();

      switch (qualifier) {
        case "PR":  // Payer
          result.payer   = lookupPayer(entityId) || lookupPayer(lastName) || name;
          result.payerId = entityId;
          break;
        case "41":  // Submitter / sender
          result.sender   = lookupSender(entityId) || lookupSender(lastName) || name;
          result.senderId = entityId;
          break;
        case "1P":  // Billing provider
        case "85":
          result.provider = name;
          break;
        case "QC":  // Patient
          result.patient = name;
          break;
      }
    }

    if (id === "TRN") {
      if (!result.claimId) result.claimId = seg[2]?.trim();
    }

    if (id === "STC") {
      const code = seg[1]?.trim();
      result.claimStatus            = code;
      result.claimStatusDescription = stcDescription(code);
    }

    if (id === "DTP" && seg[1]?.trim() === "472") {
      // Date of Service
      result.serviceDate = formatDate(seg[3]?.trim());
    }

    if (id === "AMT") {
      const amt = parseFloat(seg[2] || "0");
      if (!isNaN(amt) && amt > 0) result.totalAmount = amt;
    }

    // REF*ZZ — custom request type tag embedded in EDI
    if (id === "REF" && seg[1]?.trim() === "ZZ") {
      result.requestType = seg[2]?.trim();
    }

    // REF*EA — requested services (format: "LABEL:CODE1,CODE2")
    if (id === "REF" && seg[1]?.trim() === "EA") {
      const val = seg[2]?.trim() || "";
      if (val.includes(":")) {
        const [label, codes] = val.split(":");
        const items = codes.split(",").map(c => `${label.replace(/-/g, " ")} (${c.trim()})`);
        result.requestedServices = [...(result.requestedServices || []), ...items];
      } else {
        result.requestedServices = [...(result.requestedServices || []), val.replace(/-/g, " ")];
      }
    }

    // LQ — line service codes (radiology CPT codes indicate imaging)
    if (id === "LQ") {
      const cptCode = seg[2]?.trim();
      if (cptCode) {
        const CPT_LABELS: Record<string, string> = {
          "71046": "Chest X-Ray 2 views (CPT 71046)",
          "71047": "Chest X-Ray 3 views (CPT 71047)",
          "71048": "Chest X-Ray 4+ views (CPT 71048)",
          "70553": "Brain MRI w/wo contrast (CPT 70553)",
          "70450": "Head CT without contrast (CPT 70450)",
          "72148": "Lumbar Spine MRI (CPT 72148)",
          "73721": "Knee MRI (CPT 73721)",
        };
        const label = CPT_LABELS[cptCode] || `Service CPT ${cptCode}`;
        if (!(result.requestedServices || []).includes(label)) {
          result.requestedServices = [...(result.requestedServices || []), label];
        }
      }
    }
  }

  return result;
}

/**
 * Build a human-readable summary from parsed 277 data
 */
export function build277Summary(parsed: X12_277_Result, rawLength: number): string {
  const parts: string[] = [];

  if (parsed.payer)    parts.push(`Claim status notification from ${parsed.payer}`);
  else                 parts.push("HL7 X12 277 claim status notification received");

  if (parsed.patient)  parts.push(`for patient ${parsed.patient}`);
  if (parsed.claimId)  parts.push(`(Claim #${parsed.claimId})`);
  parts.push(".");

  if (parsed.claimStatusDescription) {
    parts.push(` Status: ${parsed.claimStatusDescription}.`);
  }

  // Include requested services if present
  if (parsed.requestedServices && parsed.requestedServices.length > 0) {
    parts.push(` Requested: ${parsed.requestedServices.join("; ")}.`);
  }

  if (parsed.totalAmount) {
    parts.push(` Claim amount: $${parsed.totalAmount.toLocaleString()}.`);
  }
  if (parsed.serviceDate) {
    parts.push(` Service date: ${parsed.serviceDate}.`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

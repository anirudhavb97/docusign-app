/**
 * OCR Service — uses Claude vision to extract text from fax PDFs.
 * Faxes are often low-resolution scans; Claude handles these robustly.
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function extractTextFromFax(pdfBase64: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: `Extract ALL text from this fax document verbatim. This may be a low-resolution scan.
Preserve:
- All field labels and their values
- Signature lines and any text near them
- Dates, codes (ICD-10, CPT, NPI), member IDs
- Headers, footers, form titles
- Checkboxes and their states (checked/unchecked)
Output the raw extracted text only, preserving layout as much as possible.`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("OCR returned non-text response");
  return content.text;
}

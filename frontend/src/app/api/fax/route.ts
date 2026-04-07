/**
 * Next.js API route — proxies /api/fax?path=<endpoint> to Express backend.
 * Handles JSON, multipart/form-data (uploads), and DELETE requests.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3001";

async function proxy(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "inbox-items";
  const url = `${BACKEND}/api/fax/${path}`;

  try {
    let res: Response;

    const isMultipart = (path === "upload" || path === "send-envelope-manual") && req.method === "POST";
    if (isMultipart) {
      // Forward multipart form data for file uploads
      const formData = await req.formData();
      res = await fetch(url, { method: "POST", body: formData });
    } else {
      const body = req.method !== "GET" && req.method !== "DELETE"
        ? await req.text().catch(() => null)
        : null;
      res = await fetch(url, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body } : {}),
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Backend unavailable (${e.message})` },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest)    { return proxy(req); }
export async function POST(req: NextRequest)   { return proxy(req); }
export async function DELETE(req: NextRequest) { return proxy(req); }

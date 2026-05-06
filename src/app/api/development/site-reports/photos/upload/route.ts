import { NextResponse, type NextRequest } from "next/server";
import { uploadSiteReportPhoto } from "@/lib/development/server/photo-upload-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Photo upload bridge — accepts JSON `{ reportId, fileBase64, ... }`
 * from the client component and calls the server action. Errors are
 * surfaced as `{ error: string }` with a 400 status; the client
 * displays them per-row.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Parameters<
      typeof uploadSiteReportPhoto
    >[0];
    const result = await uploadSiteReportPhoto(body);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

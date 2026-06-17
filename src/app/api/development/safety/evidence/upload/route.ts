import { NextResponse, type NextRequest } from "next/server";
import { uploadSafetyEvidence } from "@/lib/development/server/safety-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Safety evidence upload bridge — accepts JSON
 * `{ incidentId, kind, fileBase64, ... }` from the client upload zone and
 * calls the server action. Errors are surfaced as `{ error: string }`
 * with a 400 status; the client displays them per-row.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Parameters<
      typeof uploadSafetyEvidence
    >[0];
    const result = await uploadSafetyEvidence(body);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

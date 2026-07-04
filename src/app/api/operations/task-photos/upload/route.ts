import { NextResponse, type NextRequest } from "next/server";
import { uploadTaskPhoto } from "@/features/operations/task-photo-upload-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * OFFLINE-FIELD-PHOTO-FIX — task photo upload bridge. Accepts JSON
 * `{ taskId, fileBase64, fileName, mimeType, sizeBytes, caption?, gpsLat?,
 * gpsLng? }` from the field PWA's offline-photo drain and calls the server
 * action. The drain deletes the queued photo only on a 2xx response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Parameters<typeof uploadTaskPhoto>[0];
    const result = await uploadTaskPhoto(body);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

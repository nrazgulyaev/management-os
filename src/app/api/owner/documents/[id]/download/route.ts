import { NextRequest, NextResponse } from "next/server";
import { ownerCanAccessDocument } from "@/features/owner-portal/document-access";
import { getDocumentSignedUrl } from "@/features/storage/storage-service";

/**
 * Owner-portal document download — signed-URL redirect.
 *
 * GET /api/owner/documents/[id]/download → 302 to a short-lived signed URL.
 *
 * Scope: ownerCanAccessDocument re-verifies the document is tagged to one of
 * the caller's own owner records (or is org-bounded owner-visible) — the same
 * predicate the listing query uses, re-checked per id so a guessed/forged id
 * cannot leak another owner's (or an internal) file. The shared
 * /api/documents/[id]/download endpoint is org-only and is now operator-gated.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const allowed = await ownerCanAccessDocument(id);
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await getDocumentSignedUrl(id);
  if (!result.ok || !result.signedUrl) {
    return NextResponse.json(
      { error: result.error ?? "No file attached to this document yet." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(result.signedUrl, { status: 302 });
}

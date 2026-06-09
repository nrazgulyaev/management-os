import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getDocumentSignedUrl } from "@/features/storage/storage-service";

/**
 * Documents-app v1 — canonical download endpoint.
 *
 * GET /api/documents/[id]/download
 *   → 302 redirect to a short-lived Supabase Storage signed URL.
 *
 * Thin alias over the storage signed-url service so the documents app
 * has a stable, well-named download URL (the plan references
 * /api/documents/[id]/download). Auth: requires sign-in; visibility is
 * gated upstream by the page-level listing query.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const result = await getDocumentSignedUrl(id);
  if (!result.ok || !result.signedUrl) {
    return NextResponse.json(
      { error: result.error ?? "No file attached to this document yet." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(result.signedUrl, { status: 302 });
}

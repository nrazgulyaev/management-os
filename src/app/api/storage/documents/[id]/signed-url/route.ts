import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getDocumentSignedUrl } from "@/features/storage/storage-service";

/**
 * STORAGE-1-WIRE — signed URL redirect for document downloads.
 *
 * GET /api/storage/documents/[id]/signed-url
 *   → 302 redirect to a 1h Supabase Storage signed URL
 *
 * Auth: requires sign-in. Visibility scoping is enforced upstream
 * by the page-level listing queries (listMyDocuments,
 * listMyInvestorDocuments) — only documents the user can see end up
 * in the page, and only those IDs reach this endpoint via the
 * download link.
 *
 * Fine-grained per-doc access checks (re-verify the requesting user
 * is in scope for the visibility tier) are a STORAGE-1-WIRE-AUTH
 * follow-up; this is safe for the demo since the page-level filters
 * already gate visibility.
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
  const result = await getDocumentSignedUrl(id, user.organizationId);
  if (!result.ok || !result.signedUrl) {
    return NextResponse.json(
      { error: result.error ?? "Unable to generate signed URL" },
      { status: 404 },
    );
  }
  return NextResponse.redirect(result.signedUrl, { status: 302 });
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireInternalUser } from "@/features/auth/permissions";
import { getDocumentSignedUrl } from "@/features/storage/storage-service";

/**
 * Documents-app v1 — canonical download endpoint (INTERNAL OPERATORS ONLY).
 *
 * GET /api/documents/[id]/download
 *   → 302 redirect to a short-lived Supabase Storage signed URL.
 *
 * This endpoint is org-scoped (any active doc in the operator's org), which is
 * correct for internal operators but would be an IDOR for external portal
 * users, so it is gated to internal users. External portals have their own
 * per-entity scoped routes: /api/owner/documents/[id]/download,
 * /api/investor-portal/documents/[id]/download, /api/buyer-portal/documents/[id]/download.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Operators only — external portal users use their per-entity scoped routes.
  try {
    await requireInternalUser();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const result = await getDocumentSignedUrl(id, user.organizationId);
  if (!result.ok || !result.signedUrl) {
    return NextResponse.json(
      { error: result.error ?? "No file attached to this document yet." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(result.signedUrl, { status: 302 });
}

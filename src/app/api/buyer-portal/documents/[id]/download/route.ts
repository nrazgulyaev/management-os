import { NextRequest, NextResponse } from "next/server";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerCanAccessDocument } from "@/lib/buyer-portal/documents";
import { getDocumentSignedUrl } from "@/features/storage/storage-service";

/**
 * Buyer-portal document download — signed-URL redirect.
 *
 * GET /api/buyer-portal/documents/[id]/download
 *   → 302 redirect to a 1h Supabase Storage signed URL
 *
 * Auth: requires a buyer session (Supabase auth → `buyers` row). The
 * existing `/api/storage/documents/[id]/signed-url` route requires an
 * `app_users` record, which buyers do NOT have, so buyers need this
 * dedicated, scope-checked endpoint.
 *
 * Scoping: `buyerCanAccessDocument` re-verifies the document is tied to a
 * villa the buyer owns (or its project) and sits in a buyer-visible
 * visibility tier — the same predicate the listing query uses. This is a
 * per-document re-check so a guessed/forged id cannot leak another
 * buyer's files.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getBuyerSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const allowed = await buyerCanAccessDocument(session.buyerId, id);
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await getDocumentSignedUrl(id);
  if (!result.ok || !result.signedUrl) {
    return NextResponse.json(
      { error: result.error ?? "Unable to generate download link" },
      { status: 404 },
    );
  }
  return NextResponse.redirect(result.signedUrl, { status: 302 });
}

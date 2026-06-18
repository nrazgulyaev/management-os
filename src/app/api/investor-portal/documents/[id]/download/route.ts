import { NextRequest, NextResponse } from "next/server";
import { investorCanAccessDocument } from "@/lib/investor-portal/document-access";
import { getDocumentSignedUrl } from "@/features/storage/storage-service";

/**
 * Investor-portal document download — signed-URL redirect.
 *
 * GET /api/investor-portal/documents/[id]/download → 302 to a signed URL.
 *
 * Scope: investorCanAccessDocument re-verifies the document is the agreement /
 * drawdown-receipt of one of THIS investor's own commitments (the same
 * entitlement as the listing), re-checked per id so a guessed/forged id cannot
 * leak another investor's file. The shared /api/documents/[id]/download
 * endpoint is org-only and is now operator-gated.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const allowed = await investorCanAccessDocument(id).catch(() => false);
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

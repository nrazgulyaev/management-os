import { NextResponse } from "next/server";
import { renderOwnerStatementPdf } from "@/features/finance/pdf/render-owner-statement-pdf";
import { getOwnerStatementById } from "@/features/finance/services";
import { getOwnerIdsForCurrentUser } from "@/features/access-grants/services";
import { getCurrentUserContext } from "@/features/auth/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // Fetch the statement first so we can authorise against owner_id.
  const statement = await getOwnerStatementById(id);
  if (!statement) return new NextResponse("Not found", { status: 404 });

  // Internal staff can always render. Owners only get their own,
  // and only for issued / approved / paid statements.
  const ctxResult = await getCurrentUserContext();
  const isInternal = ctxResult.isInternal && ctxResult.mode === "live";
  if (!isInternal) {
    if (!["issued", "approved", "paid"].includes(statement.status)) {
      return new NextResponse("Statement not yet issued", { status: 403 });
    }
    const ownerIds = await getOwnerIdsForCurrentUser();
    if (ownerIds.length === 0 || !ownerIds.includes(statement.ownerId)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const result = await renderOwnerStatementPdf(id, { audience: "owner" });
  if (!result) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

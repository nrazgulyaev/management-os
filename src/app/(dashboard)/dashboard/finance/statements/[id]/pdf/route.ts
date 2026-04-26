import { NextResponse } from "next/server";
import { renderOwnerStatementPdf } from "@/features/finance/pdf/render-owner-statement-pdf";
import { requirePermission, AuthorizationError } from "@/features/auth/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("owner_statement.read");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    throw err;
  }
  const { id } = await ctx.params;
  const result = await renderOwnerStatementPdf(id, { audience: "internal" });
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

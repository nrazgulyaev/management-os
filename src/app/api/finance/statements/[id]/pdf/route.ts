import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { ownerStatements } from "@/lib/db/schema/finance";
import { owners } from "@/lib/db/schema/ownership";
import { villas } from "@/lib/db/schema/projects";
import { organizations } from "@/lib/db/schema/saas";
import { renderStatementPdf } from "@/features/finance/statement-pdf";

/**
 * STATEMENT-1 — Direct-stream PDF download.
 *
 * No cloud storage (STORAGE-1 sprint) → endpoint renders + streams on
 * each request. Cheap because @react-pdf is fully synchronous-ish and
 * statements are bounded by line count.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  const { id } = await params;
  const orgId = await requireOrgId();
  const [row] = await db
    .select({
      statementId: ownerStatements.id,
      statementCode: ownerStatements.statementCode,
      periodMonth: ownerStatements.periodMonth,
      ownerName: owners.displayName,
      villaUnitCode: villas.unitCode,
      villaName: villas.name,
      orgName: organizations.name,
    })
    .from(ownerStatements)
    .leftJoin(owners, eq(owners.id, ownerStatements.ownerId))
    .leftJoin(villas, eq(villas.id, ownerStatements.villaId))
    .leftJoin(organizations, eq(organizations.id, ownerStatements.organizationId))
    .where(and(eq(ownerStatements.id, id), eq(ownerStatements.organizationId, orgId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const monthLabel = row.periodMonth
    ? new Date(row.periodMonth + "T00:00:00Z").toLocaleString("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

  const buffer = await renderStatementPdf({
    statementId: row.statementId,
    ownerName: row.ownerName ?? "—",
    villaCode: row.villaUnitCode ?? "—",
    villaName: row.villaName,
    monthLabel,
    organizationName: row.orgName ?? "Arconique",
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${row.statementCode}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

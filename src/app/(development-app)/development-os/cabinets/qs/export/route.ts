import { NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { boqDocuments, boqSections, boqItems } from "@/lib/db/schema/boq";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  serializeBoqCsv,
  type CsvBoqItem,
  type CsvBoqSection,
} from "@/lib/development/server/boq/boq-import-export";

export const dynamic = "force-dynamic";

/**
 * P1 — QS-desk "Export XLSX ↓" toolbar handler.
 *
 * Streams a BOQ revision as a CSV download (Excel / Sheets / Numbers all
 * open it natively — the same CSV round-trip already used by the
 * /development-os/boq/[code]/export page; a binary XLSX writer is a
 * deliberately deferred follow-up to avoid bundling a multi-MB
 * dependency). Org-scoped + internal-only, mirroring the cabinet's other
 * reads. `?doc=<boqDocumentId>` selects the revision; absent → the most
 * recently created active document for the org.
 */
export async function GET(req: Request) {
  // Internal-only, like the cabinet's sibling actions.
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = getDb();
  if (!db) return new NextResponse("Database not configured", { status: 503 });

  const url = new URL(req.url);
  const docParam = url.searchParams.get("doc");

  const docConditions = [eq(boqDocuments.organizationId, organizationId)];
  if (docParam) docConditions.push(eq(boqDocuments.id, docParam));
  const [doc] = await db
    .select()
    .from(boqDocuments)
    .where(and(...docConditions))
    .orderBy(desc(boqDocuments.createdAt))
    .limit(1);
  if (!doc) return new NextResponse("No BOQ revision found", { status: 404 });

  const sections = await db
    .select()
    .from(boqSections)
    .where(
      and(
        eq(boqSections.boqDocumentId, doc.id),
        eq(boqSections.organizationId, organizationId),
      ),
    )
    .orderBy(asc(boqSections.displayOrder), asc(boqSections.sectionCode));
  const sectionIds = sections.map((s) => s.id);
  const items =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(boqItems)
          .where(
            and(
              sql`${boqItems.sectionId} = ANY(${sectionIds}::uuid[])`,
              eq(boqItems.organizationId, organizationId),
            ),
          )
          .orderBy(asc(boqItems.itemCode));

  const sectionCodeById = new Map(sections.map((s) => [s.id, s.sectionCode]));
  const csvSections: CsvBoqSection[] = sections.map((s) => ({
    sectionCode: s.sectionCode,
    sectionName: s.sectionName,
  }));
  const csvItems: CsvBoqItem[] = items.map((it) => ({
    sectionCode: sectionCodeById.get(it.sectionId) ?? "",
    itemCode: it.itemCode,
    description: it.description,
    quantity: Number(it.quantity),
    uom: it.unitOfMeasure,
    unitRateMinor: it.unitRateMinor,
    currency: it.rateCurrency,
  }));

  const csv = serializeBoqCsv({ sections: csvSections, items: csvItems });
  const filename = `${doc.boqCode}-${doc.versionLabel}.csv`.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

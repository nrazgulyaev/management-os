import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyerUnitAssignments, buyerProgressReports } from "@/lib/db/schema/buyers";
import { villas } from "@/lib/db/schema/projects";

/**
 * Buyer-portal progress-report scoping.
 *
 * The DB connection runs NO row-level security (src/lib/db/client.ts is a plain
 * postgres-js client — `current_buyer_id` is never set), so every buyer read
 * MUST filter explicitly. A buyer may see published progress reports only for
 * projects where they own at least one assigned unit. Centralised here so the
 * list / detail / dashboard surfaces cannot drift apart.
 */

/** Distinct project IDs where this buyer owns an assigned unit. */
export async function getBuyerProjectIds(buyerId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ projectId: villas.projectId })
    .from(buyerUnitAssignments)
    .innerJoin(villas, eq(villas.id, buyerUnitAssignments.unitId))
    .where(eq(buyerUnitAssignments.buyerId, buyerId));
  return rows.map((r) => r.projectId).filter((p): p is string => Boolean(p));
}

/** Published reports for the buyer's projects only (newest first). */
export async function listBuyerProgressReports(buyerId: string, limit?: number) {
  const db = getDb();
  if (!db) return [];
  const projectIds = await getBuyerProjectIds(buyerId);
  if (projectIds.length === 0) return [];
  const q = db
    .select()
    .from(buyerProgressReports)
    .where(
      and(
        eq(buyerProgressReports.status, "published"),
        inArray(buyerProgressReports.projectId, projectIds),
      ),
    )
    .orderBy(desc(buyerProgressReports.reportingPeriodEnd));
  return limit ? q.limit(limit) : q;
}

/**
 * A single published report, but ONLY if its project is one the buyer owns a
 * unit in. Returns null otherwise (the caller should notFound()) — closes the
 * IDOR where any buyer could read any report by guessing its id.
 */
export async function getBuyerProgressReport(buyerId: string, reportId: string) {
  const db = getDb();
  if (!db) return null;
  const projectIds = await getBuyerProjectIds(buyerId);
  if (projectIds.length === 0) return null;
  const rows = await db
    .select()
    .from(buyerProgressReports)
    .where(
      and(
        eq(buyerProgressReports.id, reportId),
        eq(buyerProgressReports.status, "published"),
        inArray(buyerProgressReports.projectId, projectIds),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

import "server-only";

import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { executiveMetricsSnapshots } from "@/lib/db/schema/executive";

/** ISO `yyyy-mm-dd` string for a Date (the snapshot_date column is a DATE). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Latest company-wide snapshot. */
export async function getLatestCompanySnapshot() {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(executiveMetricsSnapshots)
    .where(
      and(
        eq(executiveMetricsSnapshots.scope, "company_wide"),
        isNull(executiveMetricsSnapshots.projectId),
      ),
    )
    .orderBy(desc(executiveMetricsSnapshots.snapshotDate))
    .limit(1);
  return rows[0] ?? null;
}

/** Latest snapshot for a project. */
export async function getLatestProjectSnapshot(projectId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(executiveMetricsSnapshots)
    .where(
      and(
        eq(executiveMetricsSnapshots.scope, "project"),
        eq(executiveMetricsSnapshots.projectId, projectId),
      ),
    )
    .orderBy(desc(executiveMetricsSnapshots.snapshotDate))
    .limit(1);
  return rows[0] ?? null;
}

/** Last N company-wide snapshots, newest first. */
export async function listRecentCompanySnapshots(limit = 30) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(executiveMetricsSnapshots)
    .where(
      and(
        eq(executiveMetricsSnapshots.scope, "company_wide"),
        isNull(executiveMetricsSnapshots.projectId),
      ),
    )
    .orderBy(desc(executiveMetricsSnapshots.snapshotDate))
    .limit(limit);
}

/**
 * Company-wide snapshots whose `snapshot_date` falls within
 * `[start, end]` (inclusive), oldest first. Used by the time-range
 * executive rollups (quarterly / YTD) to render whatever history has
 * accrued so far — the series fills in over time as the daily metrics
 * cron writes one snapshot per day.
 */
export async function listCompanySnapshotsInRange(start: Date, end: Date) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(executiveMetricsSnapshots)
    .where(
      and(
        eq(executiveMetricsSnapshots.scope, "company_wide"),
        isNull(executiveMetricsSnapshots.projectId),
        gte(executiveMetricsSnapshots.snapshotDate, isoDate(start)),
        lte(executiveMetricsSnapshots.snapshotDate, isoDate(end)),
      ),
    )
    .orderBy(asc(executiveMetricsSnapshots.snapshotDate));
}

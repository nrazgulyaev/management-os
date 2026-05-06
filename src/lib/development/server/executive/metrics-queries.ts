import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { executiveMetricsSnapshots } from "@/lib/db/schema/executive";

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

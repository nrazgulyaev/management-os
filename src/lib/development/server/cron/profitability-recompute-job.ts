import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.B.3 — Profitability recompute (Sunday 02:00).
 *
 * For each project, find all assets, then re-derive cost allocations.
 * The actual cost-pool inputs come from existing budget/transaction
 * tables — for this v1, we operate as a no-op skeleton when no project
 * pools are available, but log the count of assets that would be
 * recomputed in a real run.
 *
 * Idempotent — derived state recomputed from source-of-truth tables.
 */
export async function runDevOsProfitabilityRecompute(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { recomputed: 0 },
      error: "DB unavailable",
    };
  }

  // Count assets that would be recomputed.
  const result = await db.execute<{
    project_id: string;
    asset_count: string;
  }>(sql`
    SELECT
      p.id::text AS project_id,
      COUNT(v.id)::text AS asset_count
    FROM projects p
    LEFT JOIN villas v ON v.project_id = p.id
    WHERE p.status NOT IN ('archived')
    GROUP BY p.id
    HAVING COUNT(v.id) > 0
  `);
  const rows =
    rowsOf<{ project_id: string; asset_count: string }>(result);

  let totalAssets = 0;
  for (const row of rows) {
    const assetCount = Number(row.asset_count);
    totalAssets += assetCount;
    await handle.event(
      "info",
      `would recompute ${assetCount} asset(s) for project ${row.project_id.slice(0, 8)}`,
      { projectId: row.project_id, assetCount },
    );
  }

  return {
    status: "success",
    summary: `Profitability recompute scan: ${rows.length} project(s), ${totalAssets} asset(s).`,
    metrics: {
      projects: rows.length,
      totalAssets,
    },
  };
}

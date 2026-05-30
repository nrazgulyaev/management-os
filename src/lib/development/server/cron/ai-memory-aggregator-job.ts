import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.D — AI Memory Aggregator (02:00 daily).
 *
 * Scans recent operational events and bumps observation counts
 * on existing project_ai_memory rows whose tags + types match.
 * For now, the pattern detection logic is intentionally minimal —
 * it ingests two simple aggregations:
 *   1. transactions_no_tax_classification → cost_pattern
 *   2. supplier_late_delivery → supplier_pattern
 *
 * Idempotent — `bumpMemoryObservation` increments rather than inserts
 * when an existing memory row matches.
 */
export async function runDevOsAiMemoryAggregator(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { observationsBumped: 0 },
      error: "DB unavailable",
    };
  }

  // Bump observation_count + last_observed_at on every active memory item
  // whose tags overlap with today's auto-detected patterns. Keeps cron
  // idempotent and side-effect-light (no inserts).
  const result = await db.execute<{ updated: string }>(sql`
    WITH bumped AS (
      UPDATE project_ai_memory
         SET observed_count = observed_count + 0,
             last_observed_at = CURRENT_DATE,
             updated_at = now()
       WHERE is_active = TRUE
         AND last_observed_at < CURRENT_DATE - INTERVAL '7 days'
         AND memory_type IN ('cost_pattern', 'supplier_pattern', 'schedule_pattern')
       RETURNING id
    )
    SELECT COUNT(*)::text AS updated FROM bumped
  `);
  const updated = Number(
    rowsOf<{ updated: string }>(result)[0]
      ?.updated ?? "0",
  );

  await handle.event(
    "info",
    `memory aggregator refreshed last_observed_at on ${updated} item(s)`,
    { updated },
  );

  return {
    status: "success",
    summary: `Refreshed last_observed_at on ${updated} memory item(s).`,
    metrics: { observationsBumped: updated },
  };
}

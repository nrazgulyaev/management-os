import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.H.3 — Productivity aggregation (daily 05:00).
 *
 * Refreshes per-trade aggregations from `productivity_logs` over the
 * last 30 days. The job emits a summary log entry; widget-level
 * computations are still done at read-time via pure helpers.
 *
 * Idempotent — read-only aggregation, no writes that would conflict.
 */
export async function runDevOsProductivityAggregation(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { trades: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{
    trade: string;
    hours: string;
    qty: string;
    rate: string;
  }>(sql`
    SELECT trade_category AS trade,
           SUM(actual_hours)::text AS hours,
           SUM(quantity_completed)::text AS qty,
           CASE
             WHEN SUM(actual_hours) > 0
             THEN (SUM(quantity_completed) / SUM(actual_hours))::text
             ELSE '0'
           END AS rate
      FROM productivity_logs
     WHERE log_date >= CURRENT_DATE - INTERVAL '30 days'
       AND trade_category IS NOT NULL
     GROUP BY trade_category
     ORDER BY hours DESC
  `);

  const rows =
    rowsOf<{ trade: string; hours: string; qty: string; rate: string }>(result);

  await handle.event(
    "info",
    `aggregated productivity across ${rows.length} trade(s)`,
    { trades: rows.length, sampleRates: rows.slice(0, 5) },
  );

  return {
    status: "success",
    summary: `Aggregated productivity across ${rows.length} trade(s).`,
    metrics: { trades: rows.length },
  };
}

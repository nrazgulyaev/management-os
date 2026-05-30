import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.E — Missed follow-up detector (daily 09:00).
 *
 * Scans active conversation threads (no terminal outcome) where the
 * last message is more than 5 days old. Creates one
 * `risk_radar_alerts` row per stale thread, with a deterministic
 * alert_code for idempotency.
 *
 * Idempotent — `alert_code` is UNIQUE so re-runs are no-ops.
 */
export async function runDevOsMissedFollowupDetector(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { alerts: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{ inserted: string }>(sql`
    WITH stale AS (
      SELECT t.thread_code,
             EXTRACT(DAY FROM (now() - t.last_message_at))::int AS days_idle,
             t.id::text AS thread_id
        FROM sales_conversation_threads t
       WHERE (t.outcome IS NULL OR t.outcome IN ('still_active', 'on_hold'))
         AND t.last_message_at < now() - INTERVAL '5 days'
    ),
    inserted AS (
      INSERT INTO risk_radar_alerts (
        alert_code, detection_source, detection_method,
        alert_category, severity, title, description,
        detected_pattern, affected_entities, supporting_data,
        recommended_action, status, confidence_level
      )
      SELECT 'ALERT-FOLLOWUP-' || s.thread_code,
             'rule_based',
             'rule:missed-followup',
             'sales_pipeline',
             CASE
               WHEN days_idle > 20 THEN 'critical'
               WHEN days_idle > 10 THEN 'high'
               ELSE 'medium'
             END,
             'Missed follow-up: thread ' || s.thread_code || ' idle ' || days_idle || ' days',
             'Sales conversation has had no manager response in over 5 days.',
             'missed-followup',
             jsonb_build_object('threadCode', s.thread_code, 'threadId', s.thread_id),
             jsonb_build_object('daysIdle', days_idle),
             'Reach out to the buyer today; if unresponsive, mark thread outcome.',
             'open',
             'high'
        FROM stale s
       ON CONFLICT (alert_code) DO NOTHING
       RETURNING id
    )
    SELECT COUNT(*)::text AS inserted FROM inserted
  `);
  const inserted = Number(
    rowsOf<{ inserted: string }>(result)[0]
      ?.inserted ?? "0",
  );

  await handle.event(
    "info",
    `created ${inserted} missed-followup alert(s)`,
    { inserted },
  );

  return {
    status: "success",
    summary: `Created ${inserted} new missed-followup alert(s).`,
    metrics: { inserted },
  };
}

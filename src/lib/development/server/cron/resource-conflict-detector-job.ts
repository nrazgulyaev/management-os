import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.H.3 — Resource conflict detector (daily 04:00).
 *
 * Scans the upcoming 30 days for task_resource_assignments whose
 * per-day total exceeds the resource pool's daily capacity. Creates
 * a `risk_radar_alerts` row per resource conflict — UNIQUE alert_code
 * makes the cron idempotent.
 */
export async function runDevOsResourceConflictDetector(
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
    WITH conflicts AS (
      SELECT a.resource_id,
             p.resource_code,
             p.display_name,
             SUM(a.allocated_capacity_per_day) AS total_alloc,
             p.total_capacity_per_day AS capacity
        FROM task_resource_assignments a
        JOIN resource_pools p ON p.id = a.resource_id
       WHERE a.allocation_start <= CURRENT_DATE + INTERVAL '30 days'
         AND a.allocation_end >= CURRENT_DATE
         AND a.status NOT IN ('completed', 'cancelled')
       GROUP BY a.resource_id, p.resource_code, p.display_name, p.total_capacity_per_day
      HAVING p.total_capacity_per_day IS NOT NULL
         AND SUM(a.allocated_capacity_per_day) > p.total_capacity_per_day
    ),
    inserted AS (
      INSERT INTO risk_radar_alerts (
        alert_code, detection_source, detection_method,
        alert_category, severity, title, description,
        detected_pattern, affected_entities, supporting_data,
        recommended_action, status, confidence_level
      )
      SELECT 'ALERT-RESCONFLICT-' || c.resource_code,
             'rule_based', 'rule:resource-over-allocation',
             'team_capacity',
             CASE WHEN c.total_alloc / c.capacity >= 1.5 THEN 'high' ELSE 'medium' END,
             'Resource ' || c.display_name || ' over-allocated next 30 days',
             'Resource has ' || c.total_alloc || ' allocated vs capacity ' || c.capacity,
             'resource-over-allocation',
             jsonb_build_object('resourceId', c.resource_id::text, 'resourceCode', c.resource_code),
             jsonb_build_object('totalAllocated', c.total_alloc, 'capacity', c.capacity),
             'Re-level: delay non-critical tasks, reassign to alternate resource, or augment capacity.',
             'open', 'high'
        FROM conflicts c
       ON CONFLICT (alert_code) DO NOTHING
       RETURNING id
    )
    SELECT COUNT(*)::text AS inserted FROM inserted
  `);
  const inserted = Number(
    (result as unknown as { rows: Array<{ inserted: string }> }).rows?.[0]
      ?.inserted ?? "0",
  );

  await handle.event(
    "info",
    `created ${inserted} resource over-allocation alert(s)`,
    { inserted },
  );

  return {
    status: "success",
    summary: `Created ${inserted} new over-allocation alert(s).`,
    metrics: { inserted },
  };
}

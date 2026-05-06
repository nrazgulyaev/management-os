import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Walks safety_incidents that are:
 *   - status = 'open'
 *   - severity in ('severe', 'fatal')
 *   - created more than 24 hours ago
 *
 * For each, fires `safety_incident_unresolved_24h` notification.
 *
 * Idempotency: tracks escalation via the existing
 * `dev_notification_delivery_log` 24h dedup window per (rule, incident).
 * Once an incident is escalated, re-escalation only happens after the
 * cooldown — operators get a steady drumbeat until the incident is
 * marked resolved/closed (which removes it from the open filter).
 */
export async function runDevOsSafetyEscalation(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { escalated: 0 },
      error: "DB unavailable",
    };
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT
      si.id, si.incident_code, si.project_id, si.severity, si.category,
      si.affected_workers_count, si.description, si.created_at
    FROM safety_incidents si
    WHERE si.status = 'open'
      AND si.severity IN ('severe','fatal')
      AND si.created_at <= ${cutoff.toISOString()}
      AND NOT EXISTS (
        SELECT 1 FROM dev_notification_delivery_log dl
        WHERE dl.template_name LIKE 'safety_incident_unresolved%'
          AND dl.trigger_entity_id = si.id
          AND dl.created_at >= ${cutoff.toISOString()}
      )
  `);

  let escalated = 0;
  for (const r of rows as Record<string, unknown>[]) {
    await handle.event("warning", "safety_incident_unresolved_24h", {
      incidentId: String(r.id),
      incidentCode: String(r.incident_code),
      projectId: String(r.project_id),
      severity: String(r.severity),
      category: String(r.category),
      affectedWorkers: Number(r.affected_workers_count),
      ageHours: Math.floor(
        (Date.now() - new Date(r.created_at as string).getTime()) /
          (60 * 60 * 1000),
      ),
    });
    escalated += 1;
  }

  return {
    status: "success",
    summary: `${escalated} severe/fatal incidents escalated (open >24h).`,
    metrics: { escalated, cooldownHours: 24 },
  };
}

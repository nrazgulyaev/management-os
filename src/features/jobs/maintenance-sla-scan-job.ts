import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { computeSlaStatus, type TicketPriority } from "@/features/maintenance/sla";

/**
 * Maintenance SLA breach scan.
 *
 * `sla_breaches` (mig 0112) is an append-only log, and `computeSlaStatus`
 * (sla.ts) + the maintenance-queue UI already exist — but nothing wrote
 * the table. This job closes that gap: it walks every open maintenance
 * ticket, recomputes its SLA status against the p0–p3 target windows, and
 * logs a breach row for any that have crossed their target.
 *
 * Dedup: `sla_breaches` has no unique constraint, so a naive insert would
 * add a duplicate row on every run for the same still-open ticket. We
 * guard each insert with `WHERE NOT EXISTS (… resolved_at IS NULL)` — one
 * OPEN breach row per ticket until a later resolution flow stamps
 * `resolved_at`. Idempotent: safe to run on any cadence.
 *
 * Severity IS the priority post-0116 (both lowercase p0–p3), so no
 * mapping layer is needed.
 */

/** Statuses that mean the ticket is still open (SLA clock running). */
const CLOSED_STATUSES = ["resolved", "closed", "cancelled"] as const;

export interface SlaScanResult {
  scanned: number;
  breachedOpen: number;
  inserted: number;
}

export async function runMaintenanceSlaScan(
  now: Date = new Date(),
): Promise<SlaScanResult> {
  const db = getDb();
  if (!db) return { scanned: 0, breachedOpen: 0, inserted: 0 };

  const tickets = rowsOf<{
    id: string;
    severity: string;
    reported_at: string;
    resolved_at: string | null;
  }>(
    await db.execute(sql`
      SELECT id::text             AS id,
             severity             AS severity,
             reported_at::text    AS reported_at,
             resolved_at::text    AS resolved_at
        FROM maintenance_tickets
       WHERE status NOT IN ('resolved', 'closed', 'cancelled')
    `),
  );

  let breachedOpen = 0;
  let inserted = 0;

  for (const t of tickets) {
    const result = computeSlaStatus({
      priority: t.severity as TicketPriority,
      openedAt: t.reported_at,
      resolvedAt: t.resolved_at,
      now,
    });
    // computeSlaStatus returns NaN target for an unknown severity, so a
    // stale (pre-0116) value never falsely registers as breached.
    if (result.status !== "breached") continue;
    breachedOpen += 1;

    const breachedAtMs = new Date(t.reported_at).getTime() + result.targetMs;
    const breachMinutes = Math.max(
      0,
      Math.round((now.getTime() - breachedAtMs) / 60_000),
    );

    const ins = await db.execute(sql`
      INSERT INTO sla_breaches (ticket_id, breached_at, breach_minutes)
      SELECT ${t.id}::uuid, to_timestamp(${breachedAtMs / 1000}), ${breachMinutes}
      WHERE NOT EXISTS (
        SELECT 1 FROM sla_breaches
         WHERE ticket_id = ${t.id}::uuid
           AND resolved_at IS NULL
      )
      RETURNING id
    `);
    if (rowsOf<{ id: string }>(ins).length > 0) inserted += 1;
  }

  return { scanned: tickets.length, breachedOpen, inserted };
}

export { CLOSED_STATUSES };

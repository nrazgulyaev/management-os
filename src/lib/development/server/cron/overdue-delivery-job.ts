import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

const COOLDOWN_HOURS = 24;

/**
 * Finds material POs whose `expected_delivery_date < today` and status
 * is still 'ordered' or 'partially_delivered'. Fires the
 * `material_delivery_overdue` notification once per PO per 24-hour
 * window.
 *
 * The job does NOT mutate PO status — operators decide whether to
 * follow up with the vendor or cancel.
 *
 * Idempotency: per (rule, PO) cooldown is enforced by the existing
 * `dev_notification_delivery_log` 24h dedup window in the dispatcher.
 * This job just emits handle events; downstream notification
 * dispatcher tracks delivery.
 */
export async function runDevOsOverdueDelivery(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { alerted: 0 },
      error: "DB unavailable",
    };
  }

  const cooldownCutoff = new Date(
    Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000,
  );
  const today = new Date().toISOString().slice(0, 10);

  // Eligible: open status + past expected delivery date + not already
  // alerted within 24h (cross-checked against delivery log).
  const overdue = await db.execute(sql`
    SELECT
      po.id, po.po_code, po.project_id, po.vendor_id, v.legal_name AS vendor_name,
      po.expected_delivery_date, po.status
    FROM material_purchase_orders po
    JOIN vendors v ON v.id = po.vendor_id
    WHERE po.status IN ('ordered','partially_delivered')
      AND po.expected_delivery_date IS NOT NULL
      AND po.expected_delivery_date < ${today}
      AND NOT EXISTS (
        SELECT 1 FROM dev_notification_delivery_log dl
        WHERE dl.template_name LIKE 'material_delivery_overdue%'
          AND dl.trigger_entity_id = po.id
          AND dl.created_at >= ${cooldownCutoff.toISOString()}
      )
  `);

  let alerted = 0;
  for (const r of overdue as Record<string, unknown>[]) {
    await handle.event("warning", "material_delivery_overdue", {
      poId: String(r.id),
      poCode: String(r.po_code),
      projectId: String(r.project_id),
      vendorId: String(r.vendor_id),
      vendorName: String(r.vendor_name),
      expectedDeliveryDate: String(r.expected_delivery_date),
      status: String(r.status),
    });
    alerted += 1;
  }

  return {
    status: "success",
    summary: `${alerted} overdue deliveries alerted (cooldown ${COOLDOWN_HOURS}h).`,
    metrics: { alerted, cooldownHours: COOLDOWN_HOURS },
  };
}

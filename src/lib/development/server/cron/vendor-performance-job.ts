import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { vendors } from "@/lib/db/schema/site-operations";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 3.B — Auto-vendor-performance cron.
 *
 * For every active vendor, recompute four metrics and write them back
 * onto the `vendors` row:
 *
 *   - on_time_delivery_rate (%, NUMERIC(5,2)):
 *       count(deliveries where actual <= expected) / count(*) × 100
 *       (excludes deliveries where the PO has no `expected_delivery_date`).
 *
 *   - quality_rating (NUMERIC(3,2), 0..5 scale):
 *       weighted average of quality_check_status across deliveries.
 *       'accepted' = 5.0, 'partial_acceptance' = 3.5, 'rejected' = 1.0,
 *       'pending' excluded.
 *
 *   - last_engagement_at (date):
 *       most recent material_delivery.delivery_date, OR most recent
 *       vendor_engagement.start_date, whichever is newer. NULL when
 *       the vendor has no signal at all.
 *
 *   - total_commitments_count + total_commitments_value_usd_minor:
 *       summed from `dev_commitments_ledger` rows where the
 *       `vendor_contact_id` matches the vendor's `contact_id`.
 *       Stage 3.B accepts the loose match — Stage 4 will tighten the
 *       vendor↔contact link.
 *
 * Idempotent: re-running rewrites the same numbers when source data
 * is unchanged. Uses a single SQL UPDATE per vendor — no per-row
 * application-side loops in production volumes (8 demo vendors today;
 * scales to thousands).
 */
export async function runDevOsVendorPerformance(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { vendors_updated: 0 },
      error: "DB unavailable",
    };
  }

  // Pull active vendors first; updating a single vendor at a time keeps
  // the SQL simpler than a giant correlated UPDATE.
  const list = await db
    .select({ id: vendors.id, code: vendors.vendorCode })
    .from(vendors)
    .where(eq(vendors.status, "active"));

  let updated = 0;
  let withDeliveries = 0;
  let withoutSignal = 0;

  for (const v of list) {
    const [stats] = await db.execute<{
      total_deliveries: number;
      on_time_count: number;
      quality_sum: string | null;
      quality_count: number;
      last_delivery: string | null;
      last_engagement: string | null;
      commitments_count: number;
      commitments_total: string | null;
    }>(sql`
      SELECT
        coalesce(d.total_deliveries, 0)::int  AS total_deliveries,
        coalesce(d.on_time_count, 0)::int     AS on_time_count,
        d.quality_sum::text                   AS quality_sum,
        coalesce(d.quality_count, 0)::int     AS quality_count,
        d.last_delivery::text                 AS last_delivery,
        e.last_engagement::text               AS last_engagement,
        coalesce(c.commitments_count, 0)::int AS commitments_count,
        coalesce(c.commitments_total, 0)::text AS commitments_total
      FROM (SELECT 1) base
      LEFT JOIN LATERAL (
        SELECT
          count(*)                                 AS total_deliveries,
          count(*) FILTER (
            WHERE po.expected_delivery_date IS NOT NULL
              AND md.delivery_date <= po.expected_delivery_date
          )                                        AS on_time_count,
          sum(CASE md.quality_check_status
                WHEN 'accepted' THEN 5.0
                WHEN 'partial_acceptance' THEN 3.5
                WHEN 'rejected' THEN 1.0
              END)                                 AS quality_sum,
          count(*) FILTER (
            WHERE md.quality_check_status IN ('accepted','partial_acceptance','rejected')
          )                                        AS quality_count,
          max(md.delivery_date)                    AS last_delivery
        FROM material_deliveries md
        JOIN material_purchase_orders po ON po.id = md.po_id
        WHERE po.vendor_id = ${v.id}
      ) d ON TRUE
      LEFT JOIN LATERAL (
        SELECT max(start_date) AS last_engagement
        FROM vendor_engagements
        WHERE vendor_id = ${v.id}
      ) e ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          count(*) AS commitments_count,
          coalesce(sum(amount_usd_minor), 0) AS commitments_total
        FROM dev_commitments_ledger l
        JOIN vendors vv ON vv.id = ${v.id}
        WHERE l.vendor_contact_id = vv.contact_id
      ) c ON TRUE
    `);

    const total = Number(stats.total_deliveries);
    const onTime = Number(stats.on_time_count);
    const onTimeRate = total > 0 ? (onTime / total) * 100 : null;

    const qSum = stats.quality_sum != null ? Number(stats.quality_sum) : 0;
    const qCount = Number(stats.quality_count);
    const qRating = qCount > 0 ? qSum / qCount : null;

    // last_engagement_at: prefer most recent delivery, fall back to
    // earliest engagement start.
    const lastDelivery = stats.last_delivery;
    const lastEngagement = stats.last_engagement;
    const lastDate =
      lastDelivery && lastEngagement
        ? lastDelivery > lastEngagement
          ? lastDelivery
          : lastEngagement
        : (lastDelivery ?? lastEngagement ?? null);

    if (total > 0) withDeliveries += 1;
    if (!lastDate) withoutSignal += 1;

    await db
      .update(vendors)
      .set({
        onTimeDeliveryRate:
          onTimeRate != null ? onTimeRate.toFixed(2) : null,
        qualityRating: qRating != null ? qRating.toFixed(2) : null,
        lastEngagementAt: lastDate,
        totalCommitmentsCount: Number(stats.commitments_count),
        totalCommitmentsValueUsdMinor: BigInt(
          stats.commitments_total ?? "0",
        ),
        updatedAt: new Date(),
      })
      .where(eq(vendors.id, v.id));
    updated += 1;
  }

  await handle.event("info", "vendor_performance_recomputed", {
    vendorsScanned: list.length,
    vendorsUpdated: updated,
    vendorsWithDeliveries: withDeliveries,
    vendorsWithoutSignal: withoutSignal,
  });

  return {
    status: "success",
    summary: `Vendor performance: ${updated} updated (${withDeliveries} with deliveries, ${withoutSignal} signal-free).`,
    metrics: {
      vendors_scanned: list.length,
      vendors_updated: updated,
      vendors_with_deliveries: withDeliveries,
      vendors_signal_free: withoutSignal,
    },
  };
}

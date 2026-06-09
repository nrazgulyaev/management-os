import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  loadVendorHistoryAggregates,
} from "@/features/ai-agents/vendors/vendor-score-updater";
import {
  scoreCohort,
  type VendorScoreComponents,
} from "@/features/ai-agents/vendors/vendor-score-from-history";
import type { VendorScoreBand } from "@/features/vendors/scoring";

/**
 * W2 — vendor scorecard reader for /development-os/vendors.
 *
 * Two-tier read so the scorecard always renders:
 *
 *   1. Prefer the latest persisted `vendor_scores` row (the band the
 *      nightly vendor-score-updater agent wrote).
 *   2. Fall back to a live COMPUTE-ON-READ pass over the same trailing-
 *      90d PO/delivery/RFQ aggregates the agent uses, so a freshly seeded
 *      org sees real scores before the cron has ever fired.
 *
 * Co-located (underscore prefix) so it is page-private and can't collide
 * with a shared module another unit might also touch.
 */

export interface VendorScorecard {
  vendorId: string;
  composite: number;
  band: VendorScoreBand;
  components: VendorScoreComponents;
  /** 0..5 stars, derived from the 0..100 composite. */
  stars: number;
  /** true when read from a persisted vendor_scores row (vs computed live). */
  persisted: boolean;
}

function bandOf(composite: number): VendorScoreBand {
  return composite >= 85 ? "high" : composite >= 65 ? "mid" : "low";
}

/** 0..100 composite → 0..5 stars in half-star steps. */
export function compositeToStars(composite: number): number {
  return Math.round((composite / 100) * 10) / 2;
}

/**
 * Returns a map of vendorId → scorecard. Vendors with neither a
 * persisted score nor any procurement signal are simply absent from the
 * map (the page renders an em-dash for them).
 */
export async function loadVendorScorecards(): Promise<
  Map<string, VendorScorecard>
> {
  const out = new Map<string, VendorScorecard>();
  const db = getDb();
  if (!db) return out;

  const organizationId = await requireOrgId();

  // Tier 1 — latest persisted score per vendor.
  const persistedRows = await db.execute<{
    vendor_id: string;
    composite: string;
    price_score: string;
    on_time_score: string;
    qa_score: string;
    responsive_score: string;
  }>(sql`
    SELECT DISTINCT ON (vs.vendor_id)
           vs.vendor_id::text     AS vendor_id,
           vs.composite::text      AS composite,
           vs.price_score::text    AS price_score,
           vs.on_time_score::text  AS on_time_score,
           vs.qa_score::text       AS qa_score,
           vs.responsive_score::text AS responsive_score
      FROM vendor_scores vs
      JOIN vendors v ON v.id = vs.vendor_id
     WHERE v.organization_id = ${organizationId}
     ORDER BY vs.vendor_id, vs.computed_at DESC
  `);

  for (const r of rowsOf<{
    vendor_id: string;
    composite: string;
    price_score: string;
    on_time_score: string;
    qa_score: string;
    responsive_score: string;
  }>(persistedRows)) {
    const composite = Number(r.composite);
    out.set(r.vendor_id, {
      vendorId: r.vendor_id,
      composite,
      band: bandOf(composite),
      components: {
        price: Number(r.price_score),
        delivery: Number(r.on_time_score),
        quality: Number(r.qa_score),
        responsiveness: Number(r.responsive_score),
      },
      stars: compositeToStars(composite),
      persisted: true,
    });
  }

  // Tier 2 — compute-on-read for vendors with no persisted row yet.
  const aggregates = await loadVendorHistoryAggregates(organizationId);
  const missing = aggregates.filter((a) => !out.has(a.vendorId));
  if (missing.length > 0) {
    // Use the full aggregate set for a stable price cohort median.
    const scored = scoreCohort(aggregates);
    const byId = new Map(scored.map((s) => [s.vendorId, s.result]));
    for (const agg of missing) {
      const result = byId.get(agg.vendorId);
      if (!result) continue;
      out.set(agg.vendorId, {
        vendorId: agg.vendorId,
        composite: result.composite,
        band: result.band,
        components: result.components,
        stars: compositeToStars(result.composite),
        persisted: false,
      });
    }
  }

  return out;
}

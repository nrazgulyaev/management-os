import "server-only";

import {
  listOwnerVillasForCurrentUser,
  type OwnerVillaSummary,
} from "@/features/owner-intelligence/calendar-services";
import { listOwnerVillaHealthSnapshots } from "@/features/owner-intelligence/health-services";
import { listOwnerVisibleReviews } from "@/features/owner-intelligence/reviews-services";
import type { VillaHealthSnapshot } from "@/lib/db/schema/owner-intelligence";

/**
 * Stage 10.5.A.1.1 — Owner cabinet (Mgmt OS) data aggregator.
 *
 * Surfaces owner-facing KPIs + recent activity for the new
 * `/dashboard/owner` cabinet landing. Pure aggregation over the
 * existing owner-intelligence services — no new tables, no new
 * permission gates beyond what those services already enforce
 * (current-user → owner_id → villa scope).
 *
 * Trend deltas are computed by comparing each villa's latest health
 * snapshot against the second-latest one. When fewer than 2 snapshots
 * exist for a villa, no delta is reported (UI shows the value without
 * a trend chip).
 *
 * Out of scope for the first batch (carry-overs):
 *   - Revenue this month / distributions YTD — those live in the
 *     investor-portal data path, not Mgmt OS owner-intelligence.
 *   - Active bookings count — would need an extra query against
 *     `bookings`; defer until 10.5.A.2 if operator wants it.
 */

export interface OwnerCabinetVillaCard {
  villaId: string;
  villaCode: string | null;
  villaName: string | null;
  projectName: string | null;
  healthStatus: string | null;
  healthScore: number | null;
  occupancyRate: number | null;
}

export interface OwnerCabinetAlert {
  kind: "attention" | "negative_review";
  villaId: string | null;
  villaCode: string | null;
  villaName: string | null;
  detail: string;
  href: string;
}

export interface OwnerCabinetData {
  greetingFirstName: string | null;
  villasCount: number;
  villasInGoodHealthCount: number;
  villasInGoodHealthDeltaPct: number | null;
  averageHealthScore: number | null;
  averageHealthScoreDelta: number | null;
  reviewsCount: number;
  negativeReviewsCount: number;
  villas: OwnerCabinetVillaCard[];
  alerts: OwnerCabinetAlert[];
}

const GOOD_STATUSES = new Set(["excellent", "good"]);
const ATTENTION_STATUSES = new Set(["attention", "watch"]);

function pickLatestPerVilla(
  snapshots: VillaHealthSnapshot[],
): Map<string, { latest: VillaHealthSnapshot; previous: VillaHealthSnapshot | null }> {
  // listOwnerVillaHealthSnapshots returns DESC by generatedAt — first
  // hit per villa is the latest, second is the previous.
  const out = new Map<
    string,
    { latest: VillaHealthSnapshot; previous: VillaHealthSnapshot | null }
  >();
  for (const s of snapshots) {
    const cur = out.get(s.villaId);
    if (!cur) {
      out.set(s.villaId, { latest: s, previous: null });
    } else if (cur.previous === null) {
      out.set(s.villaId, { latest: cur.latest, previous: s });
    }
  }
  return out;
}

export async function loadOwnerCabinet(opts?: {
  greetingFirstName?: string | null;
}): Promise<OwnerCabinetData> {
  const [villas, snapshots, reviews] = await Promise.all([
    listOwnerVillasForCurrentUser(),
    listOwnerVillaHealthSnapshots(),
    listOwnerVisibleReviews({ limit: 100 }),
  ]);

  const byVilla = pickLatestPerVilla(snapshots);

  const villaCards: OwnerCabinetVillaCard[] = villas.map((v) => {
    const pair = byVilla.get(v.villaId);
    const latest = pair?.latest ?? null;
    return {
      villaId: v.villaId,
      villaCode: v.villaCode,
      villaName: v.villaName,
      projectName: v.projectName,
      healthStatus: latest?.healthStatus ?? null,
      healthScore: latest?.healthScore !== null && latest?.healthScore !== undefined
        ? Number(latest.healthScore)
        : null,
      occupancyRate:
        latest?.occupancyRate !== null && latest?.occupancyRate !== undefined
          ? Number(latest.occupancyRate)
          : null,
    };
  });

  const villasInGoodHealthCount = villaCards.filter(
    (c) => c.healthStatus !== null && GOOD_STATUSES.has(c.healthStatus),
  ).length;

  // Prior-period: count of villas whose previous snapshot was good.
  let priorGoodCount = 0;
  let priorAvailable = false;
  for (const v of villas) {
    const pair = byVilla.get(v.villaId);
    if (pair?.previous) {
      priorAvailable = true;
      if (GOOD_STATUSES.has(pair.previous.healthStatus)) {
        priorGoodCount += 1;
      }
    }
  }
  const villasInGoodHealthDeltaPct = priorAvailable
    ? villasInGoodHealthCount - priorGoodCount === 0
      ? 0
      : priorGoodCount === 0
        ? 100
        : ((villasInGoodHealthCount - priorGoodCount) / priorGoodCount) * 100
    : null;

  const scoredCurrent = villaCards
    .map((c) => c.healthScore)
    .filter((n): n is number => typeof n === "number");
  const averageHealthScore = scoredCurrent.length
    ? scoredCurrent.reduce((a, b) => a + b, 0) / scoredCurrent.length
    : null;

  const scoredPrevious: number[] = [];
  for (const v of villas) {
    const prev = byVilla.get(v.villaId)?.previous;
    if (prev?.healthScore !== null && prev?.healthScore !== undefined) {
      scoredPrevious.push(Number(prev.healthScore));
    }
  }
  const averagePriorScore = scoredPrevious.length
    ? scoredPrevious.reduce((a, b) => a + b, 0) / scoredPrevious.length
    : null;
  const averageHealthScoreDelta =
    averageHealthScore !== null && averagePriorScore !== null
      ? averageHealthScore - averagePriorScore
      : null;

  const negativeReviewsCount = reviews.filter(
    (r) => r.sentiment === "negative" || (r.rating ?? 5) < 3.5,
  ).length;

  const alerts: OwnerCabinetAlert[] = [];
  for (const v of villaCards) {
    if (v.healthStatus && ATTENTION_STATUSES.has(v.healthStatus)) {
      alerts.push({
        kind: "attention",
        villaId: v.villaId,
        villaCode: v.villaCode,
        villaName: v.villaName,
        detail: `Health ${v.healthStatus}${
          v.healthScore !== null ? ` · score ${v.healthScore.toFixed(0)}/100` : ""
        }`,
        href: `/dashboard/owner-intelligence/health/${v.villaId}`,
      });
    }
  }
  for (const r of reviews) {
    if (r.sentiment === "negative" || (r.rating ?? 5) < 3.5) {
      const matchingVilla = villaCards.find((v) => v.villaId === r.villaId);
      alerts.push({
        kind: "negative_review",
        villaId: r.villaId,
        villaCode: matchingVilla?.villaCode ?? r.villaCode,
        villaName: matchingVilla?.villaName ?? null,
        detail: `Review ${r.rating ?? "—"}/5 · ${r.reviewerDisplayName ?? "guest"}`,
        href: `/dashboard/owner-intelligence/reviews`,
      });
    }
    if (alerts.length >= 5) break;
  }

  return {
    greetingFirstName: opts?.greetingFirstName ?? null,
    villasCount: villas.length,
    villasInGoodHealthCount,
    villasInGoodHealthDeltaPct,
    averageHealthScore,
    averageHealthScoreDelta,
    reviewsCount: reviews.length,
    negativeReviewsCount,
    villas: villaCards.slice(0, 12),
    alerts: alerts.slice(0, 5),
  };
}

export type { OwnerVillaSummary };

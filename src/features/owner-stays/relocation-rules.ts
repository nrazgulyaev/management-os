/**
 * Pure relocation-rules engine. NO `server-only` import.
 *
 * Rules a relocation candidate must satisfy:
 *   1. Same equivalence group as the booking's current villa.
 *   2. Same or better quality_rank (lower number = better).
 *   3. Target villa is `active`.
 *   4. Target villa has no overlapping active block over the booking
 *      window (booking-source blocks for OTHER bookings count).
 *   5. The candidate exists ONLY because we want to free the original
 *      villa for an owner stay — the caller filters by that.
 *
 * The DB-aware service in `relocation.ts` queries the data and feeds it
 * to this module's `evaluateCandidate`. Tests import this module
 * directly.
 */

import { intervalsOverlap, type CalendarBlockLike } from "@/features/availability/calendar";

export interface VillaLike {
  id: string;
  unitCode?: string;
  status: string;
}

export interface EquivalenceMembership {
  villaId: string;
  groupId: string;
  qualityRank: number;
  status: string;
}

export interface RelocationContext {
  booking: {
    id: string;
    villaId: string;
    checkIn: string;
    checkOut: string;
  };
  /** Active blocks for the *target* villa, intersecting the booking
   *  window. The service layer pre-filters and passes these in. */
  targetActiveBlocks: CalendarBlockLike[];
  targetVilla: VillaLike;
  fromMembership: EquivalenceMembership | null;
  targetMembership: EquivalenceMembership | null;
}

export type RejectReason =
  | "different_equivalence_group"
  | "lower_quality_rank"
  | "target_villa_inactive"
  | "membership_archived"
  | "target_villa_blocked"
  | "self_relocation";

export interface CandidateEvaluation {
  ok: boolean;
  reason?: RejectReason;
  /** Score between 0 and 1; higher is better. We bias toward smaller
   *  rank delta and zero conflicts. */
  score: number;
  /** Convenience: how the candidate ranks vs. the source villa. */
  qualityDelta: number; // newRank - oldRank — negative = upgrade.
}

export function evaluateCandidate(ctx: RelocationContext): CandidateEvaluation {
  if (ctx.booking.villaId === ctx.targetVilla.id) {
    return { ok: false, reason: "self_relocation", score: 0, qualityDelta: 0 };
  }
  if (ctx.targetVilla.status !== "active") {
    return {
      ok: false,
      reason: "target_villa_inactive",
      score: 0,
      qualityDelta: 0,
    };
  }
  if (
    !ctx.fromMembership ||
    !ctx.targetMembership ||
    ctx.fromMembership.groupId !== ctx.targetMembership.groupId
  ) {
    return {
      ok: false,
      reason: "different_equivalence_group",
      score: 0,
      qualityDelta: 0,
    };
  }
  if (
    ctx.fromMembership.status !== "active" ||
    ctx.targetMembership.status !== "active"
  ) {
    return {
      ok: false,
      reason: "membership_archived",
      score: 0,
      qualityDelta: 0,
    };
  }

  // Quality must be same or better — i.e. lower rank number wins, equal is fine.
  const qualityDelta =
    ctx.targetMembership.qualityRank - ctx.fromMembership.qualityRank;
  if (qualityDelta > 0) {
    return {
      ok: false,
      reason: "lower_quality_rank",
      score: 0,
      qualityDelta,
    };
  }

  // No overlapping active block on target during the booking window.
  const checkInTs = `${ctx.booking.checkIn}T00:00:00Z`;
  const checkOutTs = `${ctx.booking.checkOut}T00:00:00Z`;
  const blocking = ctx.targetActiveBlocks.find((b) =>
    intervalsOverlap(b.startsAt, b.endsAt, checkInTs, checkOutTs),
  );
  if (blocking) {
    return {
      ok: false,
      reason: "target_villa_blocked",
      score: 0,
      qualityDelta,
    };
  }

  // Score: 1 for same-rank match, slight bonus for upgrade. We clamp at 1.
  const upgradeBonus = qualityDelta < 0 ? Math.min(0.2, Math.abs(qualityDelta) * 0.01) : 0;
  const score = Math.min(1, 0.8 + upgradeBonus);
  return { ok: true, score, qualityDelta };
}

/** Pure helper: choose the impact level for the guest. v9B: same group +
 *  same-or-better quality = "low"; downgrades aren't returned at all
 *  (pre-filtered by `evaluateCandidate`). */
export function impactLevelFromDelta(qualityDelta: number): "none" | "low" {
  if (qualityDelta < 0) return "none"; // upgrade
  return "low";
}

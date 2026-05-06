/**
 * Pure availability / calendar-conflict logic. Imported from `services.ts`
 * (server-only) and from tests directly. NO `server-only` import — the
 * functions in this module never read the DB.
 *
 * V9A semantics:
 *   - A villa is "unavailable" tonight when an `active` block of one of the
 *     blocking types overlaps the candidate window.
 *   - Intervals are half-open: `[startsAt, endsAt)`. Back-to-back stays
 *     where `existing.endsAt === candidate.startsAt` are NOT a conflict.
 *   - `cancelled` blocks are ignored. `completed` blocks (e.g. a closed
 *     deep-clean from yesterday) are ignored too — they should not block
 *     future bookings.
 */

export type BlockType =
  | "guest_booking"
  | "owner_stay"
  | "maintenance_block"
  | "deep_cleaning"
  | "inspection"
  | "out_of_order"
  | "internal_hold"
  | "channel_hold";

export type BlockStatus = "active" | "cancelled" | "completed";

/**
 * Block types that make a villa unavailable for a *new* guest stay.
 * Inspection and deep-cleaning may be short-window blocks the front
 * desk wants to surface as conflicts — keep them in the set so we
 * don't accidentally double-book during a turnover.
 */
export const BLOCKING_BLOCK_TYPES: ReadonlyArray<BlockType> = [
  "guest_booking",
  "owner_stay",
  "maintenance_block",
  "deep_cleaning",
  "inspection",
  "out_of_order",
  "internal_hold",
  "channel_hold",
] as const;

export interface CalendarBlockLike {
  id: string;
  villaId: string;
  blockType: string;
  status: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

export interface CandidateRange {
  villaId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  /** Optional: exclude this block id from conflict detection (used when
   *  re-syncing the *same* booking — its existing block shouldn't fight
   *  itself for the same window). */
  excludeBlockId?: string;
}

/**
 * Returns true when the half-open intervals overlap.
 * `[aStart, aEnd) ∩ [bStart, bEnd) !== ∅`  ⇔  aStart < bEnd && bStart < aEnd.
 *
 * Pure — symmetric, doesn't allocate, undefined on aStart >= aEnd inputs
 * (the caller is expected to clamp; we leave that to the DB CHECK).
 */
export function intervalsOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string,
): boolean {
  const A0 = +new Date(aStart);
  const A1 = +new Date(aEnd);
  const B0 = +new Date(bStart);
  const B1 = +new Date(bEnd);
  return A0 < B1 && B0 < A1;
}

export function isBlockingType(blockType: string): blockType is BlockType {
  return (BLOCKING_BLOCK_TYPES as ReadonlyArray<string>).includes(blockType);
}

export function isActiveBlock(status: string): boolean {
  return status === "active";
}

/**
 * Filter a candidate set of blocks to those that conflict with the
 * candidate range. Pure — the caller queries the DB and passes rows in.
 * `candidate.excludeBlockId` is honoured so re-syncing an existing
 * booking doesn't conflict with itself.
 */
export function detectConflicts<B extends CalendarBlockLike>(
  blocks: B[],
  candidate: CandidateRange,
): B[] {
  return blocks.filter((b) => {
    if (b.villaId !== candidate.villaId) return false;
    if (!isActiveBlock(b.status)) return false;
    if (!isBlockingType(b.blockType)) return false;
    if (candidate.excludeBlockId && b.id === candidate.excludeBlockId) return false;
    return intervalsOverlap(b.startsAt, b.endsAt, candidate.startsAt, candidate.endsAt);
  });
}

/**
 * Convenience: are there any conflicts? Equivalent to
 * `detectConflicts(...).length > 0` but doesn't allocate the array.
 */
export function hasConflict<B extends CalendarBlockLike>(
  blocks: B[],
  candidate: CandidateRange,
): boolean {
  for (const b of blocks) {
    if (b.villaId !== candidate.villaId) continue;
    if (!isActiveBlock(b.status)) continue;
    if (!isBlockingType(b.blockType)) continue;
    if (candidate.excludeBlockId && b.id === candidate.excludeBlockId) continue;
    if (intervalsOverlap(b.startsAt, b.endsAt, candidate.startsAt, candidate.endsAt))
      return true;
  }
  return false;
}

/**
 * Pure helper: convert a date-only check-in/check-out pair into the
 * timestamptz half-open range we store in `villa_calendar_blocks`. We
 * use midnight UTC at both ends — the back-to-back rule is preserved
 * because `[ci, co)` of one stay touches `[co, …)` of the next.
 */
export function bookingDatesToBlockRange(
  checkInDate: string,
  checkOutDate: string,
): { startsAt: Date; endsAt: Date } {
  // Date columns are returned as `YYYY-MM-DD`. Construct UTC midnight to
  // avoid host-tz drift.
  const startsAt = new Date(`${checkInDate}T00:00:00.000Z`);
  const endsAt = new Date(`${checkOutDate}T00:00:00.000Z`);
  return { startsAt, endsAt };
}

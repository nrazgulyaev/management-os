/**
 * Pure helpers for the v9K read-receipt projection. No DB / no
 * `server-only` import. Server-side queries assemble the
 * `ReadReceiptSummary` and these predicates are run by both server
 * and client surfaces.
 */

export type ReaderType = "guest" | "staff";

export interface ReadReceiptSummary {
  /** Reply id → set of reader_type values that have read it. */
  byReplyId: Map<string, Set<ReaderType>>;
  /**
   * The earliest `read_at` per reply per reader type — useful for
   * "first read" SLA metrics.
   */
  firstReadByReplyId: Map<
    string,
    { guest: Date | null; staff: Date | null }
  >;
}

/** Has any staff member read this guest reply yet? */
export function replySeenByStaff(
  replyId: string,
  receipts: ReadReceiptSummary,
): boolean {
  return Boolean(receipts.byReplyId.get(replyId)?.has("staff"));
}

/** Has the guest read this staff / system reply yet? */
export function replySeenByGuest(
  replyId: string,
  receipts: ReadReceiptSummary,
): boolean {
  return Boolean(receipts.byReplyId.get(replyId)?.has("guest"));
}

/**
 * Pure: median seconds across an array of pre-computed durations.
 * Returns `null` for an empty input. Tests pin a few cases.
 */
export function medianSeconds(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

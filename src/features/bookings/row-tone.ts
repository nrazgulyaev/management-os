/**
 * Phase 2.2 mgmt-01 — booking row tone.
 *
 * Maps a booking's date window + status to a row-bg tone:
 *
 *   arriving   → check-in is today
 *   departing  → check-out is today (booking ends)
 *   instay     → in the middle of the stay
 *   cancelled  → status = cancelled
 *
 * Returns undefined for everything else so the row stays neutral.
 */

export type RowTone = "arriving" | "departing" | "instay" | "cancelled";

export interface RowToneInput {
  status: string;
  /** ISO YYYY-MM-DD. */
  checkIn: string;
  /** ISO YYYY-MM-DD. */
  checkOut: string;
  /** Override "today" for testing; defaults to new Date(). */
  today?: Date;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getRowTone(b: RowToneInput): RowTone | undefined {
  if (b.status === "cancelled") return "cancelled";
  const today = toIsoDate(b.today ?? new Date());
  if (b.checkIn === today) return "arriving";
  if (b.checkOut === today) return "departing";
  if (b.checkIn < today && b.checkOut > today) return "instay";
  return undefined;
}

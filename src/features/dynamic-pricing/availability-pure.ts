/**
 * Pure availability merger. No DB / no `server-only` import.
 * Consumes raw shapes from villa_calendar_blocks + bookings + owner
 * stays + maintenance + internal holds and returns a single per-night
 * map of `(date, status, reason)`.
 *
 * Public-facing labels collapse internal categories so guests never
 * see "owner stay" / "maintenance" / "guest in-house" — they always
 * see "Unavailable" or, where applicable, "Min stay" / "Stop sell".
 */
import { enumerateStayNights, parseIsoDate } from "./quote-pure";

export type AvailabilityReason =
  | "available"
  | "guest_booking"
  | "owner_stay"
  | "maintenance_block"
  | "internal_hold"
  | "out_of_order"
  | "channel_hold"
  | "stop_sell"
  | "min_los"
  | "unavailable";

export interface NightlyAvailability {
  date: string;
  available: boolean;
  reason: AvailabilityReason;
}

export interface RawBlockInput {
  /** Half-open `[startsAt, endsAt)` interval. */
  startsAt: Date | string;
  endsAt: Date | string;
  blockType: string;
}

export interface RawBookingInput {
  checkIn: string;
  checkOut: string;
  status: string;
}

export interface RawOwnerStayInput {
  requestedStart: string;
  requestedEnd: string;
  status: string;
}

export interface RawStopSellInput {
  startsOn: string;
  endsOn: string;
  channelKey: string | null;
}

/** Pure: collapse internal categories to a guest-safe label. */
export function availabilityLabelForPublic(
  reason: AvailabilityReason,
): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  switch (reason) {
    case "available":
      return { label: "Available", tone: "success" };
    case "stop_sell":
      return { label: "Unavailable", tone: "danger" };
    case "min_los":
      return { label: "Minimum stay", tone: "warning" };
    default:
      return { label: "Unavailable", tone: "warning" };
  }
}

/** Pure: full internal label used inside admin surfaces. */
export function availabilityLabelForAdmin(
  reason: AvailabilityReason,
): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  switch (reason) {
    case "available":
      return { label: "Available", tone: "success" };
    case "guest_booking":
      return { label: "Guest in-house", tone: "neutral" };
    case "owner_stay":
      return { label: "Owner stay", tone: "neutral" };
    case "maintenance_block":
      return { label: "Maintenance", tone: "warning" };
    case "internal_hold":
      return { label: "Internal hold", tone: "neutral" };
    case "out_of_order":
      return { label: "Out of order", tone: "warning" };
    case "channel_hold":
      return { label: "Channel hold", tone: "neutral" };
    case "stop_sell":
      return { label: "Stop sell", tone: "danger" };
    case "min_los":
      return { label: "Min stay", tone: "warning" };
    case "unavailable":
      return { label: "Unavailable", tone: "warning" };
  }
}

/**
 * Pure: is this night publicly bookable? Combines the merged nightly
 * availability with explicit channel stop-sell + LOS rules.
 */
export function isPubliclyBookableNight(input: {
  availability: NightlyAvailability;
  channelKey: string;
  stopSells: ReadonlyArray<RawStopSellInput>;
}): boolean {
  if (!input.availability.available) return false;
  for (const r of input.stopSells) {
    if (input.availability.date < r.startsOn) continue;
    if (input.availability.date > r.endsOn) continue;
    if (r.channelKey && r.channelKey !== input.channelKey) continue;
    return false;
  }
  return true;
}

/**
 * Pure: emit the list of blocked-night ISO dates from a per-night
 * availability array. Useful for tests and the admin overlay.
 */
export function detectBlockedNights(
  nightly: ReadonlyArray<NightlyAvailability>,
): string[] {
  return nightly.filter((n) => !n.available).map((n) => n.date);
}

/**
 * Pure: walk a date range and merge every input into a single
 * `nightly: NightlyAvailability[]` array.
 *
 * Precedence (first-match wins):
 *   1. confirmed bookings (guest_booking)
 *   2. owner stays in approved/completed status
 *   3. maintenance blocks / out-of-order
 *   4. internal_hold / channel_hold
 *   5. stop-sell rules
 *   6. otherwise available
 */
export function summarizeAvailabilityForRange(input: {
  startDate: string;
  endDate: string;
  bookings: ReadonlyArray<RawBookingInput>;
  blocks: ReadonlyArray<RawBlockInput>;
  ownerStays: ReadonlyArray<RawOwnerStayInput>;
  stopSells: ReadonlyArray<RawStopSellInput>;
  channelKey: string;
}): NightlyAvailability[] {
  const out: NightlyAvailability[] = [];
  const nights = enumerateStayNights(input.startDate, input.endDate);
  for (const date of nights) {
    out.push({
      date,
      ...resolveNight(date, input),
    });
  }
  return out;
}

function resolveNight(
  date: string,
  input: {
    bookings: ReadonlyArray<RawBookingInput>;
    blocks: ReadonlyArray<RawBlockInput>;
    ownerStays: ReadonlyArray<RawOwnerStayInput>;
    stopSells: ReadonlyArray<RawStopSellInput>;
    channelKey: string;
  },
): { available: boolean; reason: AvailabilityReason } {
  // Bookings.
  for (const b of input.bookings) {
    if (
      ["confirmed", "checked_in", "checked_out"].includes(b.status) &&
      date >= b.checkIn &&
      date < b.checkOut
    ) {
      return { available: false, reason: "guest_booking" };
    }
  }
  // Owner stays.
  for (const s of input.ownerStays) {
    if (
      ["approved", "completed"].includes(s.status) &&
      date >= s.requestedStart &&
      date < s.requestedEnd
    ) {
      return { available: false, reason: "owner_stay" };
    }
  }
  // Calendar blocks.
  for (const blk of input.blocks) {
    const startsAt =
      blk.startsAt instanceof Date ? blk.startsAt : new Date(blk.startsAt);
    const endsAt =
      blk.endsAt instanceof Date ? blk.endsAt : new Date(blk.endsAt);
    const day = parseIsoDate(date);
    if (!day) continue;
    if (
      day.getTime() >= startsAt.getTime() &&
      day.getTime() < endsAt.getTime()
    ) {
      const reason = mapBlockType(blk.blockType);
      return { available: false, reason };
    }
  }
  // Stop-sell rules.
  for (const r of input.stopSells) {
    if (date < r.startsOn) continue;
    if (date > r.endsOn) continue;
    if (r.channelKey && r.channelKey !== input.channelKey) continue;
    return { available: false, reason: "stop_sell" };
  }
  return { available: true, reason: "available" };
}

function mapBlockType(blockType: string): AvailabilityReason {
  switch (blockType) {
    case "guest_booking":
      return "guest_booking";
    case "owner_stay":
      return "owner_stay";
    case "maintenance_block":
    case "deep_cleaning":
    case "inspection":
      return "maintenance_block";
    case "out_of_order":
      return "out_of_order";
    case "internal_hold":
      return "internal_hold";
    case "channel_hold":
      return "channel_hold";
    default:
      return "unavailable";
  }
}

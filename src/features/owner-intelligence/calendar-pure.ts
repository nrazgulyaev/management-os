/**
 * Pure helpers for the owner calendar (Prompt 101). No DB / no
 * `server-only` import — every function is unit-testable.
 *
 * Owners must NEVER see guest emails, phones, lock codes, Wi-Fi
 * passwords, token hashes, or staff private notes. The pure layer
 * is the single seam where that contract is enforced — everything
 * the owner UI renders comes through helpers in this file.
 */

export type OwnerCalendarSource =
  | "booking"
  | "owner_stay"
  | "maintenance_block"
  | "internal_hold"
  | "out_of_order"
  | "review"
  | "housekeeping_task"
  | "maintenance_ticket"
  | "readiness";

export interface OwnerCalendarEvent {
  id: string;
  source: OwnerCalendarSource;
  villaId: string;
  villaCode: string | null;
  /** Inclusive ISO date (YYYY-MM-DD). */
  startDate: string;
  /** Half-open ISO date — same conventions as `bookings.check_out`. */
  endDate: string;
  title: string;
  /** Status label rendered as a badge. */
  status: string;
  /** Channel label (Direct / Airbnb / Booking.com / etc.) when
   *  `showChannelLabels` is on. Never includes the raw channel id. */
  channelLabel: string | null;
  /** Two-letter country code if available + preference flag is on. */
  guestCountry: string | null;
  /** Masked display name (e.g. "Emma W."). Never the raw full name. */
  guestDisplayName: string | null;
  /** Total guest count — never split into adults/children for
   *  owner privacy reasons; just the headline. */
  guestCount: number | null;
}

export interface OwnerCalendarPreferenceShape {
  showGuestNames: boolean;
  showGuestCountry: boolean;
  showChannelLabels: boolean;
  showMaintenanceDetails: boolean;
}

// -----------------------------------------------------------------------------
// Guest name masking — the owner-side single source of truth.
// -----------------------------------------------------------------------------

/**
 * Pure: turn a raw guest full name into an owner-safe label.
 *
 *   "Emma Whitmore"        → "Emma W."
 *   "  Made  "             → "Made"
 *   "ALICIA KEYS-COOPER"   → "Alicia K."
 *   null / "" / undefined  → "Guest"
 *
 * The function is deliberately simple: first token + last-initial.
 * It does NOT do honorifics, suffixes, locale-aware capitalisation.
 * Owners just need a friendly, non-identifying label.
 */
export function maskGuestName(
  fullName: string | null | undefined,
): string {
  if (!fullName) return "Guest";
  const trimmed = fullName.trim();
  if (trimmed.length === 0) return "Guest";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Guest";
  const first = capitalise(parts[0]);
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1];
  const initial = (last[0] ?? "").toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// -----------------------------------------------------------------------------
// Source classification + label mapping
// -----------------------------------------------------------------------------

export type CalendarEventBucket =
  | "guest_stay"
  | "owner_stay"
  | "maintenance"
  | "internal_hold"
  | "out_of_order"
  | "operations"
  | "review";

/**
 * Pure: collapse a raw `source` value to a coarser bucket the
 * calendar legend renders.
 */
export function classifyOwnerCalendarEvent(
  source: OwnerCalendarSource,
): CalendarEventBucket {
  switch (source) {
    case "booking":
      return "guest_stay";
    case "owner_stay":
      return "owner_stay";
    case "maintenance_block":
      return "maintenance";
    case "internal_hold":
      return "internal_hold";
    case "out_of_order":
      return "out_of_order";
    case "housekeeping_task":
    case "maintenance_ticket":
    case "readiness":
      return "operations";
    case "review":
      return "review";
  }
}

/**
 * Pure: friendly label per status — used as the badge text on the
 * owner calendar. Never reveals internal terminology.
 */
export function publicCalendarStatusLabel(
  event: { source: OwnerCalendarSource; status?: string | null },
): string {
  const raw = (event.status ?? "").toLowerCase();
  switch (event.source) {
    case "booking":
      if (raw === "confirmed" || raw === "active") return "Booked";
      if (raw === "checked_in" || raw === "in_house") return "Guest in-house";
      if (raw === "checked_out") return "Recent stay";
      if (raw === "cancelled") return "Cancelled";
      return "Booked";
    case "owner_stay":
      return "Owner stay";
    case "maintenance_block":
      return "Maintenance";
    case "internal_hold":
      return "Internal hold";
    case "out_of_order":
      return "Out of order";
    case "housekeeping_task":
      return "Housekeeping";
    case "maintenance_ticket":
      return "Maintenance ticket";
    case "readiness":
      return "Inspection";
    case "review":
      return "Review";
  }
}

// -----------------------------------------------------------------------------
// Date math
// -----------------------------------------------------------------------------

/**
 * Pure: half-open interval check. Booking convention is
 * `check_in <= d < check_out`; we mirror that for every other
 * source so a "single-day" event has `endDate = startDate + 1 day`.
 *
 * Inputs are ISO date strings (YYYY-MM-DD). Returns true when the
 * event covers the date.
 */
export function eventOverlapsDate(
  event: { startDate: string; endDate: string | null },
  date: string,
): boolean {
  if (!event.startDate || !date) return false;
  if (date < event.startDate) return false;
  if (event.endDate && date >= event.endDate) return false;
  return true;
}

/**
 * Pure: build a flat list of `(YYYY-MM-DD, events[])` rows so the
 * calendar grid can render row-by-row without per-cell SQL.
 */
export interface CalendarGridRow {
  date: string;
  events: OwnerCalendarEvent[];
}

export function buildCalendarMonthGrid(
  startDate: string,
  endDate: string,
  events: ReadonlyArray<OwnerCalendarEvent>,
): CalendarGridRow[] {
  const rows: CalendarGridRow[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return rows;
  for (
    let d = new Date(start.getTime());
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    rows.push({
      date: iso,
      events: events.filter((e) => eventOverlapsDate(e, iso)),
    });
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Source merging — bookings + blocks + owner stays + tasks all flow
// through here so the timeline / calendar render off a single shape.
// -----------------------------------------------------------------------------

export interface RawBookingForOwner {
  id: string;
  villaId: string;
  villaCode: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  channelLabel: string | null;
  guestFullName: string | null;
  guestCountry: string | null;
  guestCount: number | null;
}
export interface RawBlockForOwner {
  id: string;
  villaId: string;
  villaCode: string | null;
  source: "maintenance_block" | "internal_hold" | "out_of_order";
  startDate: string;
  endDate: string;
  reason: string | null;
}
export interface RawOwnerStayForOwner {
  id: string;
  villaId: string;
  villaCode: string | null;
  startDate: string;
  endDate: string;
  status: string;
  guestLabel?: string | null;
}
export interface RawOpsTaskForOwner {
  id: string;
  villaId: string;
  villaCode: string | null;
  source: "housekeeping_task" | "maintenance_ticket" | "readiness";
  scheduledFor: string;
  title: string;
}

/**
 * Pure: merge the four canonical sources into a single sorted list.
 * Sort order: `startDate` ascending, ties broken by source priority
 * (guest stay > owner stay > maintenance > ops > internal hold).
 */
export function mergeCalendarSources(args: {
  bookings: ReadonlyArray<RawBookingForOwner>;
  blocks: ReadonlyArray<RawBlockForOwner>;
  ownerStays: ReadonlyArray<RawOwnerStayForOwner>;
  tasks: ReadonlyArray<RawOpsTaskForOwner>;
  preferences: OwnerCalendarPreferenceShape;
}): OwnerCalendarEvent[] {
  const out: OwnerCalendarEvent[] = [];
  for (const b of args.bookings) {
    const guestName = shouldExposeGuestName(args.preferences)
      ? maskGuestName(b.guestFullName)
      : null;
    out.push({
      id: `booking:${b.id}`,
      source: "booking",
      villaId: b.villaId,
      villaCode: b.villaCode,
      startDate: b.checkIn,
      endDate: b.checkOut,
      title: guestName ?? "Guest stay",
      status: b.status,
      channelLabel: args.preferences.showChannelLabels
        ? b.channelLabel
        : null,
      guestCountry: shouldExposeGuestCountry(args.preferences)
        ? b.guestCountry
        : null,
      guestDisplayName: guestName,
      guestCount: b.guestCount,
    });
  }
  for (const s of args.ownerStays) {
    out.push({
      id: `owner_stay:${s.id}`,
      source: "owner_stay",
      villaId: s.villaId,
      villaCode: s.villaCode,
      startDate: s.startDate,
      endDate: s.endDate,
      title: s.guestLabel ?? "Owner stay",
      status: s.status,
      channelLabel: null,
      guestCountry: null,
      guestDisplayName: null,
      guestCount: null,
    });
  }
  for (const block of args.blocks) {
    if (
      block.source === "maintenance_block" &&
      !args.preferences.showMaintenanceDetails
    ) {
      out.push({
        id: `block:${block.id}`,
        source: "maintenance_block",
        villaId: block.villaId,
        villaCode: block.villaCode,
        startDate: block.startDate,
        endDate: block.endDate,
        title: "Maintenance",
        status: "blocked",
        channelLabel: null,
        guestCountry: null,
        guestDisplayName: null,
        guestCount: null,
      });
      continue;
    }
    out.push({
      id: `block:${block.id}`,
      source: block.source,
      villaId: block.villaId,
      villaCode: block.villaCode,
      startDate: block.startDate,
      endDate: block.endDate,
      title:
        block.reason ?? labelForBlockSource(block.source),
      status: "blocked",
      channelLabel: null,
      guestCountry: null,
      guestDisplayName: null,
      guestCount: null,
    });
  }
  for (const t of args.tasks) {
    out.push({
      id: `task:${t.id}`,
      source: t.source,
      villaId: t.villaId,
      villaCode: t.villaCode,
      startDate: t.scheduledFor,
      endDate: t.scheduledFor,
      title: t.title,
      status: "scheduled",
      channelLabel: null,
      guestCountry: null,
      guestDisplayName: null,
      guestCount: null,
    });
  }
  out.sort((a, b) => {
    if (a.startDate !== b.startDate)
      return a.startDate < b.startDate ? -1 : 1;
    return sourcePriority(a.source) - sourcePriority(b.source);
  });
  return out;
}

function labelForBlockSource(s: RawBlockForOwner["source"]): string {
  if (s === "maintenance_block") return "Maintenance";
  if (s === "internal_hold") return "Internal hold";
  return "Out of order";
}

function sourcePriority(s: OwnerCalendarSource): number {
  const order: OwnerCalendarSource[] = [
    "booking",
    "owner_stay",
    "maintenance_block",
    "out_of_order",
    "internal_hold",
    "housekeeping_task",
    "maintenance_ticket",
    "readiness",
    "review",
  ];
  const i = order.indexOf(s);
  return i === -1 ? 99 : i;
}

// -----------------------------------------------------------------------------
// Preference predicates
// -----------------------------------------------------------------------------

export function shouldExposeGuestName(
  preferences: OwnerCalendarPreferenceShape,
): boolean {
  return preferences.showGuestNames;
}

export function shouldExposeGuestCountry(
  preferences: OwnerCalendarPreferenceShape,
): boolean {
  return preferences.showGuestCountry;
}

/**
 * Pure: assert the projection shape never carries a raw email or
 * phone. Used by tests to pin behaviour.
 */
export function ownerSafeBookingProjection(b: {
  id: string;
  villaId: string;
  villaCode: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  channelLabel?: string | null;
  guestFullName?: string | null;
  guestCountry?: string | null;
  guestCount?: number | null;
  // Anything else is intentionally dropped. Callers passing email /
  // phone here will see them silently discarded — and the test
  // suite asserts the result shape.
}): RawBookingForOwner {
  return {
    id: b.id,
    villaId: b.villaId,
    villaCode: b.villaCode,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    channelLabel: b.channelLabel ?? null,
    guestFullName: b.guestFullName ?? null,
    guestCountry: b.guestCountry ?? null,
    guestCount: b.guestCount ?? null,
  };
}

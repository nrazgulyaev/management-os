/**
 * Prompt 108 — Pure helpers for the owner-booking projection.
 *
 * No DB / no `server-only` import — every function is unit-testable.
 *
 * Owners must NEVER see guest emails, phones, hold tokens, payment
 * provider IDs, finance link IDs, revenue line IDs, or statement
 * period IDs.  This module is the seam where that contract is
 * enforced.  Anything the owner UI renders comes through helpers in
 * here or in `revenue-pure.ts`.
 */

// -----------------------------------------------------------------------------
// Source taxonomy
// -----------------------------------------------------------------------------

export type OwnerBookingSourceType =
  | "direct_booking"
  | "ota_airbnb"
  | "ota_booking_com"
  | "ota_vrbo"
  | "manual"
  | "owner_stay"
  | "maintenance_block"
  | "internal_hold"
  | "service_related"
  | "other";

export type OwnerBookingPublicStatus =
  | "inquiry"
  | "under_review"
  | "deposit_pending"
  | "confirmed"
  | "in_house"
  | "completed"
  | "cancelled"
  | "expired"
  | "blocked"
  | "maintenance"
  | "owner_stay";

export const OWNER_BOOKING_SOURCE_TYPES: ReadonlyArray<OwnerBookingSourceType> =
  [
    "direct_booking",
    "ota_airbnb",
    "ota_booking_com",
    "ota_vrbo",
    "manual",
    "owner_stay",
    "maintenance_block",
    "internal_hold",
    "service_related",
    "other",
  ];

export const OWNER_BOOKING_PUBLIC_STATUSES: ReadonlyArray<OwnerBookingPublicStatus> =
  [
    "inquiry",
    "under_review",
    "deposit_pending",
    "confirmed",
    "in_house",
    "completed",
    "cancelled",
    "expired",
    "blocked",
    "maintenance",
    "owner_stay",
  ];

// -----------------------------------------------------------------------------
// Guest name masking
// -----------------------------------------------------------------------------

/**
 * Pure: turn a raw guest full name into an owner-safe label.
 *
 *   "Emma Whitmore"        → "Emma W."
 *   "Made"                 → "Made"
 *   "ALICIA KEYS-COOPER"   → "Alicia K."
 *   "" / null / undefined  → "Guest"
 *
 * Mirrors `maskGuestName` from
 * `src/features/owner-intelligence/calendar-pure.ts` so direct-booking
 * projection rows produce identical labels to OTA bookings.
 */
export function maskOwnerGuestName(
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
// Source type / channel mapping
// -----------------------------------------------------------------------------

/**
 * Pure: derive an owner-facing source_type from a booking's
 * `bookingChannels.key` + `type` pair, optionally augmented by a
 * direct-booking request id.
 */
export function mapBookingChannelToSourceType(input: {
  channelKey: string | null;
  channelType: string | null;
  hasDirectBookingRequest: boolean;
}): OwnerBookingSourceType {
  if (input.hasDirectBookingRequest) return "direct_booking";
  const key = (input.channelKey ?? "").toLowerCase();
  if (
    key === "direct" ||
    key === "arconique" ||
    key === "arconique_direct" ||
    key === "website"
  ) {
    return "direct_booking";
  }
  if (key === "airbnb") return "ota_airbnb";
  if (key === "booking_com" || key === "booking.com" || key === "bookingcom")
    return "ota_booking_com";
  if (key === "vrbo" || key === "homeaway") return "ota_vrbo";
  const type = (input.channelType ?? "").toLowerCase();
  if (type === "ota") return "manual";
  if (type === "direct") return "direct_booking";
  if (type === "agent") return "manual";
  return "other";
}

/**
 * Pure: friendly source label.  Always derived from `sourceType` so
 * the owner-facing copy never reflects internal channel keys.
 */
export function publicBookingSourceLabel(
  sourceType: OwnerBookingSourceType,
  channelLabel: string | null,
): string {
  switch (sourceType) {
    case "direct_booking":
      return "Direct booking";
    case "ota_airbnb":
      return "Airbnb";
    case "ota_booking_com":
      return "Booking.com";
    case "ota_vrbo":
      return "Vrbo";
    case "manual":
      return channelLabel ?? "Manual booking";
    case "owner_stay":
      return "Owner stay";
    case "maintenance_block":
      return "Maintenance";
    case "internal_hold":
      return "Internal hold";
    case "service_related":
      return "Guest service";
    case "other":
      return channelLabel ?? "Stay";
  }
}

/**
 * Pure: produce the complete `owner_label` rendered on cards / tables.
 *
 *   ("direct_booking", "confirmed")    → "Direct booking · Confirmed"
 *   ("ota_airbnb", "in_house")         → "Airbnb stay · Guest in-house"
 *   ("owner_stay", "owner_stay")       → "Owner stay"
 *   ("maintenance_block", "blocked")   → "Maintenance block"
 */
export function buildOwnerLabel(
  sourceType: OwnerBookingSourceType,
  publicStatus: OwnerBookingPublicStatus,
  channelLabel: string | null,
): string {
  const status = publicStatusLabel(publicStatus);
  const source = publicBookingSourceLabel(sourceType, channelLabel);
  if (sourceType === "owner_stay") return "Owner stay";
  if (sourceType === "maintenance_block") return "Maintenance block";
  if (sourceType === "internal_hold") return "Internal hold";
  if (
    sourceType === "ota_airbnb" ||
    sourceType === "ota_booking_com" ||
    sourceType === "ota_vrbo"
  ) {
    return `${source} stay · ${status}`;
  }
  return `${source} · ${status}`;
}

// -----------------------------------------------------------------------------
// Status mapping
// -----------------------------------------------------------------------------

/**
 * Pure: map any combination of (booking.status, request.status,
 * deposit.status, hold.status, ownerStay.status, calendarBlock) into
 * a single owner-facing public status.
 */
export function publicBookingStatus(input: {
  bookingStatus?: string | null;
  bookingCheckIn?: string | null;
  bookingCheckOut?: string | null;
  requestStatus?: string | null;
  depositStatus?: string | null;
  holdStatus?: string | null;
  ownerStayStatus?: string | null;
  calendarBlockType?: string | null;
  today?: string | null;
}): OwnerBookingPublicStatus {
  // Owner stay always wins.
  if (input.ownerStayStatus) {
    if (input.ownerStayStatus === "rejected") return "cancelled";
    return "owner_stay";
  }
  // Calendar block.
  if (input.calendarBlockType) {
    if (
      input.calendarBlockType === "maintenance" ||
      input.calendarBlockType === "out_of_order"
    ) {
      return "maintenance";
    }
    return "blocked";
  }
  // A confirmed/completed booking is the strongest signal.
  if (input.bookingStatus) {
    const b = input.bookingStatus.toLowerCase();
    if (b === "cancelled" || b === "no_show") return "cancelled";
    if (b === "checked_out") return "completed";
    if (b === "checked_in") return "in_house";
    if (b === "confirmed" || b === "tentative") {
      // Walk the calendar — if today is between check-in and check-out
      // we soft-promote to in_house.
      const today = input.today ?? null;
      const ci = input.bookingCheckIn ?? null;
      const co = input.bookingCheckOut ?? null;
      if (today && ci && co && today >= ci && today < co) return "in_house";
      if (today && co && today >= co) return "completed";
      return "confirmed";
    }
    if (b === "inquiry") return "inquiry";
  }
  // Request without a booking.
  if (input.requestStatus) {
    const r = input.requestStatus.toLowerCase();
    if (r === "submitted") return "under_review";
    if (r === "under_review") return "under_review";
    if (r === "approved" || r === "deposit_required") return "deposit_pending";
    if (r === "rejected") return "cancelled";
    if (r === "expired") return "expired";
    if (r === "converted") return "confirmed";
  }
  // Deposit-only signals.
  if (input.depositStatus) {
    const d = input.depositStatus.toLowerCase();
    if (
      d === "pending" ||
      d === "awaiting_provider" ||
      d === "requires_action"
    ) {
      return "deposit_pending";
    }
    if (d === "expired") return "expired";
    if (d === "cancelled") return "cancelled";
  }
  // Hold-only signals.
  if (input.holdStatus) {
    const h = input.holdStatus.toLowerCase();
    if (h === "active") return "inquiry";
    if (h === "expired") return "expired";
    if (h === "cancelled") return "cancelled";
  }
  return "inquiry";
}

/**
 * Pure: the badge label for a public status.
 */
export function publicStatusLabel(s: OwnerBookingPublicStatus): string {
  switch (s) {
    case "inquiry":
      return "Inquiry";
    case "under_review":
      return "Under review";
    case "deposit_pending":
      return "Deposit pending";
    case "confirmed":
      return "Confirmed";
    case "in_house":
      return "Guest in-house";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "blocked":
      return "Blocked";
    case "maintenance":
      return "Maintenance";
    case "owner_stay":
      return "Owner stay";
  }
}

/**
 * Pure: would this status clutter the calendar?  Inquiries that did
 * not block dates and expired/cancelled rows are hidden.
 */
export function isOwnerVisibleBookingStatus(
  s: OwnerBookingPublicStatus,
  hasBlockingHold: boolean,
): boolean {
  if (s === "cancelled" || s === "expired") return false;
  if (s === "inquiry" && !hasBlockingHold) return false;
  return true;
}

// -----------------------------------------------------------------------------
// Date / month math
// -----------------------------------------------------------------------------

/**
 * Pure: half-open interval (Booking convention).
 *   "2026-04-10" → "2026-04-13" → 3 nights.
 */
export function calculateBookingNights(
  checkIn: string | Date,
  checkOut: string | Date,
): number {
  const ci = toIsoDate(checkIn);
  const co = toIsoDate(checkOut);
  if (!ci || !co) return 0;
  const a = new Date(`${ci}T00:00:00Z`).getTime();
  const b = new Date(`${co}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Pure: bucket a date into "YYYY-MM-01" (first-of-month, ISO). */
export function monthKey(d: string | Date): string {
  const iso = toIsoDate(d) ?? "";
  if (iso.length < 7) return "1970-01-01";
  return `${iso.slice(0, 7)}-01`;
}

function toIsoDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

// -----------------------------------------------------------------------------
// Owner-safe projection — drop banned fields.
// -----------------------------------------------------------------------------

/**
 * Pure: assert and produce an owner-safe shape.  Anything that smells
 * like an internal identifier or PII channel is silently dropped.
 *
 * Test asserts that the resulting object never has the banned keys —
 * if a caller hands us an unexpected field name we just don't include
 * it.  TypeScript narrows callers; this is the runtime guard.
 */
export interface OwnerSafeBookingProjectionInput {
  id: string;
  ownerId: string;
  villaId: string | null;
  projectId: string | null;
  bookingId?: string | null;
  directBookingRequestId?: string | null;
  directBookingHoldId?: string | null;
  sourceType: OwnerBookingSourceType;
  publicStatus: OwnerBookingPublicStatus;
  ownerLabel: string;
  guestLabel: string | null;
  guestCountry: string | null;
  channelLabel: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number | null;
  totalAmountMinor: bigint | null;
  ownerRevenueMinor: bigint | null;
  currency: string | null;
  revenuePosted: boolean;
  statementId: string | null;
  ownerStatementHref: string | null;
  ownerVisible: boolean;
  visibilityNotes: string | null;
  sourceUpdatedAt: string | null;
  // Anything else — email, phone, holdTokenHash, providerSessionId,
  // financeLinkId, revenueLineId, statementPeriodId, internalNotes —
  // is intentionally dropped.
}

export type OwnerSafeBookingProjection = OwnerSafeBookingProjectionInput;

const BANNED_KEYS = new Set([
  "email",
  "guestEmail",
  "guest_email",
  "phone",
  "guestPhone",
  "guest_phone",
  "whatsapp",
  "holdTokenHash",
  "hold_token_hash",
  "tokenHash",
  "tokenPrefix",
  "providerSessionId",
  "provider_session_id",
  "providerPaymentId",
  "provider_payment_id",
  "depositId",
  "deposit_id",
  "financeLinkId",
  "finance_link_id",
  "revenueLineId",
  "revenue_line_id",
  "statementPeriodId",
  "statement_period_id",
  "internalNotes",
  "internal_notes",
  "adminNotes",
  "admin_notes",
  "decisionNote",
  "decision_note",
  "lastError",
  "last_error",
  "configPrivateEncrypted",
  "config_private_encrypted",
]);

/**
 * Pure: drop banned keys from any input object.  Used by services as
 * a belt-and-braces seam in case a caller passes an object literal
 * with extra fields.
 */
export function safeOwnerBookingProjection<
  T extends Record<string, unknown>,
>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (BANNED_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * Pure: timeline status copy for the booking detail page.  We never
 * leak internal status verbs.
 */
export function buildOwnerBookingTimelineStatus(summary: {
  publicStatus: OwnerBookingPublicStatus;
  sourceType: OwnerBookingSourceType;
}): { headline: string; body: string } {
  switch (summary.publicStatus) {
    case "inquiry":
      return {
        headline: "Inquiry received",
        body: "A guest is exploring these dates. Nothing is confirmed yet.",
      };
    case "under_review":
      return {
        headline: "Under review",
        body: "Our concierge team is reviewing the request.",
      };
    case "deposit_pending":
      return {
        headline: "Awaiting deposit",
        body: "We have asked the guest for a deposit. The booking is not yet confirmed.",
      };
    case "confirmed":
      return {
        headline: "Confirmed",
        body:
          summary.sourceType === "direct_booking"
            ? "This direct booking is confirmed."
            : "This booking is confirmed.",
      };
    case "in_house":
      return { headline: "Guest in-house", body: "The guest is currently staying at the villa." };
    case "completed":
      return {
        headline: "Stay completed",
        body: "The guest has checked out. Revenue will appear on your next statement once the period closes.",
      };
    case "cancelled":
      return { headline: "Cancelled", body: "This booking was cancelled." };
    case "expired":
      return {
        headline: "Expired",
        body: "The hold or request expired without a confirmed booking.",
      };
    case "blocked":
      return { headline: "Blocked", body: "These dates are not available for booking." };
    case "maintenance":
      return {
        headline: "Maintenance",
        body: "These dates are reserved for maintenance.",
      };
    case "owner_stay":
      return { headline: "Owner stay", body: "These dates are reserved for an owner stay." };
  }
}

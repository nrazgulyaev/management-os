/**
 * Stage 6.P1.C — Airbnb JSON request/response mappers.
 *
 * Pure helpers — no I/O, no fetch. Translate between the platform's
 * unified inputs (AvailabilityInput / RatesInput / etc) and Airbnb's
 * Hosting API JSON shapes; translate Airbnb's reservation responses
 * into the normalized ChannelReservationData.
 *
 * Per Airbnb Hosting API docs (Pricing + Calendar + Reservations
 * resources). Airbnb is JSON throughout — no XML — but the same shape
 * discipline as the OTA mappers in P1.B applies: builders never throw
 * on an empty range (they return an empty payload that the client
 * short-circuits before sending), and parsers degrade to a sensible
 * empty result on shape mismatch.
 */

import type {
  AvailabilityInput,
  ChannelReservationData,
  ChannelReservationGuest,
  ChannelReservationState,
  RatesInput,
} from "../../types";

// ---------------------------------------------------------------------------
// Outbound — internal → Airbnb
// ---------------------------------------------------------------------------

/**
 * Airbnb calendar-update request body (PUT /calendars/{listing_id}).
 * Each `days` entry sets one date's availability + reason.
 *
 * Airbnb's `available` is boolean; we map availabilityPerDay > 0 → true.
 * `reason` defaults to "external_block" when closing — Airbnb surfaces
 * this in the host's calendar so they can tell channel-manager closures
 * apart from manual ones.
 */
export interface AirbnbCalendarBody {
  listing_id: string;
  days: Array<{
    date: string; // YYYY-MM-DD
    available: boolean;
    reason?: string;
  }>;
}

export function mapInternalAvailabilityToAirbnb(
  input: AvailabilityInput,
): AirbnbCalendarBody {
  const days: AirbnbCalendarBody["days"] = [];
  // Sorted iteration so the request body is deterministic — easier
  // diffing in the integration log + cleaner test assertions.
  const keys = [...input.availabilityPerDay.keys()].sort();
  for (const date of keys) {
    const count = input.availabilityPerDay.get(date) ?? 0;
    days.push({
      date,
      available: count > 0,
      reason: count > 0 ? undefined : "external_block",
    });
  }
  return {
    listing_id: input.externalPropertyId,
    days,
  };
}

/**
 * Airbnb pricing-update request body (PUT /listings/{listing_id}/pricing).
 * `daily_prices` is an array of date-keyed price entries with native
 * currency + amount in major units (Airbnb does not accept minor units).
 *
 * `min_nights` / `max_nights` are per-day stay constraints when set.
 */
export interface AirbnbPricingBody {
  listing_id: string;
  daily_prices: Array<{
    date: string;
    native_currency: string;
    native_price: number;
    min_nights?: number;
    max_nights?: number;
  }>;
}

export function mapInternalRatesToAirbnb(input: RatesInput): AirbnbPricingBody {
  const daily_prices: AirbnbPricingBody["daily_prices"] = [];
  const keys = [...input.ratesPerDay.keys()].sort();
  for (const date of keys) {
    const r = input.ratesPerDay.get(date)!;
    daily_prices.push({
      date,
      native_currency: r.currency,
      // Airbnb rejects fractional currency for some currencies (JPY, IDR)
      // but accepts decimals for USD/EUR/etc. We pass the raw division
      // and let Airbnb's server-side validation flag bad currencies —
      // the rate source already knows what's valid for the listing.
      native_price: Number(r.amountMinor) / 100,
      min_nights: r.minStay,
      max_nights: r.maxStay,
    });
  }
  return {
    listing_id: input.externalPropertyId,
    daily_prices,
  };
}

/**
 * Airbnb amenities update — POST /listings/{listing_id}/amenities.
 * Body is a set of amenity codes the host wants enabled. We send the
 * full set (Airbnb diffs against current state).
 */
export interface AirbnbAmenitiesBody {
  listing_id: string;
  amenities: string[];
}

export function mapAmenitiesToAirbnb(
  externalPropertyId: string,
  amenities: string[],
): AirbnbAmenitiesBody {
  return {
    listing_id: externalPropertyId,
    amenities: [...amenities],
  };
}

// ---------------------------------------------------------------------------
// Inbound — Airbnb → internal
// ---------------------------------------------------------------------------

/**
 * Map Airbnb's reservation status string to the canonical
 * `ChannelReservationState`. Airbnb's status enum:
 *   - "accept", "accepted"               → confirmed
 *   - "request", "pending_payment"       → received
 *   - "cancellation_by_*"                → cancelled
 *   - "alteration"                       → modified
 *   - "no_show"                          → no_show
 *   - "checkpoint", "checkout_complete"  → completed
 *
 * Anything we don't recognize is mapped to 'received' so the workflow
 * still picks it up for operator review (better safe than skipped).
 */
export function mapAirbnbStatusToInternal(
  status: string | undefined,
): ChannelReservationState {
  if (!status) return "received";
  const lower = status.toLowerCase();
  if (lower.startsWith("cancellation") || lower === "cancelled" || lower === "canceled") {
    return "cancelled";
  }
  if (lower === "accept" || lower === "accepted" || lower === "confirmed") {
    return "confirmed";
  }
  if (lower === "alteration" || lower === "modified") {
    return "modified";
  }
  if (lower === "no_show") return "no_show";
  if (lower === "checkpoint" || lower === "checkout_complete" || lower === "completed") {
    return "completed";
  }
  return "received";
}

/**
 * Map an Airbnb reservation JSON object (from the Reservations API or
 * a webhook payload) to ChannelReservationData. Returns null when the
 * payload is missing the load-bearing fields (id, dates) — the caller
 * filters those out rather than persisting a half-record.
 */
export function mapAirbnbReservationToInternal(
  raw: Record<string, unknown>,
): ChannelReservationData | null {
  const id = pickString(raw, "confirmation_code") ?? pickString(raw, "id");
  if (!id) return null;

  const checkInRaw = pickString(raw, "start_date") ?? pickString(raw, "check_in");
  const checkOutRaw = pickString(raw, "end_date") ?? pickString(raw, "check_out");
  if (!checkInRaw || !checkOutRaw) return null;
  const checkIn = parseDate(checkInRaw);
  const checkOut = parseDate(checkOutRaw);
  if (!checkIn || !checkOut) return null;

  const externalStatus = pickString(raw, "status") ?? "request";

  const guest = parseGuest(raw);
  const counts = parseGuestCounts(raw);
  const total = parseTotal(raw);

  const createdRaw =
    pickString(raw, "submitted_at") ??
    pickString(raw, "booking_date") ??
    pickString(raw, "created_at");
  const reservationCreatedAt = parseDate(createdRaw) ?? new Date();

  const specialRequests =
    pickString(raw, "special_requests") ??
    pickString(raw, "guest_message");

  return {
    externalReservationId: id,
    externalStatus,
    guest,
    checkIn,
    checkOut,
    adults: counts.adults,
    children: counts.children,
    infants: counts.infants,
    totalAmountMinor: total.amountMinor,
    currency: total.currency,
    commissionMinor: total.commissionMinor,
    taxesMinor: total.taxesMinor,
    serviceFeesMinor: total.serviceFeesMinor,
    paymentCollectedBy: "channel",
    specialRequests,
    reservationCreatedAt,
    rawPayload: raw,
  };
}

// ---------------------------------------------------------------------------
// Inbound helpers
// ---------------------------------------------------------------------------

function parseGuest(raw: Record<string, unknown>): ChannelReservationGuest {
  const guestObj = (raw["guest"] ??
    raw["primary_guest"] ??
    raw["guest_details"]) as Record<string, unknown> | undefined;

  const name = guestObj
    ? (pickString(guestObj, "full_name") ?? pickString(guestObj, "name"))
    : undefined;

  let firstName = guestObj
    ? pickString(guestObj, "first_name")
    : undefined;
  let lastName = guestObj ? pickString(guestObj, "last_name") : undefined;
  if (!firstName && !lastName && name) {
    const parts = name.trim().split(/\s+/);
    firstName = parts[0] ?? "Unknown";
    lastName = parts.slice(1).join(" ") || "Guest";
  }

  return {
    firstName: firstName ?? "Unknown",
    lastName: lastName ?? "Guest",
    email: guestObj ? pickString(guestObj, "email") : undefined,
    phone: guestObj
      ? (pickString(guestObj, "phone") ?? pickString(guestObj, "phone_number"))
      : undefined,
    country: guestObj
      ? (pickString(guestObj, "country") ?? pickString(guestObj, "country_code"))
      : undefined,
  };
}

function parseGuestCounts(raw: Record<string, unknown>): {
  adults: number;
  children?: number;
  infants?: number;
} {
  const guestsObj = raw["guests"] as Record<string, unknown> | undefined;
  const adults =
    pickNumber(raw, "number_of_adults") ??
    (guestsObj ? pickNumber(guestsObj, "adults") : undefined) ??
    1;
  const children =
    pickNumber(raw, "number_of_children") ??
    (guestsObj ? pickNumber(guestsObj, "children") : undefined);
  const infants =
    pickNumber(raw, "number_of_infants") ??
    (guestsObj ? pickNumber(guestsObj, "infants") : undefined);
  return { adults, children, infants };
}

function parseTotal(raw: Record<string, unknown>): {
  amountMinor: bigint;
  currency: string;
  commissionMinor?: bigint;
  taxesMinor?: bigint;
  serviceFeesMinor?: bigint;
} {
  // Airbnb pricing surface: `total_paid_amount_accurate` (host payout
  // currency) + `host_payout_amount_accurate` are the canonical fields.
  // Some payloads use a `pricing_quote` nested object instead.
  const pricingQuote = raw["pricing_quote"] as
    | Record<string, unknown>
    | undefined;
  const top = (key: string) =>
    pickAmount(raw, key) ?? (pricingQuote ? pickAmount(pricingQuote, key) : undefined);

  const totalRaw =
    top("total_paid_amount_accurate") ??
    top("guest_total_price") ??
    top("total");
  const currency =
    pickString(raw, "currency") ??
    (pricingQuote ? pickString(pricingQuote, "currency") : undefined) ??
    "USD";

  const taxes = top("tax_amount") ?? top("taxes");
  const fees = top("service_fee") ?? top("airbnb_service_fee");
  const commission = top("host_fee") ?? top("airbnb_host_fee");

  return {
    amountMinor: totalRaw ?? 0n,
    currency,
    commissionMinor: commission,
    taxesMinor: taxes,
    serviceFeesMinor: fees,
  };
}

function pickAmount(o: Record<string, unknown>, key: string): bigint | undefined {
  const v = o[key];
  if (v == null) return undefined;
  if (typeof v === "number" && isFinite(v)) {
    return BigInt(Math.round(v * 100));
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (isFinite(n)) return BigInt(Math.round(n * 100));
  }
  return undefined;
}

function pickString(
  o: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickNumber(
  o: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = o[key];
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (isFinite(n)) return n;
  }
  return undefined;
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

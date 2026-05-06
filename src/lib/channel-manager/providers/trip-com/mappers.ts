/**
 * Stage 6.P1.D.1 — Trip.com Partner Connect JSON mappers.
 *
 * Pure helpers — no I/O. Trip.com Partner Connect is JSON throughout
 * (no XML/SOAP); the mappers translate platform inputs into the JSON
 * shapes documented for the inventory/rates/reservations endpoints,
 * and project Trip.com reservations back into ChannelReservationData.
 */

import type {
  AvailabilityInput,
  ChannelReservationData,
  ChannelReservationGuest,
  RatesInput,
} from "../../types";

// ---------------------------------------------------------------------------
// Outbound — internal → Trip.com
// ---------------------------------------------------------------------------

export interface TripInventoryBody {
  hotel_id: string;
  inventory: Array<{
    date: string; // YYYY-MM-DD
    /** 0 = sold out / closed for sale; > 0 = units available. */
    available_count: number;
  }>;
}

export function mapInternalAvailabilityToTrip(
  input: AvailabilityInput,
): TripInventoryBody {
  const inventory: TripInventoryBody["inventory"] = [];
  // Sorted iteration → deterministic body, easier diff in sync log.
  for (const date of [...input.availabilityPerDay.keys()].sort()) {
    inventory.push({
      date,
      available_count: Math.max(0, input.availabilityPerDay.get(date) ?? 0),
    });
  }
  return { hotel_id: input.externalPropertyId, inventory };
}

export interface TripRatesBody {
  hotel_id: string;
  rate_plan_id: string;
  rates: Array<{
    date: string;
    price: number; // major units
    currency: string;
    min_stay?: number;
    max_stay?: number;
  }>;
}

export function mapInternalRatesToTrip(input: RatesInput): TripRatesBody {
  const rates: TripRatesBody["rates"] = [];
  for (const date of [...input.ratesPerDay.keys()].sort()) {
    const r = input.ratesPerDay.get(date)!;
    rates.push({
      date,
      // Trip.com expects major units in the currency of the rate plan.
      price: Number(r.amountMinor) / 100,
      currency: r.currency,
      min_stay: r.minStay,
      max_stay: r.maxStay,
    });
  }
  return {
    hotel_id: input.externalPropertyId,
    rate_plan_id: input.ratePlanId,
    rates,
  };
}

export interface TripAmenitiesBody {
  hotel_id: string;
  amenities: string[];
}

export function mapAmenitiesToTrip(
  externalPropertyId: string,
  amenities: string[],
): TripAmenitiesBody {
  return { hotel_id: externalPropertyId, amenities: [...amenities] };
}

// ---------------------------------------------------------------------------
// Inbound — Trip.com → internal
// ---------------------------------------------------------------------------

/**
 * Project a Trip.com reservation JSON object → ChannelReservationData.
 * Returns null when the load-bearing fields (id, dates) are missing —
 * caller filters those out rather than persisting half-records.
 *
 * Trip.com reservation status vocabulary:
 *   "confirmed" | "pending" | "modified" | "cancelled" | "no_show" | "completed"
 */
export function mapTripReservationToInternal(
  raw: Record<string, unknown>,
): ChannelReservationData | null {
  const id = pickString(raw, "reservation_id") ?? pickString(raw, "id");
  if (!id) return null;
  const checkInRaw = pickString(raw, "check_in") ?? pickString(raw, "checkin_date");
  const checkOutRaw = pickString(raw, "check_out") ?? pickString(raw, "checkout_date");
  if (!checkInRaw || !checkOutRaw) return null;
  const checkIn = parseDate(checkInRaw);
  const checkOut = parseDate(checkOutRaw);
  if (!checkIn || !checkOut) return null;

  const externalStatus = pickString(raw, "status") ?? "confirmed";
  const counts = parseGuestCounts(raw);
  const guest = parseGuest(raw);
  const total = parseTotal(raw);

  const createdRaw =
    pickString(raw, "created_at") ??
    pickString(raw, "booking_date") ??
    pickString(raw, "reservation_date");
  const reservationCreatedAt = parseDate(createdRaw) ?? new Date();

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
    paymentCollectedBy: "channel",
    specialRequests: pickString(raw, "special_requests"),
    reservationCreatedAt,
    rawPayload: raw,
  };
}

function parseGuest(raw: Record<string, unknown>): ChannelReservationGuest {
  const guestObj = (raw["guest"] ?? raw["primary_guest"]) as
    | Record<string, unknown>
    | undefined;
  if (!guestObj) {
    return { firstName: "Unknown", lastName: "Guest" };
  }
  let firstName = pickString(guestObj, "first_name");
  let lastName = pickString(guestObj, "last_name");
  if (!firstName && !lastName) {
    const full =
      pickString(guestObj, "name") ?? pickString(guestObj, "full_name");
    if (full) {
      const parts = full.trim().split(/\s+/);
      firstName = parts[0] ?? "Unknown";
      lastName = parts.slice(1).join(" ") || "Guest";
    }
  }
  return {
    firstName: firstName ?? "Unknown",
    lastName: lastName ?? "Guest",
    email: pickString(guestObj, "email"),
    phone:
      pickString(guestObj, "phone") ?? pickString(guestObj, "phone_number"),
    country: pickString(guestObj, "country") ?? pickString(guestObj, "nationality"),
  };
}

function parseGuestCounts(raw: Record<string, unknown>): {
  adults: number;
  children?: number;
  infants?: number;
} {
  const adults =
    pickNumber(raw, "adults") ??
    pickNumber(raw, "num_adults") ??
    pickNumber(raw, "guest_count") ??
    1;
  const children = pickNumber(raw, "children") ?? pickNumber(raw, "num_children");
  const infants = pickNumber(raw, "infants") ?? pickNumber(raw, "num_infants");
  return { adults, children, infants };
}

function parseTotal(raw: Record<string, unknown>): {
  amountMinor: bigint;
  currency: string;
  commissionMinor?: bigint;
  taxesMinor?: bigint;
} {
  const total =
    pickAmount(raw, "total_amount") ??
    pickAmount(raw, "total") ??
    pickAmount(raw, "amount");
  const currency = pickString(raw, "currency") ?? "USD";
  const commission =
    pickAmount(raw, "commission_amount") ?? pickAmount(raw, "commission");
  const taxes = pickAmount(raw, "tax_amount") ?? pickAmount(raw, "taxes");
  return {
    amountMinor: total ?? 0n,
    currency,
    commissionMinor: commission,
    taxesMinor: taxes,
  };
}

function pickString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickNumber(o: Record<string, unknown>, key: string): number | undefined {
  const v = o[key];
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (isFinite(n)) return n;
  }
  return undefined;
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

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

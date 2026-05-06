/**
 * Stage 6.P1.D.2 — Agoda YCS JSON mappers.
 *
 * Pure helpers — no I/O. Agoda YCS (Yield Control System) modern
 * REST/JSON endpoints. The launch prompt notes that some Agoda
 * integrations still use SOAP — REST is implemented first; SOAP
 * fallback can land later if a partner property requires it.
 */

import type {
  AvailabilityInput,
  ChannelReservationData,
  ChannelReservationGuest,
  RatesInput,
} from "../../types";

// ---------------------------------------------------------------------------
// Outbound — internal → Agoda YCS
// ---------------------------------------------------------------------------

export interface AgodaAvailabilityBody {
  hotel_id: string;
  availability: Array<{
    date: string;
    rooms_available: number;
  }>;
}

export function mapInternalAvailabilityToAgoda(
  input: AvailabilityInput,
): AgodaAvailabilityBody {
  const availability: AgodaAvailabilityBody["availability"] = [];
  for (const date of [...input.availabilityPerDay.keys()].sort()) {
    availability.push({
      date,
      rooms_available: Math.max(0, input.availabilityPerDay.get(date) ?? 0),
    });
  }
  return {
    hotel_id: input.externalPropertyId,
    availability,
  };
}

export interface AgodaRatesBody {
  hotel_id: string;
  rate_plan_id: string;
  rates: Array<{
    date: string;
    rate: number;
    currency: string;
    minimum_stay?: number;
    maximum_stay?: number;
  }>;
}

export function mapInternalRatesToAgoda(input: RatesInput): AgodaRatesBody {
  const rates: AgodaRatesBody["rates"] = [];
  for (const date of [...input.ratesPerDay.keys()].sort()) {
    const r = input.ratesPerDay.get(date)!;
    rates.push({
      date,
      rate: Number(r.amountMinor) / 100,
      currency: r.currency,
      minimum_stay: r.minStay,
      maximum_stay: r.maxStay,
    });
  }
  return {
    hotel_id: input.externalPropertyId,
    rate_plan_id: input.ratePlanId,
    rates,
  };
}

export interface AgodaAmenitiesBody {
  hotel_id: string;
  amenity_codes: string[];
}

export function mapAmenitiesToAgoda(
  externalPropertyId: string,
  amenities: string[],
): AgodaAmenitiesBody {
  return {
    hotel_id: externalPropertyId,
    amenity_codes: [...amenities],
  };
}

// ---------------------------------------------------------------------------
// Inbound — Agoda → internal
// ---------------------------------------------------------------------------

/**
 * Agoda reservation status vocabulary:
 *   "confirmed", "modified", "cancelled", "no_show"
 */
export function mapAgodaReservationToInternal(
  raw: Record<string, unknown>,
): ChannelReservationData | null {
  const id =
    pickString(raw, "booking_id") ??
    pickString(raw, "reservation_id") ??
    pickString(raw, "agoda_id");
  if (!id) return null;
  const checkInRaw = pickString(raw, "check_in") ?? pickString(raw, "arrival_date");
  const checkOutRaw =
    pickString(raw, "check_out") ?? pickString(raw, "departure_date");
  if (!checkInRaw || !checkOutRaw) return null;
  const checkIn = parseDate(checkInRaw);
  const checkOut = parseDate(checkOutRaw);
  if (!checkIn || !checkOut) return null;

  const externalStatus = pickString(raw, "status") ?? "confirmed";
  const counts = parseGuestCounts(raw);
  const guest = parseGuest(raw);
  const total = parseTotal(raw);

  const createdRaw =
    pickString(raw, "booked_at") ??
    pickString(raw, "created_at") ??
    pickString(raw, "booking_date");
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
    specialRequests:
      pickString(raw, "guest_remarks") ?? pickString(raw, "special_requests"),
    reservationCreatedAt,
    rawPayload: raw,
  };
}

function parseGuest(raw: Record<string, unknown>): ChannelReservationGuest {
  const guestObj = (raw["guest"] ?? raw["customer"]) as
    | Record<string, unknown>
    | undefined;
  if (!guestObj) {
    return { firstName: "Unknown", lastName: "Guest" };
  }
  let firstName = pickString(guestObj, "first_name");
  let lastName = pickString(guestObj, "last_name");
  if (!firstName && !lastName) {
    const full = pickString(guestObj, "name");
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
    phone: pickString(guestObj, "phone"),
    country:
      pickString(guestObj, "nationality") ??
      pickString(guestObj, "country_code"),
  };
}

function parseGuestCounts(raw: Record<string, unknown>): {
  adults: number;
  children?: number;
  infants?: number;
} {
  return {
    adults:
      pickNumber(raw, "adults") ??
      pickNumber(raw, "num_adults") ??
      pickNumber(raw, "guest_count") ??
      1,
    children: pickNumber(raw, "children") ?? pickNumber(raw, "num_children"),
    infants: pickNumber(raw, "infants") ?? pickNumber(raw, "num_infants"),
  };
}

function parseTotal(raw: Record<string, unknown>): {
  amountMinor: bigint;
  currency: string;
  commissionMinor?: bigint;
  taxesMinor?: bigint;
} {
  const total =
    pickAmount(raw, "total_amount") ??
    pickAmount(raw, "total_price") ??
    pickAmount(raw, "amount");
  return {
    amountMinor: total ?? 0n,
    currency: pickString(raw, "currency") ?? "USD",
    commissionMinor: pickAmount(raw, "commission"),
    taxesMinor: pickAmount(raw, "tax_amount") ?? pickAmount(raw, "taxes"),
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

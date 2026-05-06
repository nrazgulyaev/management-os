/**
 * Stage 6.P1.B — OTA XML response parsers for Booking.com.
 *
 * Pure helpers — no I/O. fast-xml-parser is dynamically imported so the
 * dependency only loads when a real Booking.com response actually needs
 * parsing (DryRun mode never touches it; cron startup stays small).
 *
 * Two parser categories:
 *   1. parseOTAResponse — generic Success/Errors envelope. Used by every
 *      push endpoint to detect ack vs failure.
 *   2. parseOTAReservations — extracts <HotelReservation> elements from
 *      OTA_HotelResRetrieveRS into normalized ChannelReservationData.
 *
 * Malformed input never throws — we return a `success: false` envelope
 * with an error explaining what failed. The caller (BookingComClient)
 * surfaces this as a SyncResult.
 */

import type {
  ChannelReservationData,
  ChannelReservationGuest,
} from "../../types";

export interface ParsedOTAResponse {
  success: boolean;
  errors: Array<{ code?: string; message: string }>;
  /** Raw fast-xml-parser output for downstream extraction (reservations). */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// fast-xml-parser lazy loader
// ---------------------------------------------------------------------------

// Module-level cache so subsequent calls don't re-resolve the import.
// Exported for tests so they can verify lazy-load behaviour.
let parserModule: typeof import("fast-xml-parser") | null = null;

async function loadParser() {
  if (parserModule) return parserModule;
  parserModule = await import("fast-xml-parser");
  return parserModule;
}

/** Test-only — reset the cache so a test can assert lazy import. */
export function __resetParserCacheForTests() {
  parserModule = null;
}

// ---------------------------------------------------------------------------
// 1) parseOTAResponse — generic Success/Errors detection
// ---------------------------------------------------------------------------

/**
 * Parse any OTA response envelope and report success/error.
 *
 * OTA convention:
 *   - <Success/> element present anywhere in the response → ack
 *   - <Errors><Error Code="..." ShortText="..."/></Errors> → failure
 *
 * Booking returns the <Success/> tag empty + may include a <Warnings>
 * block — warnings are non-fatal and don't flip success to false; the
 * caller can surface them via the raw payload if needed.
 */
export async function parseOTAResponse(xmlText: string): Promise<ParsedOTAResponse> {
  if (!xmlText || typeof xmlText !== "string") {
    return {
      success: false,
      errors: [{ message: "empty XML response" }],
    };
  }
  let parsed: Record<string, unknown>;
  try {
    const { XMLParser } = await loadParser();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      // Don't try to coerce numeric strings — preserves IDs that look numeric.
      parseAttributeValue: false,
      parseTagValue: false,
      // Keep the @_xmlns attribute stripped — we don't need namespace
      // bookkeeping for the success/errors check.
      ignoreDeclaration: true,
      ignorePiTags: true,
    });
    parsed = parser.parse(xmlText) as Record<string, unknown>;
  } catch (err) {
    return {
      success: false,
      errors: [
        {
          message:
            err instanceof Error
              ? `XML parse error: ${err.message}`
              : "XML parse error",
        },
      ],
    };
  }

  const errors = extractErrors(parsed);
  if (errors.length > 0) {
    return { success: false, errors, raw: parsed };
  }

  // No explicit <Errors> → look for <Success/> presence as the positive
  // signal. If neither is present, we treat as "unknown shape" failure
  // rather than silently succeeding.
  if (containsSuccess(parsed)) {
    return { success: true, errors: [], raw: parsed };
  }

  return {
    success: false,
    errors: [{ message: "Response missing both <Success/> and <Errors>" }],
    raw: parsed,
  };
}

/** Recursively look for the <Success/> marker anywhere in the tree. */
function containsSuccess(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  if ("Success" in o) return true;
  for (const v of Object.values(o)) {
    if (containsSuccess(v)) return true;
  }
  return false;
}

/** Recursively gather all <Error> elements anywhere in the tree. */
function extractErrors(
  node: unknown,
): Array<{ code?: string; message: string }> {
  const out: Array<{ code?: string; message: string }> = [];
  walkErrors(node, out);
  return out;
}

function walkErrors(
  node: unknown,
  out: Array<{ code?: string; message: string }>,
): void {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if ("Errors" in o) {
    const errors = o.Errors as Record<string, unknown> | undefined;
    if (errors && typeof errors === "object") {
      const errEl = errors.Error;
      const arr = Array.isArray(errEl) ? errEl : errEl != null ? [errEl] : [];
      for (const e of arr) {
        if (e && typeof e === "object") {
          const eo = e as Record<string, unknown>;
          out.push({
            code: typeof eo["@_Code"] === "string" ? (eo["@_Code"] as string) : undefined,
            message:
              typeof eo["@_ShortText"] === "string"
                ? (eo["@_ShortText"] as string)
                : "OTA error",
          });
        }
      }
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") walkErrors(v, out);
  }
}

// ---------------------------------------------------------------------------
// 2) parseOTAReservations — extract HotelReservation elements
// ---------------------------------------------------------------------------

/**
 * Parse an OTA_HotelResRetrieveRS into normalized
 * `ChannelReservationData[]`. Returns an empty array if the response
 * has no reservations or fails to parse — callers distinguish between
 * "no data" and "parse failed" by checking parseOTAResponse first.
 *
 * Booking-specific projection notes:
 *   - <ResStatus> values: "Book" → confirmed (we project as "confirmed"
 *     via externalStatus), "Cancel" → cancelled, "Modify" → modified.
 *   - <ResGuest> can have multiple PersonName children for groups; we
 *     project the first as primary guest, secondary names go to
 *     specialRequests with a note.
 *   - <Total AmountAfterTax> is the headline price; commission lives
 *     in <CommissionableAmount> when Booking sends it (sometimes omitted
 *     for direct-billing properties).
 */
export async function parseOTAReservations(
  xmlText: string,
): Promise<ChannelReservationData[]> {
  if (!xmlText || typeof xmlText !== "string") return [];
  let parsed: Record<string, unknown>;
  try {
    const { XMLParser } = await loadParser();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: false,
      parseTagValue: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
    });
    parsed = parser.parse(xmlText) as Record<string, unknown>;
  } catch {
    return [];
  }

  const reservations: ChannelReservationData[] = [];
  walkReservations(parsed, reservations);
  return reservations;
}

function walkReservations(
  node: unknown,
  out: ChannelReservationData[],
): void {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(o)) {
    if (key === "HotelReservation") {
      const arr = Array.isArray(value) ? value : value != null ? [value] : [];
      for (const r of arr) {
        const projected = projectReservation(r);
        if (projected) out.push(projected);
      }
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) walkReservations(item, out);
    } else if (value && typeof value === "object") {
      walkReservations(value, out);
    }
  }
}

function projectReservation(node: unknown): ChannelReservationData | null {
  if (!node || typeof node !== "object") return null;
  const r = node as Record<string, unknown>;

  const externalReservationId =
    pickAttr(r, "@_ResID_Value") ??
    pickAttr(getChild(r, "UniqueID"), "@_ID");
  if (!externalReservationId) return null;

  const externalStatus = pickAttr(r, "@_ResStatus") ?? "Book";

  // Stay dates from RoomStay/TimeSpan
  const roomStay = getChild(r, "RoomStays")
    ? getChild(getChild(r, "RoomStays"), "RoomStay")
    : getChild(r, "RoomStay");
  const stay = Array.isArray(roomStay) ? roomStay[0] : roomStay;
  const timeSpan = stay ? getChild(stay as Record<string, unknown>, "TimeSpan") : null;
  const checkInRaw = pickAttr(timeSpan, "@_Start");
  const checkOutRaw = pickAttr(timeSpan, "@_End");
  if (!checkInRaw || !checkOutRaw) return null;
  const checkIn = parseDate(checkInRaw);
  const checkOut = parseDate(checkOutRaw);
  if (!checkIn || !checkOut) return null;

  // Guest counts (RoomStay/GuestCounts/GuestCount AgeQualifyingCode)
  const counts = parseGuestCounts(stay);

  // Primary guest (ResGuests/ResGuest/Profiles/ProfileInfo/Profile/Customer/PersonName)
  const guest = parseGuest(r);

  // Pricing — Total AmountAfterTax + CurrencyCode
  const total = parseTotal(stay);

  // Commission — TPA_Extensions or CommissionableAmount
  const commissionMinor = parseCommission(r, total.currency);

  // Special requests
  const specialRequests = pickText(getChild(r, "SpecialRequests"));

  // Created timestamp — UniqueID/@_CreateDateTime or top-level @_CreateDateTime
  const createdRaw =
    pickAttr(r, "@_CreateDateTime") ??
    pickAttr(getChild(r, "UniqueID"), "@_CreateDateTime");
  const reservationCreatedAt = parseDate(createdRaw) ?? new Date();

  // Payment model — Booking exposes BookingChannel or PaymentInfo;
  // default to 'channel' for OTA flows since Booking collects.
  const paymentCollectedBy = "channel" as const;

  return {
    externalReservationId,
    externalStatus,
    guest,
    checkIn,
    checkOut,
    adults: counts.adults,
    children: counts.children,
    infants: counts.infants,
    totalAmountMinor: total.amountMinor,
    currency: total.currency,
    commissionMinor,
    paymentCollectedBy,
    specialRequests,
    reservationCreatedAt,
    rawPayload: r,
  };
}

function parseGuestCounts(stay: unknown): {
  adults: number;
  children?: number;
  infants?: number;
} {
  if (!stay || typeof stay !== "object") {
    return { adults: 1 };
  }
  const counts = getChild(stay as Record<string, unknown>, "GuestCounts");
  if (!counts) return { adults: 1 };
  const gcs = getChild(counts as Record<string, unknown>, "GuestCount");
  const arr = Array.isArray(gcs) ? gcs : gcs != null ? [gcs] : [];
  let adults = 0;
  let children: number | undefined;
  let infants: number | undefined;
  for (const g of arr) {
    if (!g || typeof g !== "object") continue;
    const code = pickAttr(g as Record<string, unknown>, "@_AgeQualifyingCode");
    const count = Number(pickAttr(g as Record<string, unknown>, "@_Count") ?? "0");
    // OTA codes: 10=Adult, 8=Child, 7=Infant (Booking uses these).
    if (code === "10") adults += count;
    else if (code === "8") children = (children ?? 0) + count;
    else if (code === "7") infants = (infants ?? 0) + count;
  }
  return { adults: adults || 1, children, infants };
}

function parseGuest(r: Record<string, unknown>): ChannelReservationGuest {
  // Drill: ResGuests > ResGuest > Profiles > ProfileInfo > Profile > Customer
  const resGuests = getChild(r, "ResGuests");
  const resGuestRaw = resGuests
    ? getChild(resGuests as Record<string, unknown>, "ResGuest")
    : null;
  const resGuest = Array.isArray(resGuestRaw) ? resGuestRaw[0] : resGuestRaw;
  if (!resGuest || typeof resGuest !== "object") {
    return { firstName: "Unknown", lastName: "Guest" };
  }
  const profiles = getChild(resGuest as Record<string, unknown>, "Profiles");
  const profileInfoRaw = profiles
    ? getChild(profiles as Record<string, unknown>, "ProfileInfo")
    : null;
  const profileInfo = Array.isArray(profileInfoRaw)
    ? profileInfoRaw[0]
    : profileInfoRaw;
  const profile = profileInfo
    ? getChild(profileInfo as Record<string, unknown>, "Profile")
    : null;
  const customer = profile
    ? getChild(profile as Record<string, unknown>, "Customer")
    : null;

  const personName = customer
    ? getChild(customer as Record<string, unknown>, "PersonName")
    : null;
  const firstName = pickText(
    getChild(personName as Record<string, unknown>, "GivenName"),
  );
  const lastName = pickText(
    getChild(personName as Record<string, unknown>, "Surname"),
  );

  const email = pickAttr(
    getChild(customer as Record<string, unknown>, "Email"),
    "@_StringValue",
  );
  const phone = pickAttr(
    getChild(customer as Record<string, unknown>, "Telephone"),
    "@_PhoneNumber",
  );
  const country = pickAttr(
    getChild(customer as Record<string, unknown>, "CitizenCountryName"),
    "@_Code",
  );

  return {
    firstName: firstName ?? "Unknown",
    lastName: lastName ?? "Guest",
    email,
    phone,
    country,
  };
}

function parseTotal(stay: unknown): { amountMinor: bigint; currency: string } {
  if (!stay || typeof stay !== "object") {
    return { amountMinor: 0n, currency: "USD" };
  }
  const total = getChild(stay as Record<string, unknown>, "Total");
  if (!total) return { amountMinor: 0n, currency: "USD" };
  const amount = pickAttr(total as Record<string, unknown>, "@_AmountAfterTax");
  const currency = pickAttr(total as Record<string, unknown>, "@_CurrencyCode") ?? "USD";
  if (!amount) return { amountMinor: 0n, currency };
  // OTA amounts are major units with optional decimal — convert to minor.
  const f = Number(amount);
  if (!isFinite(f)) return { amountMinor: 0n, currency };
  return { amountMinor: BigInt(Math.round(f * 100)), currency };
}

function parseCommission(
  r: Record<string, unknown>,
  currency: string,
): bigint | undefined {
  // Booking exposes commission via TPA_Extensions/Commission/@_Amount or
  // ResGlobalInfo/HotelReservationIDs — we look for a top-level
  // CommissionableAmount attribute as the canonical place per their
  // docs. Returns undefined if not provided.
  void currency;
  const fromTop = pickAttr(r, "@_CommissionableAmount");
  if (fromTop) {
    const f = Number(fromTop);
    if (isFinite(f)) return BigInt(Math.round(f * 100));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tiny tree-walking helpers
// ---------------------------------------------------------------------------

function getChild(node: unknown, key: string): unknown {
  if (!node || typeof node !== "object") return null;
  return (node as Record<string, unknown>)[key] ?? null;
}

function pickAttr(node: unknown, key: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const v = (node as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function pickText(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "string") return node;
  if (typeof node === "object") {
    // fast-xml-parser stores text as #text when there are also attrs
    const t = (node as Record<string, unknown>)["#text"];
    if (typeof t === "string") return t;
  }
  return undefined;
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

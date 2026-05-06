/**
 * Stage 6.P1.D.3 — Expedia EQC SOAP response parsers.
 *
 * Pure helpers — no I/O. fast-xml-parser is dynamically imported (same
 * lazy-load discipline as the OTA parsers from P1.B). Two categories:
 *
 *   1. parseEQCResponse — generic SOAP envelope success/failure check.
 *      EQC reports failures via <Error> children inside the message
 *      body or as <soap:Fault> at the envelope level.
 *   2. parseEQCBookings — extracts <Booking> elements from a
 *      BookingRetrievalRS into ChannelReservationData.
 *
 * Malformed input never throws — callers receive `success: false` (for
 * envelope checks) or `[]` (for booking extraction).
 */

import type {
  ChannelReservationData,
  ChannelReservationGuest,
} from "../../types";

export interface ParsedEQCResponse {
  success: boolean;
  errors: Array<{ code?: string; message: string }>;
  raw?: unknown;
}

let parserModule: typeof import("fast-xml-parser") | null = null;

async function loadParser() {
  if (parserModule) return parserModule;
  parserModule = await import("fast-xml-parser");
  return parserModule;
}

/** Test-only — reset cache so a test can verify lazy-load behaviour. */
export function __resetEQCParserCacheForTests() {
  parserModule = null;
}

// ---------------------------------------------------------------------------
// 1) parseEQCResponse — generic envelope check
// ---------------------------------------------------------------------------

export async function parseEQCResponse(xmlText: string): Promise<ParsedEQCResponse> {
  if (!xmlText || typeof xmlText !== "string") {
    return { success: false, errors: [{ message: "empty XML response" }] };
  }
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
      // Strip namespace prefixes so `soap:Envelope`, `eqc:Error` etc.
      // collapse to plain element names — saves us repeating the namespace
      // dance in every walker.
      removeNSPrefix: true,
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
  if (containsSuccess(parsed)) {
    return { success: true, errors: [], raw: parsed };
  }
  return {
    success: false,
    errors: [{ message: "Response missing both Success and Errors" }],
    raw: parsed,
  };
}

function containsSuccess(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  // EQC marks success via either a top-level <Success/> or the absence
  // of <Error> with HTTP 200. We treat presence of any `Success` key
  // as the positive marker; absence-with-no-errors is handled by the
  // caller (parseEQCResponse).
  if ("Success" in o) return true;
  for (const v of Object.values(o)) {
    if (containsSuccess(v)) return true;
  }
  return false;
}

function extractErrors(node: unknown): Array<{ code?: string; message: string }> {
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
  // EQC uses both <Error code="..." message="..."/> at message level
  // and <Fault><faultcode>...</faultcode><faultstring>...</faultstring></Fault>
  // at SOAP envelope level. Cover both.
  for (const [key, value] of Object.entries(o)) {
    if (key === "Error") {
      const arr = Array.isArray(value) ? value : value != null ? [value] : [];
      for (const e of arr) {
        if (e && typeof e === "object") {
          const eo = e as Record<string, unknown>;
          out.push({
            code: pickAttr(eo, "@_code") ?? pickAttr(eo, "@_Code"),
            message:
              pickAttr(eo, "@_message") ??
              pickAttr(eo, "@_ShortText") ??
              pickText(eo) ??
              "EQC error",
          });
        }
      }
    } else if (key === "Fault") {
      const fo = value as Record<string, unknown> | undefined;
      if (fo) {
        out.push({
          code: pickText(fo["faultcode"]) ?? "fault",
          message: pickText(fo["faultstring"]) ?? "SOAP fault",
        });
      }
    } else if (Array.isArray(value)) {
      for (const item of value) walkErrors(item, out);
    } else if (value && typeof value === "object") {
      walkErrors(value, out);
    }
  }
}

// ---------------------------------------------------------------------------
// 2) parseEQCBookings — extract <Booking> elements
// ---------------------------------------------------------------------------

export async function parseEQCBookings(
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
      removeNSPrefix: true,
    });
    parsed = parser.parse(xmlText) as Record<string, unknown>;
  } catch {
    return [];
  }
  const bookings: ChannelReservationData[] = [];
  walkBookings(parsed, bookings);
  return bookings;
}

function walkBookings(
  node: unknown,
  out: ChannelReservationData[],
): void {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(o)) {
    if (key === "Booking") {
      const arr = Array.isArray(value) ? value : value != null ? [value] : [];
      for (const b of arr) {
        const projected = projectBooking(b);
        if (projected) out.push(projected);
      }
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) walkBookings(item, out);
    } else if (value && typeof value === "object") {
      walkBookings(value, out);
    }
  }
}

function projectBooking(node: unknown): ChannelReservationData | null {
  if (!node || typeof node !== "object") return null;
  const b = node as Record<string, unknown>;

  const externalReservationId =
    pickAttr(b, "@_id") ?? pickAttr(b, "@_BookingID");
  if (!externalReservationId) return null;

  const externalStatus = pickAttr(b, "@_type") ?? pickAttr(b, "@_status") ?? "Book";

  const stayDates = (b["StayDates"] ?? b["RoomStay"]) as
    | Record<string, unknown>
    | undefined;
  const checkInRaw = pickAttr(stayDates, "@_arrival") ?? pickAttr(stayDates, "@_from");
  const checkOutRaw =
    pickAttr(stayDates, "@_departure") ?? pickAttr(stayDates, "@_to");
  if (!checkInRaw || !checkOutRaw) return null;
  const checkIn = parseDate(checkInRaw);
  const checkOut = parseDate(checkOutRaw);
  if (!checkIn || !checkOut) return null;

  const guest = parseGuest(b);
  const counts = parseGuestCounts(b);
  const total = parseTotal(b);

  const createdRaw =
    pickAttr(b, "@_createDateTime") ?? pickAttr(b, "@_creationDate");
  const reservationCreatedAt = parseDate(createdRaw) ?? new Date();

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
    commissionMinor: total.commissionMinor,
    paymentCollectedBy: "channel",
    specialRequests: pickText(b["SpecialRequests"]),
    reservationCreatedAt,
    rawPayload: b,
  };
}

function parseGuest(b: Record<string, unknown>): ChannelReservationGuest {
  const guestObj = (b["PrimaryGuest"] ?? b["Guest"]) as
    | Record<string, unknown>
    | undefined;
  if (!guestObj) {
    return { firstName: "Unknown", lastName: "Guest" };
  }
  const nameObj = guestObj["Name"] as Record<string, unknown> | undefined;
  const firstName =
    pickAttr(nameObj, "@_givenName") ??
    pickText(nameObj?.["GivenName"]);
  const lastName =
    pickAttr(nameObj, "@_surname") ?? pickText(nameObj?.["Surname"]);
  const email =
    pickAttr(guestObj["Email"], "@_value") ??
    pickText(guestObj["Email"]);
  const phone =
    pickAttr(guestObj["Phone"], "@_value") ?? pickText(guestObj["Phone"]);
  const country =
    pickAttr(guestObj["Address"], "@_country") ??
    pickAttr(guestObj, "@_country");

  return {
    firstName: firstName ?? "Unknown",
    lastName: lastName ?? "Guest",
    email,
    phone,
    country,
  };
}

function parseGuestCounts(b: Record<string, unknown>): {
  adults: number;
  children?: number;
  infants?: number;
} {
  const stay = (b["StayDates"] ?? b["RoomStay"]) as
    | Record<string, unknown>
    | undefined;
  const numAdults =
    Number(pickAttr(stay, "@_adults") ?? pickAttr(b, "@_numAdults") ?? "0") ||
    0;
  const numChildren =
    Number(pickAttr(stay, "@_children") ?? pickAttr(b, "@_numChildren") ?? "0") ||
    0;
  return {
    adults: numAdults || 1,
    children: numChildren || undefined,
  };
}

function parseTotal(b: Record<string, unknown>): {
  amountMinor: bigint;
  currency: string;
  commissionMinor?: bigint;
} {
  const total = b["Total"] as Record<string, unknown> | undefined;
  const amountRaw =
    pickAttr(total, "@_amountAfterTax") ?? pickAttr(total, "@_amount");
  const currency = pickAttr(total, "@_currency") ?? "USD";
  const commissionRaw = pickAttr(total, "@_commission");
  return {
    amountMinor: amountToMinor(amountRaw),
    currency,
    commissionMinor: commissionRaw ? amountToMinor(commissionRaw) : undefined,
  };
}

function amountToMinor(s: string | undefined): bigint {
  if (!s) return 0n;
  const f = Number(s);
  return isFinite(f) ? BigInt(Math.round(f * 100)) : 0n;
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

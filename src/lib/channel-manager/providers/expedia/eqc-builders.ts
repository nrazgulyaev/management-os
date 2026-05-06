/**
 * Stage 6.P1.D.3 — Expedia Quick Connect (EQC) SOAP request builders.
 *
 * Pure helpers — no I/O. EQC is a SOAP service with custom envelope
 * elements per message type. The builders here cover the AR
 * (Availability + Rates) and Booking pull messages used by the
 * provider's pushAvailability / pushRates / pullReservations methods.
 *
 * SOAP authentication is handled at the HTTP layer (HTTP Basic with
 * eqcUsername / eqcPassword); these builders just shape the body.
 *
 * EQC reference: Expedia Quick Connect Implementation Guide
 * (the AR + Booking message specs). Builders match the production
 * shapes operators submit today; tests assert the exact element
 * structure so a future spec drift surfaces in CI.
 */

export interface EQCAvailabilityInput {
  hotelId: string;
  roomId: string;
  ratePlanId: string;
  ranges: Array<{
    start: Date;
    end: Date;
    /** Units available for sale on this date span. */
    availability: number;
  }>;
  username: string;
  password: string;
  timestamp: Date;
}

export interface EQCRatesInput {
  hotelId: string;
  roomId: string;
  ratePlanId: string;
  ranges: Array<{
    start: Date;
    end: Date;
    amount: number;
    currency: string;
  }>;
  username: string;
  password: string;
  timestamp: Date;
}

export interface EQCBookingPullInput {
  hotelId: string;
  username: string;
  password: string;
  timestamp: Date;
  /** ISO instant — only fetch bookings modified since this point. */
  modifiedSince?: Date;
}

// ---------------------------------------------------------------------------
// XML escaping — same 5 entities as OTA
// ---------------------------------------------------------------------------

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimestamp(d: Date): string {
  return d.toISOString();
}

/**
 * Standard EQC Authentication header element. EQC sends credentials
 * inside the SOAP envelope as well as via HTTP Basic (per their docs;
 * defense in depth) — we include both.
 */
function authHeader(username: string, password: string): string {
  return `      <Authentication>
        <Username>${escapeXml(username)}</Username>
        <Password>${escapeXml(password)}</Password>
      </Authentication>`;
}

// ---------------------------------------------------------------------------
// 1) AR (Availability + Rates) — push availability
// ---------------------------------------------------------------------------

/**
 * EQC AR message for availability-only updates. AR can carry both
 * availability + rates in one envelope; we ship them as separate
 * messages so a single failed range doesn't roll back the other.
 */
export function buildEQCAvailability(input: EQCAvailabilityInput): string {
  if (!input.hotelId) throw new Error("buildEQCAvailability: hotelId required");
  if (!input.roomId) throw new Error("buildEQCAvailability: roomId required");
  if (input.ranges.length === 0) {
    throw new Error("buildEQCAvailability: at least one range required");
  }
  const updates = input.ranges
    .map(
      (r) => `      <AvailabilityUpdate from="${formatDate(r.start)}" to="${formatDate(r.end)}">
        <RoomType id="${escapeXml(input.roomId)}">
          <Inventory totalInventoryAvailable="${Math.max(0, Math.floor(r.availability))}"/>
        </RoomType>
      </AvailabilityUpdate>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
${authHeader(input.username, input.password)}
  </soap:Header>
  <soap:Body>
    <AvailRateUpdateRQ xmlns="http://www.expediaconnect.com/EQC/AR/2011/06" timestamp="${formatTimestamp(input.timestamp)}">
      <Hotel id="${escapeXml(input.hotelId)}"/>
${updates}
    </AvailRateUpdateRQ>
  </soap:Body>
</soap:Envelope>`;
}

// ---------------------------------------------------------------------------
// 2) AR — push rates
// ---------------------------------------------------------------------------

export function buildEQCRates(input: EQCRatesInput): string {
  if (!input.hotelId) throw new Error("buildEQCRates: hotelId required");
  if (!input.roomId) throw new Error("buildEQCRates: roomId required");
  if (!input.ratePlanId) {
    throw new Error("buildEQCRates: ratePlanId required");
  }
  if (input.ranges.length === 0) {
    throw new Error("buildEQCRates: at least one range required");
  }
  const updates = input.ranges
    .map(
      (r) => `      <RateUpdate from="${formatDate(r.start)}" to="${formatDate(r.end)}">
        <RoomType id="${escapeXml(input.roomId)}">
          <RatePlan id="${escapeXml(input.ratePlanId)}">
            <Rate currency="${escapeXml(r.currency)}" amountAfterTax="${r.amount.toFixed(2)}"/>
          </RatePlan>
        </RoomType>
      </RateUpdate>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
${authHeader(input.username, input.password)}
  </soap:Header>
  <soap:Body>
    <AvailRateUpdateRQ xmlns="http://www.expediaconnect.com/EQC/AR/2011/06" timestamp="${formatTimestamp(input.timestamp)}">
      <Hotel id="${escapeXml(input.hotelId)}"/>
${updates}
    </AvailRateUpdateRQ>
  </soap:Body>
</soap:Envelope>`;
}

// ---------------------------------------------------------------------------
// 3) Booking pull — retrieve reservations
// ---------------------------------------------------------------------------

/**
 * BookingRetrieval message. EQC returns a stream of <Booking> elements
 * the parser projects into ChannelReservationData[]. `modifiedSince`
 * narrows the fetch window.
 */
export function buildEQCBookingPull(input: EQCBookingPullInput): string {
  if (!input.hotelId) {
    throw new Error("buildEQCBookingPull: hotelId required");
  }
  const sinceAttr = input.modifiedSince
    ? ` lastUpdated="${formatTimestamp(input.modifiedSince)}"`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
${authHeader(input.username, input.password)}
  </soap:Header>
  <soap:Body>
    <BookingRetrievalRQ xmlns="http://www.expediaconnect.com/EQC/BR/2014/01" timestamp="${formatTimestamp(input.timestamp)}">
      <Hotel id="${escapeXml(input.hotelId)}"${sinceAttr}/>
    </BookingRetrievalRQ>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Stage 6.P1.B — OpenTravel Alliance (OTA) XML request builders for
 * Booking.com.
 *
 * Pure helpers — no I/O, no fetch. Output is a plain XML string the
 * client wraps in an HTTP request. Builders escape user-supplied values
 * so injection of XML markup via a hotel ID, room ID, or rate amount
 * is impossible.
 *
 * OTA spec reference: OpenTravel 2003B Hotel messages. Booking.com's
 * supplier docs document the exact fields they consume; everything else
 * is defaulted or omitted. Where Booking expects a deviation from the
 * generic OTA spec, the comment notes "Booking-specific".
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export interface AvailNotifInput {
  hotelId: string;
  /** Room/inventory type code on Booking — sometimes the same as hotelId
   *  for single-room properties. */
  roomId: string;
  ranges: Array<DateRange & { availability: number }>;
  /** ISO timestamp for the request envelope. Caller passes `new Date()`
   *  in production; tests pass a frozen date for deterministic output. */
  timestamp: Date;
}

export interface RateNotifInput {
  hotelId: string;
  roomId: string;
  ratePlanId: string;
  ranges: Array<DateRange & { amount: number; currency: string }>;
  timestamp: Date;
}

export interface ResRetrieveInput {
  hotelId: string;
  /** Only fetch reservations modified since this ISO instant. */
  modifiedSince?: Date;
  /** Booking caps page size at 200; we cap at 100 by default. */
  limit?: number;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// XML escaping — handles all 5 entities OTA-relevant (& < > " ')
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
  // OTA dates are YYYY-MM-DD. Use UTC so a server in a non-UTC timezone
  // doesn't shift the date by one day.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimestamp(d: Date): string {
  // OTA TimeStamp is ISO 8601. Booking requires UTC with the trailing Z.
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// 1) OTA_HotelInvCountNotifRQ — push availability
// ---------------------------------------------------------------------------

/**
 * Builds an OTA_HotelInvCountNotifRQ. Each range becomes an <Inventory>
 * block with a <StatusApplicationControl> for the date span and one
 * <InvCount> reporting the available unit count.
 *
 * `CountType="2"` is the OTA code for "available" (vs sold/blocked).
 * Booking treats Count="0" as "close out" — same effect as a manual
 * stop-sell, but reversible by pushing a positive count.
 */
export function buildOTAAvailNotif(input: AvailNotifInput): string {
  if (!input.hotelId) throw new Error("buildOTAAvailNotif: hotelId required");
  if (!input.roomId) throw new Error("buildOTAAvailNotif: roomId required");
  if (input.ranges.length === 0) {
    throw new Error("buildOTAAvailNotif: at least one range required");
  }
  const inventories = input.ranges
    .map(
      (r) => `    <Inventory>
      <StatusApplicationControl Start="${formatDate(r.start)}" End="${formatDate(r.end)}" InvTypeCode="${escapeXml(input.roomId)}"/>
      <InvCounts>
        <InvCount CountType="2" Count="${Math.max(0, Math.floor(r.availability))}"/>
      </InvCounts>
    </Inventory>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelInvCountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${formatTimestamp(input.timestamp)}">
  <Inventories HotelCode="${escapeXml(input.hotelId)}">
${inventories}
  </Inventories>
</OTA_HotelInvCountNotifRQ>`;
}

// ---------------------------------------------------------------------------
// 2) OTA_HotelRateAmountNotifRQ — push rates
// ---------------------------------------------------------------------------

/**
 * Builds an OTA_HotelRateAmountNotifRQ. Each range becomes a <Rate>
 * block with a <BaseByGuestAmts> child carrying the per-night amount
 * + currency. AmountAfterTax is the tax-inclusive rate the guest sees;
 * Booking-specific note: we use AmountAfterTax (not AmountBeforeTax)
 * so the displayed price is what the operator set. Tax handling moves
 * to Booking's separate tax-policy endpoint, not relevant here.
 */
export function buildOTARateNotif(input: RateNotifInput): string {
  if (!input.hotelId) throw new Error("buildOTARateNotif: hotelId required");
  if (!input.roomId) throw new Error("buildOTARateNotif: roomId required");
  if (!input.ratePlanId) {
    throw new Error("buildOTARateNotif: ratePlanId required");
  }
  if (input.ranges.length === 0) {
    throw new Error("buildOTARateNotif: at least one range required");
  }
  const rates = input.ranges
    .map(
      (r) => `    <Rate Start="${formatDate(r.start)}" End="${formatDate(r.end)}" RatePlanCode="${escapeXml(input.ratePlanId)}" InvTypeCode="${escapeXml(input.roomId)}">
      <BaseByGuestAmts>
        <BaseByGuestAmt AmountAfterTax="${r.amount.toFixed(2)}" CurrencyCode="${escapeXml(r.currency)}"/>
      </BaseByGuestAmts>
    </Rate>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${formatTimestamp(input.timestamp)}">
  <RateAmountMessages HotelCode="${escapeXml(input.hotelId)}">
${rates}
  </RateAmountMessages>
</OTA_HotelRateAmountNotifRQ>`;
}

// ---------------------------------------------------------------------------
// 3) OTA_HotelResRetrieveRQ — pull reservations
// ---------------------------------------------------------------------------

/**
 * Builds an OTA_HotelResRetrieveRQ for fetching reservations changed
 * since a given timestamp. Booking-specific: when `modifiedSince` is
 * omitted the request returns the last 24h (Booking's default) — we
 * make that explicit in the comment so callers don't accidentally
 * pull years of history.
 *
 * `MaxResponses` caps the page size; Booking returns a continuation
 * token in the response when there's more, but the parser handles
 * that — builders only generate one request at a time.
 */
export function buildOTAResRetrieve(input: ResRetrieveInput): string {
  if (!input.hotelId) throw new Error("buildOTAResRetrieve: hotelId required");
  const limit = Math.min(Math.max(1, input.limit ?? 100), 200);
  const sinceAttr = input.modifiedSince
    ? ` LastModifyDateTime="${formatTimestamp(input.modifiedSince)}"`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResRetrieveRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${formatTimestamp(input.timestamp)}" MaxResponses="${limit}">
  <ReadRequests>
    <HotelReadRequest HotelCode="${escapeXml(input.hotelId)}"${sinceAttr}>
      <SelectionCriteria SelectionType="Departure"/>
    </HotelReadRequest>
  </ReadRequests>
</OTA_HotelResRetrieveRQ>`;
}

/**
 * Stage 6.P1.B — Booking.com ChannelManagerProvider implementation.
 *
 * Wraps BookingComClient + OTA parsers behind the unified
 * ChannelManagerProvider interface so the rest of the platform never
 * touches XML directly. Failures degrade to a SyncResult with
 * `success: false` + structured errors — the caller persists those into
 * channel_sync_log and the UI surfaces them in the integrations health
 * hub.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AmenitiesInput,
  AvailabilityInput,
  ChannelManagerProvider,
  ChannelName,
  ChannelReservationData,
  ConnectionTestResult,
  PullReservationsInput,
  RatesInput,
  SyncResult,
  WebhookEvent,
  WebhookEventType,
} from "../../types";
import {
  BookingComClient,
  type BookingComClientOptions,
  type BookingComCredentials,
} from "./client";
import { parseOTAResponse, parseOTAReservations } from "./ota-parsers";

const CHANNEL_NAME: ChannelName = "booking_com";

export class BookingComProvider implements ChannelManagerProvider {
  readonly name: ChannelName = CHANNEL_NAME;
  private readonly client: BookingComClient;

  constructor(
    credentials: BookingComCredentials,
    clientOptions: BookingComClientOptions = {},
  ) {
    this.client = new BookingComClient(credentials, clientOptions);
  }

  // -------------------------------------------------------------------------
  // pushAvailability
  // -------------------------------------------------------------------------

  async pushAvailability(input: AvailabilityInput): Promise<SyncResult> {
    const start = Date.now();
    const ranges = mapAvailabilityToRanges(input);
    if (ranges.length === 0) {
      return zeroResult(start);
    }
    try {
      const res = await this.client.pushAvailability({
        roomId: input.externalPropertyId,
        ranges,
      });
      const parsed = await parseOTAResponse(res.body);
      const recordCount = input.availabilityPerDay.size;
      if (parsed.success) {
        return {
          success: true,
          recordsProcessed: recordCount,
          recordsSucceeded: recordCount,
          recordsFailed: 0,
          errors: [],
          durationMs: Date.now() - start,
          apiCallsCount: res.apiCallsCount,
        };
      }
      return {
        success: false,
        recordsProcessed: recordCount,
        recordsSucceeded: 0,
        recordsFailed: recordCount,
        errors: parsed.errors.map((e) => ({
          field: e.code,
          message: e.message,
        })),
        durationMs: Date.now() - start,
        apiCallsCount: res.apiCallsCount,
      };
    } catch (err) {
      return errorResult(start, input.availabilityPerDay.size, err);
    }
  }

  // -------------------------------------------------------------------------
  // pushRates
  // -------------------------------------------------------------------------

  async pushRates(input: RatesInput): Promise<SyncResult> {
    const start = Date.now();
    const ranges = mapRatesToRanges(input);
    if (ranges.length === 0) {
      return zeroResult(start);
    }
    try {
      const res = await this.client.pushRates({
        roomId: input.externalPropertyId,
        ratePlanId: input.ratePlanId,
        ranges,
      });
      const parsed = await parseOTAResponse(res.body);
      const recordCount = input.ratesPerDay.size;
      if (parsed.success) {
        return {
          success: true,
          recordsProcessed: recordCount,
          recordsSucceeded: recordCount,
          recordsFailed: 0,
          errors: [],
          durationMs: Date.now() - start,
          apiCallsCount: res.apiCallsCount,
        };
      }
      return {
        success: false,
        recordsProcessed: recordCount,
        recordsSucceeded: 0,
        recordsFailed: recordCount,
        errors: parsed.errors.map((e) => ({
          field: e.code,
          message: e.message,
        })),
        durationMs: Date.now() - start,
        apiCallsCount: res.apiCallsCount,
      };
    } catch (err) {
      return errorResult(start, input.ratesPerDay.size, err);
    }
  }

  // -------------------------------------------------------------------------
  // pushAmenities
  // -------------------------------------------------------------------------

  async pushAmenities(input: AmenitiesInput): Promise<SyncResult> {
    const start = Date.now();
    if (input.amenities.length === 0) return zeroResult(start);
    try {
      const res = await this.client.pushAmenities(input.amenities);
      // The amenities endpoint returns JSON. 200 = success; everything
      // else = failure with the body as an error message.
      if (res.status >= 200 && res.status < 300) {
        return {
          success: true,
          recordsProcessed: input.amenities.length,
          recordsSucceeded: input.amenities.length,
          recordsFailed: 0,
          errors: [],
          durationMs: Date.now() - start,
          apiCallsCount: res.apiCallsCount,
        };
      }
      return {
        success: false,
        recordsProcessed: input.amenities.length,
        recordsSucceeded: 0,
        recordsFailed: input.amenities.length,
        errors: [
          { message: `HTTP ${res.status}: ${truncate(res.body, 240)}` },
        ],
        durationMs: Date.now() - start,
        apiCallsCount: res.apiCallsCount,
      };
    } catch (err) {
      return errorResult(start, input.amenities.length, err);
    }
  }

  // -------------------------------------------------------------------------
  // pullReservations
  // -------------------------------------------------------------------------

  async pullReservations(
    input: PullReservationsInput,
  ): Promise<ChannelReservationData[]> {
    // externalPropertyId is the same as creds.hotelId — Booking ignores
    // any other value but we keep the param to honor the interface.
    void input.externalPropertyId;
    const res = await this.client.pullReservations({
      modifiedSince: input.modifiedSince,
      limit: input.limit,
    });
    if (res.status < 200 || res.status >= 300) {
      // Non-2xx → no reservations to project. Caller checks the
      // sync_log for the failure reason; we don't throw here so a
      // single bad pull doesn't kill an entire cron run.
      return [];
    }
    return parseOTAReservations(res.body);
  }

  // -------------------------------------------------------------------------
  // verifyWebhook — HMAC-SHA256, constant-time
  // -------------------------------------------------------------------------

  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    if (!secret || !signature) return false;
    try {
      const computed = createHmac("sha256", secret).update(payload).digest("hex");
      // Strip a leading "sha256=" prefix if Booking sends it that way —
      // some channel webhooks adopt the GitHub convention.
      const provided = signature.startsWith("sha256=")
        ? signature.slice("sha256=".length)
        : signature;
      if (provided.length !== computed.length) return false;
      return timingSafeEqual(
        Buffer.from(provided, "utf8"),
        Buffer.from(computed, "utf8"),
      );
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // parseWebhook — Booking webhook payload → normalized event
  // -------------------------------------------------------------------------

  parseWebhook(payload: Record<string, unknown>): WebhookEvent | null {
    const eventType = payload["event"] ?? payload["event_type"];
    if (typeof eventType !== "string") return null;

    const mapped = mapBookingEventType(eventType);
    if (!mapped) return null;

    const reservationId =
      pickString(payload, "reservation_id") ??
      pickString(payload, "reservationId") ??
      pickString(payload, "external_reservation_id");

    const timestampRaw =
      pickString(payload, "timestamp") ??
      pickString(payload, "occurred_at") ??
      new Date().toISOString();
    const timestamp = new Date(timestampRaw);

    return {
      type: mapped,
      externalReservationId: reservationId,
      payload,
      // Caller passes the original signature header value to
      // verifyWebhook before invoking this. parseWebhook itself
      // doesn't re-verify — it just normalizes the structure.
      signature:
        typeof payload["__signature"] === "string"
          ? (payload["__signature"] as string)
          : "",
      timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
    };
  }

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const res = await this.client.testConnection();
      return {
        connected: res.status >= 200 && res.status < 300,
        details: {
          channel: CHANNEL_NAME,
          status: res.status,
          // Body summary only — never echo full diagnostics that
          // could leak credentials in error paths.
          bodyPreview: truncate(res.body, 240),
        },
      };
    } catch (err) {
      return {
        connected: false,
        details: {
          channel: CHANNEL_NAME,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers (file-private)
// ---------------------------------------------------------------------------

function mapBookingEventType(raw: string): WebhookEventType | null {
  // Booking's event names: "reservation_new", "reservation_modified",
  // "reservation_cancelled", "rate_modified", "inventory_modified".
  // Some legacy channels use dot notation already — accept both shapes.
  switch (raw) {
    case "reservation_new":
    case "reservation.new":
    case "reservation_created":
    case "reservation.created":
      return "reservation.created";
    case "reservation_modified":
    case "reservation.modified":
      return "reservation.modified";
    case "reservation_cancelled":
    case "reservation.cancelled":
    case "reservation_canceled":
      return "reservation.cancelled";
    case "rate_modified":
    case "rate.modified":
      return "rate.modified";
    case "inventory_modified":
    case "inventory.modified":
      return "inventory.modified";
    default:
      return null;
  }
}

function pickString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Convert AvailabilityInput.availabilityPerDay (Map<isoDate, count>) into
 * contiguous date ranges with the same availability count. Reduces the
 * number of <Inventory> blocks we send to Booking — fewer XML fragments
 * = smaller request + faster processing on their side.
 */
export function mapAvailabilityToRanges(
  input: AvailabilityInput,
): Array<{ start: Date; end: Date; availability: number }> {
  const sortedKeys = [...input.availabilityPerDay.keys()].sort();
  if (sortedKeys.length === 0) return [];
  const out: Array<{ start: Date; end: Date; availability: number }> = [];
  let runStart = sortedKeys[0];
  let runEnd = sortedKeys[0];
  let runAvail = input.availabilityPerDay.get(runStart)!;
  for (let i = 1; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const avail = input.availabilityPerDay.get(key)!;
    if (avail === runAvail && isNextDay(runEnd, key)) {
      runEnd = key;
    } else {
      out.push({
        start: parseIsoDate(runStart),
        end: parseIsoDate(runEnd),
        availability: runAvail,
      });
      runStart = key;
      runEnd = key;
      runAvail = avail;
    }
  }
  out.push({
    start: parseIsoDate(runStart),
    end: parseIsoDate(runEnd),
    availability: runAvail,
  });
  return out;
}

/**
 * Same coalescing strategy for rates. Currency must match across a run
 * for it to coalesce; rate amount must match exactly (no float fudge —
 * operators set rates in whole cents).
 */
export function mapRatesToRanges(
  input: RatesInput,
): Array<{ start: Date; end: Date; amount: number; currency: string }> {
  const sortedKeys = [...input.ratesPerDay.keys()].sort();
  if (sortedKeys.length === 0) return [];
  const out: Array<{
    start: Date;
    end: Date;
    amount: number;
    currency: string;
  }> = [];
  let runStart = sortedKeys[0];
  let runEnd = sortedKeys[0];
  let runRate = input.ratesPerDay.get(runStart)!;
  for (let i = 1; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const rate = input.ratesPerDay.get(key)!;
    if (
      rate.amountMinor === runRate.amountMinor &&
      rate.currency === runRate.currency &&
      isNextDay(runEnd, key)
    ) {
      runEnd = key;
    } else {
      out.push({
        start: parseIsoDate(runStart),
        end: parseIsoDate(runEnd),
        amount: Number(runRate.amountMinor) / 100,
        currency: runRate.currency,
      });
      runStart = key;
      runEnd = key;
      runRate = rate;
    }
  }
  out.push({
    start: parseIsoDate(runStart),
    end: parseIsoDate(runEnd),
    amount: Number(runRate.amountMinor) / 100,
    currency: runRate.currency,
  });
  return out;
}

function parseIsoDate(s: string): Date {
  // Caller passes YYYY-MM-DD; new Date(YYYY-MM-DD) parses as UTC midnight.
  return new Date(s);
}

function isNextDay(prevIso: string, currIso: string): boolean {
  const prev = parseIsoDate(prevIso);
  const curr = parseIsoDate(currIso);
  return curr.getTime() - prev.getTime() === 24 * 60 * 60 * 1000;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function zeroResult(start: number): SyncResult {
  return {
    success: true,
    recordsProcessed: 0,
    recordsSucceeded: 0,
    recordsFailed: 0,
    errors: [],
    durationMs: Date.now() - start,
    apiCallsCount: 0,
  };
}

function errorResult(
  start: number,
  recordCount: number,
  err: unknown,
): SyncResult {
  return {
    success: false,
    recordsProcessed: recordCount,
    recordsSucceeded: 0,
    recordsFailed: recordCount,
    errors: [{ message: err instanceof Error ? err.message : String(err) }],
    durationMs: Date.now() - start,
    apiCallsCount: 0,
  };
}

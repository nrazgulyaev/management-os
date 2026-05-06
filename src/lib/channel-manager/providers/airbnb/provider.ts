/**
 * Stage 6.P1.C — Airbnb ChannelManagerProvider implementation.
 *
 * Wraps AirbnbClient + JSON mappers behind the unified
 * ChannelManagerProvider interface. Same shape discipline as
 * BookingComProvider: errors degrade to SyncResult{success:false}
 * rather than throwing — single bad call doesn't kill a cron run.
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
  AirbnbClient,
  type AirbnbClientOptions,
  type AirbnbCredentials,
} from "./client";
import { mapAirbnbReservationToInternal } from "./mappers";

const CHANNEL_NAME: ChannelName = "airbnb";

export class AirbnbProvider implements ChannelManagerProvider {
  readonly name: ChannelName = CHANNEL_NAME;
  private readonly client: AirbnbClient;

  constructor(
    credentials: AirbnbCredentials,
    clientOptions: AirbnbClientOptions = {},
  ) {
    this.client = new AirbnbClient(credentials, clientOptions);
  }

  // -------------------------------------------------------------------------
  // pushAvailability — uses calendar endpoint
  // -------------------------------------------------------------------------

  async pushAvailability(input: AvailabilityInput): Promise<SyncResult> {
    const start = Date.now();
    const recordCount = input.availabilityPerDay.size;
    if (recordCount === 0) return zeroResult(start);
    try {
      const res = await this.client.pushCalendar(input);
      return projectHttpResult(res, recordCount, start);
    } catch (err) {
      return errorResult(start, recordCount, err);
    }
  }

  // -------------------------------------------------------------------------
  // pushRates — uses pricing endpoint
  // -------------------------------------------------------------------------

  async pushRates(input: RatesInput): Promise<SyncResult> {
    const start = Date.now();
    const recordCount = input.ratesPerDay.size;
    if (recordCount === 0) return zeroResult(start);
    try {
      const res = await this.client.pushPricing(input);
      return projectHttpResult(res, recordCount, start);
    } catch (err) {
      return errorResult(start, recordCount, err);
    }
  }

  // -------------------------------------------------------------------------
  // pushAmenities
  // -------------------------------------------------------------------------

  async pushAmenities(input: AmenitiesInput): Promise<SyncResult> {
    const start = Date.now();
    if (input.amenities.length === 0) return zeroResult(start);
    try {
      const res = await this.client.pushAmenities(
        input.externalPropertyId,
        input.amenities,
      );
      return projectHttpResult(res, input.amenities.length, start);
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
    let res;
    try {
      res = await this.client.pullReservations({
        listingId: input.externalPropertyId,
        modifiedSince: input.modifiedSince,
        limit: input.limit,
      });
    } catch {
      // Network/timeout failure — single bad pull shouldn't kill cron.
      return [];
    }
    if (res.status < 200 || res.status >= 300) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      return [];
    }
    const list = extractReservationList(parsed);
    const out: ChannelReservationData[] = [];
    for (const item of list) {
      const projected = mapAirbnbReservationToInternal(item);
      if (projected) out.push(projected);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // verifyWebhook — Airbnb uses HMAC-SHA256 in X-Airbnb-Signature
  // -------------------------------------------------------------------------

  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    if (!secret || !signature) return false;
    try {
      const computed = createHmac("sha256", secret).update(payload).digest("hex");
      // Airbnb's documented format is `sha256=<hex>` but some legacy
      // payloads ship the raw hex — accept both.
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
  // parseWebhook — Airbnb event categories → canonical types
  // -------------------------------------------------------------------------

  parseWebhook(payload: Record<string, unknown>): WebhookEvent | null {
    // Airbnb webhooks come in two shapes depending on API version:
    //   1. Top-level `event` string ("reservation_request", etc.)
    //   2. Object: { category: "reservation", type: "request" | "accept" | ... }
    // Map both to the canonical WebhookEventType.
    let raw: string | undefined;
    if (typeof payload["event"] === "string") {
      raw = payload["event"] as string;
    } else if (
      typeof payload["category"] === "string" &&
      typeof payload["type"] === "string"
    ) {
      raw = `${payload["category"]}_${payload["type"]}`;
    }
    if (!raw) return null;
    const mapped = mapAirbnbEventType(raw);
    if (!mapped) return null;

    const reservationId =
      pickString(payload, "reservation_id") ??
      pickString(payload, "confirmation_code") ??
      (() => {
        const r = payload["reservation"];
        if (r && typeof r === "object") {
          return (
            pickString(r as Record<string, unknown>, "confirmation_code") ??
            pickString(r as Record<string, unknown>, "id")
          );
        }
        return undefined;
      })();

    const timestampRaw =
      pickString(payload, "timestamp") ?? pickString(payload, "occurred_at");
    const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();

    return {
      type: mapped,
      externalReservationId: reservationId,
      payload,
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

function mapAirbnbEventType(raw: string): WebhookEventType | null {
  // Airbnb's event vocabulary varies between API versions. Cover the
  // documented names + the underscore-form combinations from the
  // category+type webhook shape.
  switch (raw) {
    case "reservation_request":
    case "reservation_pending":
    case "reservation.created":
      return "reservation.created";
    case "reservation_accept":
    case "reservation_alteration":
    case "reservation_modified":
    case "reservation.modified":
      return "reservation.modified";
    case "reservation_cancellation":
    case "reservation_cancellation_by_host":
    case "reservation_cancellation_by_guest":
    case "reservation_cancelled":
    case "reservation.cancelled":
      return "reservation.cancelled";
    case "rate_modified":
    case "pricing_updated":
      return "rate.modified";
    case "calendar_modified":
    case "inventory_modified":
      return "inventory.modified";
    default:
      return null;
  }
}

function extractReservationList(parsed: unknown): Array<Record<string, unknown>> {
  if (!parsed || typeof parsed !== "object") return [];
  const o = parsed as Record<string, unknown>;
  const list =
    (Array.isArray(o["reservations"]) && o["reservations"]) ||
    (Array.isArray(o["data"]) && o["data"]) ||
    (Array.isArray(o["results"]) && o["results"]) ||
    (Array.isArray(parsed) && parsed) ||
    [];
  return (list as unknown[]).filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object",
  );
}

function projectHttpResult(
  res: { status: number; body: string; apiCallsCount: number },
  recordCount: number,
  start: number,
): SyncResult {
  if (res.status >= 200 && res.status < 300) {
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
    errors: [{ message: `HTTP ${res.status}: ${truncate(res.body, 240)}` }],
    durationMs: Date.now() - start,
    apiCallsCount: res.apiCallsCount,
  };
}

function pickString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" ? v : undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
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

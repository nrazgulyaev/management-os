/**
 * Stage 6.P1.D.2 — Agoda YCS ChannelManagerProvider implementation.
 */

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
  errorResult,
  pickPayloadString,
  projectHttpResult,
  truncate,
  verifyHmacSha256Signature,
  zeroResult,
} from "../../provider-helpers";
import {
  AgodaClient,
  type AgodaClientOptions,
  type AgodaCredentials,
} from "./client";
import { mapAgodaReservationToInternal } from "./mappers";

const CHANNEL_NAME: ChannelName = "agoda";

export class AgodaProvider implements ChannelManagerProvider {
  readonly name: ChannelName = CHANNEL_NAME;
  private readonly client: AgodaClient;

  constructor(
    credentials: AgodaCredentials,
    clientOptions: AgodaClientOptions = {},
  ) {
    this.client = new AgodaClient(credentials, clientOptions);
  }

  async pushAvailability(input: AvailabilityInput): Promise<SyncResult> {
    const start = Date.now();
    const recordCount = input.availabilityPerDay.size;
    if (recordCount === 0) return zeroResult(start);
    try {
      const res = await this.client.pushAvailability(input);
      return projectHttpResult(res, recordCount, start);
    } catch (err) {
      return errorResult(start, recordCount, err);
    }
  }

  async pushRates(input: RatesInput): Promise<SyncResult> {
    const start = Date.now();
    const recordCount = input.ratesPerDay.size;
    if (recordCount === 0) return zeroResult(start);
    try {
      const res = await this.client.pushRates(input);
      return projectHttpResult(res, recordCount, start);
    } catch (err) {
      return errorResult(start, recordCount, err);
    }
  }

  async pushAmenities(input: AmenitiesInput): Promise<SyncResult> {
    const start = Date.now();
    if (input.amenities.length === 0) return zeroResult(start);
    try {
      const res = await this.client.pushAmenities(input.amenities);
      return projectHttpResult(res, input.amenities.length, start);
    } catch (err) {
      return errorResult(start, input.amenities.length, err);
    }
  }

  async pullReservations(
    input: PullReservationsInput,
  ): Promise<ChannelReservationData[]> {
    void input.externalPropertyId;
    let res;
    try {
      res = await this.client.pullReservations({
        modifiedSince: input.modifiedSince,
        limit: input.limit,
      });
    } catch {
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
      const projected = mapAgodaReservationToInternal(item);
      if (projected) out.push(projected);
    }
    return out;
  }

  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    return verifyHmacSha256Signature(payload, signature, secret);
  }

  parseWebhook(payload: Record<string, unknown>): WebhookEvent | null {
    // Agoda webhooks: { event_type, booking_id, data }
    const raw =
      pickPayloadString(payload, "event_type") ?? pickPayloadString(payload, "event");
    if (!raw) return null;
    const mapped = mapAgodaEventType(raw);
    if (!mapped) return null;
    const reservationId =
      pickPayloadString(payload, "booking_id") ??
      pickPayloadString(payload, "reservation_id");
    const timestampRaw =
      pickPayloadString(payload, "occurred_at") ??
      pickPayloadString(payload, "timestamp");
    const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();
    return {
      type: mapped,
      externalReservationId: reservationId,
      payload,
      signature: pickPayloadString(payload, "__signature") ?? "",
      timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
    };
  }

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

function mapAgodaEventType(raw: string): WebhookEventType | null {
  switch (raw) {
    case "booking_new":
    case "booking_created":
    case "reservation_created":
    case "reservation.created":
      return "reservation.created";
    case "booking_modified":
    case "reservation_modified":
    case "reservation.modified":
      return "reservation.modified";
    case "booking_cancelled":
    case "booking_canceled":
    case "reservation_cancelled":
    case "reservation.cancelled":
      return "reservation.cancelled";
    case "rate_modified":
    case "rate.modified":
      return "rate.modified";
    case "inventory_modified":
    case "availability_modified":
    case "inventory.modified":
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
    (Array.isArray(o["bookings"]) && o["bookings"]) ||
    (Array.isArray(o["data"]) && o["data"]) ||
    (Array.isArray(parsed) && parsed) ||
    [];
  return (list as unknown[]).filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object",
  );
}

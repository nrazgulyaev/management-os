/**
 * Stage 6.P1.D.3 — Expedia ChannelManagerProvider implementation.
 *
 * Wraps ExpediaClient (SOAP+REST hybrid) + EQC parsers behind the
 * unified interface. Same SyncResult-degradation pattern as the other
 * providers.
 *
 * The optional `productLine` constructor parameter (defaults to
 * 'expedia') is used by the VRBO + Hotels.com subclasses to flip the
 * EPC base URL while reusing the same EQC SOAP gateway. Subclasses
 * also override `name` to surface as their own ChannelName.
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
  truncate,
  verifyHmacSha256Signature,
  zeroResult,
} from "../../provider-helpers";
import {
  ExpediaClient,
  type ExpediaClientCredentials,
  type ExpediaClientOptions,
  type ExpediaProductLine,
} from "./client";
import { parseEQCBookings, parseEQCResponse } from "./eqc-parsers";

const CHANNEL_NAME: ChannelName = "expedia";

export interface ExpediaProviderInit extends ExpediaClientCredentials {
  channel: "expedia" | "vrbo" | "hotels_com";
}

export class ExpediaProvider implements ChannelManagerProvider {
  readonly name: ChannelName;
  protected readonly client: ExpediaClient;

  constructor(
    credentials: ExpediaProviderInit,
    clientOptions: ExpediaClientOptions = {},
  ) {
    this.name = (credentials.channel ?? CHANNEL_NAME) as ChannelName;
    const productLine: ExpediaProductLine =
      this.name === "vrbo" || this.name === "hotels_com"
        ? this.name
        : "expedia";
    this.client = new ExpediaClient(
      {
        hotelId: credentials.hotelId,
        eqcUsername: credentials.eqcUsername,
        eqcPassword: credentials.eqcPassword,
        environment: credentials.environment,
      },
      { productLine, ...clientOptions },
    );
  }

  async pushAvailability(input: AvailabilityInput): Promise<SyncResult> {
    const start = Date.now();
    const recordCount = input.availabilityPerDay.size;
    if (recordCount === 0) return zeroResult(start);
    try {
      const res = await this.client.pushAvailability(input);
      const parsed = await parseEQCResponse(res.body);
      return projectSoapResult(parsed, res.apiCallsCount, recordCount, start);
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
      const parsed = await parseEQCResponse(res.body);
      return projectSoapResult(parsed, res.apiCallsCount, recordCount, start);
    } catch (err) {
      return errorResult(start, recordCount, err);
    }
  }

  async pushAmenities(input: AmenitiesInput): Promise<SyncResult> {
    const start = Date.now();
    if (input.amenities.length === 0) return zeroResult(start);
    try {
      const res = await this.client.pushAmenities(input.amenities);
      // EPC REST: 2xx = success.
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
        errors: [{ message: `HTTP ${res.status}: ${truncate(res.body, 240)}` }],
        durationMs: Date.now() - start,
        apiCallsCount: res.apiCallsCount,
      };
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
      });
    } catch {
      return [];
    }
    if (res.status < 200 || res.status >= 300) return [];
    return parseEQCBookings(res.body);
  }

  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    return verifyHmacSha256Signature(payload, signature, secret);
  }

  parseWebhook(payload: Record<string, unknown>): WebhookEvent | null {
    // Expedia webhook envelope: { eventType, bookingId, data }
    const raw =
      pickPayloadString(payload, "eventType") ??
      pickPayloadString(payload, "event_type") ??
      pickPayloadString(payload, "event");
    if (!raw) return null;
    const mapped = mapExpediaEventType(raw);
    if (!mapped) return null;
    const reservationId =
      pickPayloadString(payload, "bookingId") ??
      pickPayloadString(payload, "reservationId") ??
      pickPayloadString(payload, "reservation_id");
    const timestampRaw =
      pickPayloadString(payload, "occurredAt") ??
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
          channel: this.name,
          status: res.status,
          bodyPreview: truncate(res.body, 240),
        },
      };
    } catch (err) {
      return {
        connected: false,
        details: {
          channel: this.name,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

function projectSoapResult(
  parsed: { success: boolean; errors: Array<{ code?: string; message: string }> },
  apiCallsCount: number,
  recordCount: number,
  startMs: number,
): SyncResult {
  if (parsed.success) {
    return {
      success: true,
      recordsProcessed: recordCount,
      recordsSucceeded: recordCount,
      recordsFailed: 0,
      errors: [],
      durationMs: Date.now() - startMs,
      apiCallsCount,
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
    durationMs: Date.now() - startMs,
    apiCallsCount,
  };
}

function mapExpediaEventType(raw: string): WebhookEventType | null {
  switch (raw) {
    case "BookingNotification":
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

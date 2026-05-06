/**
 * Stage 6.P1.B — Booking.com low-level HTTP client.
 *
 * Wraps the OTA XML API + Demand JSON API with:
 *   - HTTP Basic auth (username + password)
 *   - Sandbox / production env switching
 *   - Retry with exponential backoff (max 3 attempts)
 *   - 30s timeout per request via AbortSignal.timeout
 *   - 429 rate-limit handling (retry with backoff)
 *   - Counts API calls so the provider can report apiCallsCount
 *
 * Native fetch only — no axios. Tests inject a mock fetch via the
 * constructor to exercise retry/backoff/timeout branches without
 * hitting Booking's servers.
 *
 * Credentials live on the instance — the caller decrypts the JSONB
 * column once and passes the plaintext object in. The client never
 * logs credentials.
 */

import {
  buildOTAAvailNotif,
  buildOTARateNotif,
  buildOTAResRetrieve,
  type AvailNotifInput,
  type RateNotifInput,
  type ResRetrieveInput,
} from "./ota-builders";
import { requestWithRetry } from "../../http-retry";

export interface BookingComCredentials {
  channel: "booking_com";
  username: string;
  password: string;
  hotelId: string;
  environment: "sandbox" | "production";
}

const BASE_URLS = {
  sandbox: "https://supply-xml.booking.com/hotels-test",
  production: "https://supply-xml.booking.com/hotels",
} as const;

export const BOOKING_DEMAND_API_BASE = "https://demandapi.booking.com/3.1";

export interface BookingComClientOptions {
  /** Inject a mock fetch in tests. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Override the per-request timeout. Default 30s. */
  timeoutMs?: number;
  /** Max retry attempts on 429/5xx/network failure. Default 3. */
  maxRetries?: number;
  /** Backoff base in ms. Default 1000. Tests pass 1 to keep suite fast. */
  backoffBaseMs?: number;
}

export interface BookingClientResponse {
  status: number;
  body: string;
  /** Total number of HTTP requests made (including retries). */
  apiCallsCount: number;
}

export class BookingComClient {
  private readonly retryOpts: BookingComClientOptions;

  constructor(
    private readonly creds: BookingComCredentials,
    opts: BookingComClientOptions = {},
  ) {
    this.retryOpts = opts;
  }

  get baseUrl(): string {
    return BASE_URLS[this.creds.environment];
  }

  /** Public for tests + provider's testConnection — never logged. */
  get authHeader(): string {
    return (
      "Basic " +
      Buffer.from(`${this.creds.username}:${this.creds.password}`).toString(
        "base64",
      )
    );
  }

  // -------------------------------------------------------------------------
  // Public surface used by the provider
  // -------------------------------------------------------------------------

  async pushAvailability(
    params: Omit<AvailNotifInput, "timestamp" | "hotelId"> & {
      timestamp?: Date;
    },
  ): Promise<BookingClientResponse> {
    const xml = buildOTAAvailNotif({
      hotelId: this.creds.hotelId,
      timestamp: params.timestamp ?? new Date(),
      roomId: params.roomId,
      ranges: params.ranges,
    });
    return this.postXml(`${this.baseUrl}/availability`, xml);
  }

  async pushRates(
    params: Omit<RateNotifInput, "timestamp" | "hotelId"> & {
      timestamp?: Date;
    },
  ): Promise<BookingClientResponse> {
    const xml = buildOTARateNotif({
      hotelId: this.creds.hotelId,
      timestamp: params.timestamp ?? new Date(),
      roomId: params.roomId,
      ratePlanId: params.ratePlanId,
      ranges: params.ranges,
    });
    return this.postXml(`${this.baseUrl}/rates`, xml);
  }

  async pullReservations(
    params: Omit<ResRetrieveInput, "timestamp" | "hotelId"> & {
      timestamp?: Date;
    } = {},
  ): Promise<BookingClientResponse> {
    const xml = buildOTAResRetrieve({
      hotelId: this.creds.hotelId,
      timestamp: params.timestamp ?? new Date(),
      modifiedSince: params.modifiedSince,
      limit: params.limit,
    });
    return this.postXml(`${this.baseUrl}/reservations`, xml);
  }

  /**
   * Booking-specific: amenities live on a separate REST-ish endpoint
   * that takes a JSON body keyed by hotel_id. Doesn't go through OTA.
   */
  async pushAmenities(amenities: string[]): Promise<BookingClientResponse> {
    const url = `${this.baseUrl}/amenities`;
    return this.dispatch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hotel_id: this.creds.hotelId,
        amenities,
      }),
    });
  }

  /**
   * Lightweight ping for testConnection. Booking exposes a /test endpoint
   * that returns 200 OK with diagnostic XML when credentials are valid.
   */
  async testConnection(): Promise<BookingClientResponse> {
    return this.dispatch(`${this.baseUrl}/test`, {
      method: "GET",
      headers: { Authorization: this.authHeader },
    });
  }

  // -------------------------------------------------------------------------
  // Internal — single XML POST + shared retry envelope
  // -------------------------------------------------------------------------

  private async postXml(url: string, xml: string): Promise<BookingClientResponse> {
    return this.dispatch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "text/xml; charset=utf-8",
        Accept: "text/xml",
      },
      body: xml,
    });
  }

  private async dispatch(
    url: string,
    init: RequestInit,
  ): Promise<BookingClientResponse> {
    const result = await requestWithRetry(url, init, this.retryOpts);
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}

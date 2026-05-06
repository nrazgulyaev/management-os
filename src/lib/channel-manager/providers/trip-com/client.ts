/**
 * Stage 6.P1.D.1 — Trip.com Partner Connect HTTP client.
 *
 * REST/JSON API. Auth via API key + partner ID in headers (no OAuth,
 * no signing). Reuses the shared retry envelope from P1.A so retry/
 * backoff/429/5xx semantics match Booking.com + Airbnb exactly.
 */

import { requestWithRetry, type RetryOptions } from "../../http-retry";
import {
  mapAmenitiesToTrip,
  mapInternalAvailabilityToTrip,
  mapInternalRatesToTrip,
} from "./mappers";
import type { AvailabilityInput, RatesInput } from "../../types";

const BASE_URLS = {
  sandbox: "https://partnerapi.trip-test.com",
  production: "https://partnerapi.trip.com",
} as const;

export interface TripComCredentials {
  channel: "trip_com";
  partnerId: string;
  apiKey: string;
  hotelId: string;
  /**
   * Trip.com Partner Connect ships sandbox + production endpoints; the
   * launch prompt's credential schema doesn't include an environment
   * tag, so we default to production. Callers can override via
   * client options when targeting sandbox in tests.
   */
}

export interface TripComClientOptions extends RetryOptions {
  apiBase?: string;
  environment?: "sandbox" | "production";
}

export interface TripClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export class TripComClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: TripComCredentials,
    opts: TripComClientOptions = {},
  ) {
    this.apiBase =
      opts.apiBase ?? BASE_URLS[opts.environment ?? "production"];
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  get baseUrl(): string {
    return this.apiBase;
  }

  /** Public for tests + provider's testConnection — never logged. */
  authHeaders(): Record<string, string> {
    return {
      "X-Partner-Id": this.creds.partnerId,
      "X-API-Key": this.creds.apiKey,
    };
  }

  // -------------------------------------------------------------------------
  // Methods used by the provider
  // -------------------------------------------------------------------------

  async pushAvailability(input: AvailabilityInput): Promise<TripClientResponse> {
    return this.postJson(
      `/v1/hotels/${encodeURIComponent(this.creds.hotelId)}/inventory`,
      mapInternalAvailabilityToTrip(input),
    );
  }

  async pushRates(input: RatesInput): Promise<TripClientResponse> {
    return this.postJson(
      `/v1/hotels/${encodeURIComponent(this.creds.hotelId)}/rates`,
      mapInternalRatesToTrip(input),
    );
  }

  async pushAmenities(amenities: string[]): Promise<TripClientResponse> {
    return this.postJson(
      `/v1/hotels/${encodeURIComponent(this.creds.hotelId)}/amenities`,
      mapAmenitiesToTrip(this.creds.hotelId, amenities),
    );
  }

  async pullReservations(params: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<TripClientResponse> {
    const url = new URL(
      `${this.apiBase}/v1/hotels/${encodeURIComponent(this.creds.hotelId)}/reservations`,
    );
    if (params.modifiedSince) {
      url.searchParams.set("modified_since", params.modifiedSince.toISOString());
    }
    if (params.limit !== undefined) {
      url.searchParams.set("limit", String(params.limit));
    }
    return this.dispatchAbsolute("GET", url.toString());
  }

  async testConnection(): Promise<TripClientResponse> {
    return this.dispatchAbsolute(
      "GET",
      `${this.apiBase}/v1/hotels/${encodeURIComponent(this.creds.hotelId)}/info`,
    );
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async postJson(
    path: string,
    body: unknown,
  ): Promise<TripClientResponse> {
    return this.dispatchAbsolute("POST", `${this.apiBase}${path}`, body);
  }

  private async dispatchAbsolute(
    method: string,
    url: string,
    jsonBody?: unknown,
  ): Promise<TripClientResponse> {
    const headers: Record<string, string> = {
      ...this.authHeaders(),
      Accept: "application/json",
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(jsonBody);
    }
    const result = await requestWithRetry(
      url,
      { method, headers, body },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}

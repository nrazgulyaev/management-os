/**
 * Stage 6.P1.D.2 — Agoda YCS REST client.
 *
 * Custom signature scheme: SHA256-HMAC over `${timestamp}${path}${body}`
 * keyed with apiSecret, sent in `X-Agoda-Signature`. The hotelId +
 * apiKey go in `X-Agoda-Hotel-Id` + `X-Agoda-Api-Key`. Timestamp goes
 * in `X-Agoda-Timestamp` so the server can re-derive the signature.
 *
 * Native fetch + shared retry envelope.
 */

import { createHmac } from "node:crypto";
import { requestWithRetry, type RetryOptions } from "../../http-retry";
import {
  mapAmenitiesToAgoda,
  mapInternalAvailabilityToAgoda,
  mapInternalRatesToAgoda,
} from "./mappers";
import type { AvailabilityInput, RatesInput } from "../../types";

const BASE_URLS = {
  sandbox: "https://ycs-sandbox.agoda.com",
  production: "https://ycs.agoda.com",
} as const;

export interface AgodaCredentials {
  channel: "agoda";
  hotelId: string;
  apiKey: string;
  apiSecret: string;
  environment: "sandbox" | "production";
}

export interface AgodaClientOptions extends RetryOptions {
  apiBase?: string;
  /** Override `Date.now()` for deterministic test signatures. */
  nowMs?: () => number;
}

export interface AgodaClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export class AgodaClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly nowMs: () => number;

  constructor(
    private readonly creds: AgodaCredentials,
    opts: AgodaClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? BASE_URLS[this.creds.environment];
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.nowMs = opts.nowMs ?? (() => Date.now());
  }

  get baseUrl(): string {
    return this.apiBase;
  }

  /** Public for tests + introspection. Body must match the actual sent body byte-for-byte. */
  buildSignature(timestamp: string, path: string, body: string): string {
    return createHmac("sha256", this.creds.apiSecret)
      .update(`${timestamp}${path}${body}`)
      .digest("hex");
  }

  // -------------------------------------------------------------------------
  // Methods used by the provider
  // -------------------------------------------------------------------------

  async pushAvailability(input: AvailabilityInput): Promise<AgodaClientResponse> {
    return this.postJson(
      "/ycs/inventory/availability",
      mapInternalAvailabilityToAgoda(input),
    );
  }

  async pushRates(input: RatesInput): Promise<AgodaClientResponse> {
    return this.postJson(
      "/ycs/inventory/rates",
      mapInternalRatesToAgoda(input),
    );
  }

  async pushAmenities(amenities: string[]): Promise<AgodaClientResponse> {
    return this.postJson(
      `/ycs/properties/${encodeURIComponent(this.creds.hotelId)}/amenities`,
      mapAmenitiesToAgoda(this.creds.hotelId, amenities),
    );
  }

  async pullReservations(params: {
    modifiedSince?: Date;
    limit?: number;
  } = {}): Promise<AgodaClientResponse> {
    const url = new URL(`${this.apiBase}/ycs/reservations`);
    url.searchParams.set("hotel_id", this.creds.hotelId);
    if (params.modifiedSince) {
      url.searchParams.set("modified_since", params.modifiedSince.toISOString());
    }
    if (params.limit !== undefined) {
      url.searchParams.set("limit", String(params.limit));
    }
    return this.dispatch("GET", url.pathname + url.search, "");
  }

  async testConnection(): Promise<AgodaClientResponse> {
    return this.dispatch(
      "GET",
      `/ycs/properties/${encodeURIComponent(this.creds.hotelId)}`,
      "",
    );
  }

  // -------------------------------------------------------------------------
  // Internal — JSON body + signature + dispatch
  // -------------------------------------------------------------------------

  private async postJson(
    path: string,
    body: unknown,
  ): Promise<AgodaClientResponse> {
    const json = JSON.stringify(body);
    return this.dispatch("POST", path, json);
  }

  private async dispatch(
    method: string,
    path: string,
    body: string,
  ): Promise<AgodaClientResponse> {
    const timestamp = String(this.nowMs());
    const signature = this.buildSignature(timestamp, path, body);
    const headers: Record<string, string> = {
      "X-Agoda-Hotel-Id": this.creds.hotelId,
      "X-Agoda-Api-Key": this.creds.apiKey,
      "X-Agoda-Timestamp": timestamp,
      "X-Agoda-Signature": signature,
      Accept: "application/json",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    const result = await requestWithRetry(
      `${this.apiBase}${path}`,
      { method, headers, body: body || undefined },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}

/**
 * Stage 6.P1.C — Airbnb Hosting API client.
 *
 * Bearer-token auth with automatic refresh when the access token has
 * expired (or returns 401 mid-flight). Token rotations are surfaced
 * via the `onCredentialsRefreshed` callback so the service layer can
 * persist the new token to oauth_connections — the client itself
 * doesn't touch the DB.
 *
 * Native fetch only. Same retry envelope as BookingComClient via the
 * shared `requestWithRetry` helper.
 */

import { requestWithRetry, type RetryOptions } from "../../http-retry";
import { refreshAirbnbToken } from "@/lib/oauth/airbnb";
import {
  mapAmenitiesToAirbnb,
  mapInternalAvailabilityToAirbnb,
  mapInternalRatesToAirbnb,
} from "./mappers";
import type {
  AvailabilityInput,
  RatesInput,
} from "../../types";

const API_BASE = "https://api.airbnb.com/v2";

export interface AirbnbCredentials {
  channel: "airbnb";
  accessToken: string;
  refreshToken: string;
  /** Unix epoch ms — when accessToken expires. */
  expiresAt: number;
  listingId: string;
  /** Optional — Airbnb account ID, used by some endpoints. */
  accountId?: string;
}

export interface AirbnbCredentialsUpdate {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AirbnbClientOptions extends RetryOptions {
  /** Override API base URL (e.g. testing against a sandbox proxy). */
  apiBase?: string;
  /**
   * Invoked when the client refreshes the access token. The service
   * layer persists the new tokens; the client also updates its own
   * in-memory copy automatically.
   */
  onCredentialsRefreshed?: (next: AirbnbCredentialsUpdate) => Promise<void> | void;
  /** Margin (ms) before expiresAt at which we proactively refresh.
   *  Default 60s — covers clock skew + the typical Airbnb token TTL. */
  refreshMarginMs?: number;
}

export interface AirbnbClientResponse {
  status: number;
  body: string;
  headers: Headers;
  apiCallsCount: number;
}

const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export class AirbnbClient {
  private creds: AirbnbCredentials;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly onCredentialsRefreshed?: AirbnbClientOptions["onCredentialsRefreshed"];
  private readonly refreshMarginMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(credentials: AirbnbCredentials, opts: AirbnbClientOptions = {}) {
    this.creds = { ...credentials };
    this.apiBase = opts.apiBase ?? API_BASE;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.retryOpts = {
      fetch: this.fetchImpl,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.onCredentialsRefreshed = opts.onCredentialsRefreshed;
    this.refreshMarginMs = opts.refreshMarginMs ?? DEFAULT_REFRESH_MARGIN_MS;
  }

  /** Current credentials — read-only. Useful for tests + introspection. */
  get credentials(): Readonly<AirbnbCredentials> {
    return this.creds;
  }

  // -------------------------------------------------------------------------
  // High-level methods used by the provider
  // -------------------------------------------------------------------------

  async pushPricing(input: RatesInput): Promise<AirbnbClientResponse> {
    const body = mapInternalRatesToAirbnb(input);
    return this.dispatch(
      "PUT",
      `/listings/${encodeURIComponent(input.externalPropertyId)}/pricing`,
      body,
    );
  }

  async pushCalendar(input: AvailabilityInput): Promise<AirbnbClientResponse> {
    const body = mapInternalAvailabilityToAirbnb(input);
    return this.dispatch(
      "PUT",
      `/calendars/${encodeURIComponent(input.externalPropertyId)}`,
      body,
    );
  }

  async pushAmenities(
    externalPropertyId: string,
    amenities: string[],
  ): Promise<AirbnbClientResponse> {
    const body = mapAmenitiesToAirbnb(externalPropertyId, amenities);
    return this.dispatch(
      "POST",
      `/listings/${encodeURIComponent(externalPropertyId)}/amenities`,
      body,
    );
  }

  async pullReservations(params: {
    listingId: string;
    modifiedSince?: Date;
    limit?: number;
  }): Promise<AirbnbClientResponse> {
    const url = new URL(`${this.apiBase}/reservations`);
    url.searchParams.set("listing_id", params.listingId);
    if (params.modifiedSince) {
      url.searchParams.set("modified_since", params.modifiedSince.toISOString());
    }
    if (params.limit !== undefined) {
      url.searchParams.set("_limit", String(params.limit));
    }
    return this.dispatchAbsolute("GET", url.toString());
  }

  async getReservationDetails(
    reservationId: string,
  ): Promise<AirbnbClientResponse> {
    return this.dispatch(
      "GET",
      `/reservations/${encodeURIComponent(reservationId)}`,
    );
  }

  async testConnection(): Promise<AirbnbClientResponse> {
    return this.dispatch("GET", "/test_authentication");
  }

  // -------------------------------------------------------------------------
  // Auth helpers
  // -------------------------------------------------------------------------

  /**
   * Ensure the access token is fresh. Called before every dispatch.
   * Returns the (possibly refreshed) bearer header value.
   */
  private async ensureFreshToken(): Promise<string> {
    if (this.tokenExpiresWithinMargin()) {
      await this.refreshTokenNow();
    }
    return `Bearer ${this.creds.accessToken}`;
  }

  private tokenExpiresWithinMargin(): boolean {
    return this.creds.expiresAt - Date.now() <= this.refreshMarginMs;
  }

  /**
   * Refresh the access token + persist via the caller's callback. Throws
   * on refresh failure — the caller should mark the connection as
   * `error` so the operator can re-authenticate.
   */
  private async refreshTokenNow(): Promise<void> {
    const refreshed = await refreshAirbnbToken({
      refreshToken: this.creds.refreshToken,
      fetch: this.fetchImpl,
    });
    this.creds = {
      ...this.creds,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? this.creds.refreshToken,
      expiresAt: refreshed.expiresAt,
    };
    if (this.onCredentialsRefreshed) {
      await this.onCredentialsRefreshed({
        accessToken: this.creds.accessToken,
        refreshToken: this.creds.refreshToken,
        expiresAt: this.creds.expiresAt,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch — handles auth header + 401 → refresh+retry once
  // -------------------------------------------------------------------------

  private async dispatch(
    method: string,
    path: string,
    jsonBody?: unknown,
  ): Promise<AirbnbClientResponse> {
    return this.dispatchAbsolute(method, `${this.apiBase}${path}`, jsonBody);
  }

  private async dispatchAbsolute(
    method: string,
    url: string,
    jsonBody?: unknown,
  ): Promise<AirbnbClientResponse> {
    const auth = await this.ensureFreshToken();
    const headers: Record<string, string> = {
      Authorization: auth,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(jsonBody);
    }

    const first = await requestWithRetry(
      url,
      { method, headers, body },
      this.retryOpts,
    );

    // 401 mid-flight: token may have been revoked between our pre-check
    // and the request. One reactive refresh + retry is sufficient — if
    // it fails again the credentials are genuinely bad.
    if (first.status === 401) {
      try {
        await this.refreshTokenNow();
      } catch {
        return {
          status: first.status,
          body: first.body,
          headers: first.headers,
          apiCallsCount: first.apiCallsCount,
        };
      }
      const retryAuth = `Bearer ${this.creds.accessToken}`;
      const retryHeaders = { ...headers, Authorization: retryAuth };
      const second = await requestWithRetry(
        url,
        { method, headers: retryHeaders, body },
        this.retryOpts,
      );
      return {
        status: second.status,
        body: second.body,
        headers: second.headers,
        apiCallsCount: first.apiCallsCount + second.apiCallsCount,
      };
    }

    return {
      status: first.status,
      body: first.body,
      headers: first.headers,
      apiCallsCount: first.apiCallsCount,
    };
  }
}

export { API_BASE as AIRBNB_API_BASE };

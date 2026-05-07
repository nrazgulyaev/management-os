/**
 * Stage 6.P4.B — Google Analytics 4 client.
 *
 * Two surfaces wrapped in one client:
 *
 * 1. **Measurement Protocol** (server-side event tracking):
 *      POST https://www.google-analytics.com/mp/collect?measurement_id=G-XX&api_secret=YY
 *      No auth header — the api_secret in the URL authenticates.
 *      Body: { client_id, events: [{ name, params }] }.
 *      Returns 204 No Content on success (200 in debug mode).
 *      Used to fire conversion events when reservations / leads land.
 *
 * 2. **Reporting Data API v1beta**:
 *      POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
 *      Bearer-token auth (Google OAuth2). Reuses the
 *      `refreshGoogleToken` helper from P2.E for proactive +
 *      reactive token refresh — same callback-based persistence
 *      pattern as the Gmail client.
 *
 * Native fetch via the shared retry envelope from P1.A.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import { refreshGoogleToken } from "@/lib/oauth/google";
import type { GoogleAnalyticsCredentials } from "../../types";

const MEASUREMENT_PROTOCOL_BASE = "https://www.google-analytics.com/mp/collect";
const REPORTING_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export interface GoogleAnalyticsCredentialsUpdate {
  oauthAccessToken: string;
  oauthRefreshToken: string;
  oauthExpiresAt: number;
}

export interface GoogleAnalyticsClientOptions extends RetryOptions {
  measurementApiBase?: string;
  reportingApiBase?: string;
  /**
   * Persistence callback invoked when the client refreshes the OAuth
   * access token. Service layer persists to `marketing_connections.credentials`.
   */
  onCredentialsRefreshed?: (
    next: GoogleAnalyticsCredentialsUpdate,
  ) => Promise<void> | void;
  /** Margin (ms) before expiresAt at which we proactively refresh. */
  refreshMarginMs?: number;
}

export interface GA4Response {
  status: number;
  body: string;
  apiCallsCount: number;
}

// ---------------------------------------------------------------------------
// Measurement Protocol — domain types
// ---------------------------------------------------------------------------

export interface MeasurementProtocolEvent {
  /** Snake-case event name: `purchase`, `lead`, `sign_up`, etc.
   *  Custom events allowed (must be < 40 chars, alphanumeric+_, no
   *  GA4 reserved prefixes). */
  name: string;
  /** Event parameters bag. Allowed: numbers, strings, booleans.
   *  GA4 conversion events require `currency` + `value` for revenue
   *  attribution. */
  params?: Record<string, unknown>;
}

export interface SendEventInput {
  /** Stable visitor identifier — GA4 client_id (cookie value). */
  clientId: string;
  /** Authenticated user id, when available. Hashed before send. */
  userId?: string;
  events: MeasurementProtocolEvent[];
  /** When set, the request fires against debug mode + returns
   *  validation-only response — does NOT count in reports. */
  validationOnly?: boolean;
  /** Override timestamp for backfill imports — defaults to now. */
  timestampMicros?: number;
}

// ---------------------------------------------------------------------------
// Reporting Data API — domain types
// ---------------------------------------------------------------------------

export interface RunReportInput {
  /** GA4 dimension list — e.g. ["date", "sessionDefaultChannelGroup"]. */
  dimensions: string[];
  /** GA4 metric list — e.g. ["activeUsers", "conversions"]. */
  metrics: string[];
  /** ISO date strings: { startDate, endDate }. */
  dateRanges: Array<{ startDate: string; endDate: string }>;
  /** Optional dimension filter expression. */
  dimensionFilter?: Record<string, unknown>;
  /** Limit rows returned. Default 10000 (GA4 max per page). */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GoogleAnalyticsClient {
  private creds: GoogleAnalyticsCredentials;
  private readonly measurementApiBase: string;
  private readonly reportingApiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly onCredentialsRefreshed?:
    | GoogleAnalyticsClientOptions["onCredentialsRefreshed"];
  private readonly refreshMarginMs: number;

  constructor(
    credentials: GoogleAnalyticsCredentials,
    opts: GoogleAnalyticsClientOptions = {},
  ) {
    this.creds = { ...credentials };
    this.measurementApiBase = opts.measurementApiBase ?? MEASUREMENT_PROTOCOL_BASE;
    this.reportingApiBase = opts.reportingApiBase ?? REPORTING_API_BASE;
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

  // -------------------------------------------------------------------------
  // Measurement Protocol — sendEvent
  // -------------------------------------------------------------------------

  async sendEvent(input: SendEventInput): Promise<GA4Response> {
    if (!input.clientId) {
      throw new Error("GoogleAnalyticsClient.sendEvent: clientId required");
    }
    if (!input.events || input.events.length === 0) {
      throw new Error("GoogleAnalyticsClient.sendEvent: events required");
    }
    const url = new URL(
      input.validationOnly
        ? this.measurementApiBase.replace("/collect", "/debug/collect")
        : this.measurementApiBase,
    );
    url.searchParams.set("measurement_id", this.creds.measurementId);
    url.searchParams.set("api_secret", this.creds.apiSecret);

    const body: Record<string, unknown> = {
      client_id: input.clientId,
      events: input.events,
    };
    if (input.userId) body["user_id"] = input.userId;
    if (input.timestampMicros) body["timestamp_micros"] = input.timestampMicros;

    const result = await requestWithRetry(
      url.toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  // -------------------------------------------------------------------------
  // Reporting Data API — runReport
  // -------------------------------------------------------------------------

  async runReport(input: RunReportInput): Promise<GA4Response> {
    await this.ensureFreshAccessToken();
    return this.doReport(input, /* attempted401Refresh */ false);
  }

  async getActiveUsers(dateRange: {
    startDate: string;
    endDate: string;
  }): Promise<GA4Response> {
    return this.runReport({
      dimensions: ["date"],
      metrics: ["activeUsers"],
      dateRanges: [dateRange],
    });
  }

  async getConversions(dateRange: {
    startDate: string;
    endDate: string;
  }): Promise<GA4Response> {
    return this.runReport({
      dimensions: ["date", "eventName"],
      metrics: ["conversions", "totalRevenue"],
      dateRanges: [dateRange],
    });
  }

  async getTrafficSources(dateRange: {
    startDate: string;
    endDate: string;
  }): Promise<GA4Response> {
    return this.runReport({
      dimensions: ["sessionSource", "sessionMedium", "sessionDefaultChannelGroup"],
      metrics: ["sessions", "activeUsers", "conversions"],
      dateRanges: [dateRange],
    });
  }

  // -------------------------------------------------------------------------
  // Internal — Reporting API HTTP + OAuth refresh
  // -------------------------------------------------------------------------

  private async doReport(
    input: RunReportInput,
    attempted401Refresh: boolean,
  ): Promise<GA4Response> {
    const url = `${this.reportingApiBase}/properties/${encodeURIComponent(
      this.creds.propertyId,
    )}:runReport`;

    const body: Record<string, unknown> = {
      dimensions: input.dimensions.map((name) => ({ name })),
      metrics: input.metrics.map((name) => ({ name })),
      dateRanges: input.dateRanges,
      limit: String(input.limit ?? 10000),
    };
    if (input.dimensionFilter) body["dimensionFilter"] = input.dimensionFilter;

    const result = await requestWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.creds.oauthAccessToken ?? ""}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
      this.retryOpts,
    );

    // Reactive 401 handling — token may have expired since the
    // proactive check fired (rare but happens on long-running cron
    // sweeps). Refresh and retry once.
    if (result.status === 401 && !attempted401Refresh) {
      await this.refreshAccessToken();
      return this.doReport(input, /* attempted401Refresh */ true);
    }

    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  /** Proactive refresh — called before every Reporting API call when
   *  the access token is within `refreshMarginMs` of its expiry. */
  private async ensureFreshAccessToken(): Promise<void> {
    if (!this.creds.oauthAccessToken) {
      throw new Error(
        "GoogleAnalyticsClient: oauthAccessToken required for Reporting API",
      );
    }
    if (!this.creds.oauthExpiresAt) return; // No expiry tracked — assume valid.
    if (Date.now() + this.refreshMarginMs < this.creds.oauthExpiresAt) {
      return; // Still fresh.
    }
    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    if (
      !this.creds.oauthRefreshToken ||
      !this.creds.clientId ||
      !this.creds.clientSecret
    ) {
      throw new Error(
        "GoogleAnalyticsClient: refresh requires oauthRefreshToken + clientId + clientSecret",
      );
    }
    const refreshed = await refreshGoogleToken({
      refreshToken: this.creds.oauthRefreshToken,
      clientId: this.creds.clientId,
      clientSecret: this.creds.clientSecret,
      fetch: this.fetchImpl,
    });
    this.creds = {
      ...this.creds,
      oauthAccessToken: refreshed.accessToken,
      oauthRefreshToken:
        refreshed.refreshToken ?? this.creds.oauthRefreshToken,
      oauthExpiresAt: refreshed.expiresAt,
    };
    if (this.onCredentialsRefreshed) {
      await this.onCredentialsRefreshed({
        oauthAccessToken: this.creds.oauthAccessToken!,
        oauthRefreshToken: this.creds.oauthRefreshToken!,
        oauthExpiresAt: this.creds.oauthExpiresAt!,
      });
    }
  }

  /** Test hook — expose current credentials snapshot for assertions. */
  getCredentialsSnapshot(): GoogleAnalyticsCredentials {
    return { ...this.creds };
  }
}

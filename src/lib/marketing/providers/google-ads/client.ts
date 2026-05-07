/**
 * Stage 6.P4.C — Google Ads REST v15 client.
 *
 * Auth: OAuth 2.0 Bearer token + `developer-token` header. Reuses
 * `refreshGoogleToken` from P2.E for proactive + reactive refresh
 * with the same callback-based persistence pattern as Gmail (P2.E)
 * and GA4 (P4.B).
 *
 * Body: GAQL (Google Ads Query Language) — SQL-like over the
 * GoogleAds resource graph. Submitted as JSON `{ query: "..." }`
 * to `/customers/{customerId}/googleAds:search`.
 *
 * Cost units: Google Ads returns `metrics.cost_micros` where 1 USD =
 * 1,000,000 micros. The mappers in `./parsers.ts` convert to minor
 * units (cents) before returning to the rest of the system.
 *
 * Rate limit: 15k operations/day per developer token. The retry
 * envelope from P1.A handles 429 with exponential backoff.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import { refreshGoogleToken } from "@/lib/oauth/google";
import type { GoogleAdsCredentials } from "../../types";

const API_BASE = "https://googleads.googleapis.com/v15";

const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export interface GoogleAdsCredentialsUpdate {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface GoogleAdsClientOptions extends RetryOptions {
  apiBase?: string;
  /** Persistence callback invoked when the client refreshes the OAuth
   *  token. Service layer persists to `marketing_connections.credentials`. */
  onCredentialsRefreshed?: (
    next: GoogleAdsCredentialsUpdate,
  ) => Promise<void> | void;
  /** Margin (ms) before expiresAt at which we proactively refresh. */
  refreshMarginMs?: number;
}

export interface GoogleAdsResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

// ---------------------------------------------------------------------------
// GAQL — pre-built queries
// ---------------------------------------------------------------------------

/** SELECT every field needed by the campaign mapper. */
export const GAQL_CAMPAIGNS = `
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    campaign.bidding_strategy_type,
    campaign.start_date,
    campaign.end_date,
    campaign_budget.amount_micros,
    campaign_budget.delivery_method,
    campaign_budget.period
  FROM campaign
`.trim();

/** SELECT campaign metrics for a single date. */
export function gaqlCampaignMetricsForDate(date: string): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.cost_per_conversion,
      metrics.value_per_conversion,
      metrics.engagements,
      metrics.video_views,
      metrics.video_view_rate
    FROM campaign
    WHERE segments.date = '${date}'
  `.trim();
}

/** SELECT campaign metrics across a date range, breakdown by date. */
export function gaqlCampaignMetricsRange(
  fromDate: string,
  toDate: string,
): string {
  return `
    SELECT
      campaign.id,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'
  `.trim();
}

/** SELECT keyword performance — used by SKAd-aware QS analyses. */
export const GAQL_KEYWORDS = `
  SELECT
    ad_group_criterion.criterion_id,
    ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type,
    ad_group_criterion.status,
    ad_group.id,
    ad_group.name,
    campaign.id,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions
  FROM keyword_view
`.trim();

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GoogleAdsClient {
  private creds: GoogleAdsCredentials;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly onCredentialsRefreshed?:
    | GoogleAdsClientOptions["onCredentialsRefreshed"];
  private readonly refreshMarginMs: number;

  constructor(
    credentials: GoogleAdsCredentials,
    opts: GoogleAdsClientOptions = {},
  ) {
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

  // -------------------------------------------------------------------------
  // High-level search helpers
  // -------------------------------------------------------------------------

  /** SELECT every campaign on the customer. */
  async searchCampaigns(): Promise<GoogleAdsResponse> {
    return this.search(GAQL_CAMPAIGNS);
  }

  /** SELECT campaign metrics for a single ISO date. */
  async searchCampaignMetrics(date: string): Promise<GoogleAdsResponse> {
    return this.search(gaqlCampaignMetricsForDate(date));
  }

  async searchCampaignMetricsRange(
    fromDate: string,
    toDate: string,
  ): Promise<GoogleAdsResponse> {
    return this.search(gaqlCampaignMetricsRange(fromDate, toDate));
  }

  async searchKeywords(): Promise<GoogleAdsResponse> {
    return this.search(GAQL_KEYWORDS);
  }

  /** Run an arbitrary GAQL query. */
  async search(gaql: string): Promise<GoogleAdsResponse> {
    await this.ensureFreshAccessToken();
    return this.doSearch(gaql, /* attempted401Refresh */ false);
  }

  // -------------------------------------------------------------------------
  // Internal — search HTTP + OAuth refresh
  // -------------------------------------------------------------------------

  private async doSearch(
    gaql: string,
    attempted401Refresh: boolean,
  ): Promise<GoogleAdsResponse> {
    const url = `${this.apiBase}/customers/${encodeURIComponent(
      this.creds.customerId,
    )}/googleAds:search`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.creds.accessToken ?? ""}`,
      "developer-token": this.creds.developerToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.creds.loginCustomerId) {
      // MCC accounts: `login-customer-id` header tells the API
      // which manager account to bill / authorize against.
      headers["login-customer-id"] = this.creds.loginCustomerId;
    }

    const result = await requestWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query: gaql }),
      },
      this.retryOpts,
    );

    // Reactive 401 — token may have expired since the proactive
    // check fired. Refresh and retry once.
    if (result.status === 401 && !attempted401Refresh) {
      await this.refreshAccessToken();
      return this.doSearch(gaql, /* attempted401Refresh */ true);
    }

    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  /** Proactive refresh — called before every search when the cached
   *  token is within `refreshMarginMs` of its expiry, OR when no
   *  cached token exists at all. */
  private async ensureFreshAccessToken(): Promise<void> {
    if (this.creds.accessToken && this.creds.expiresAt) {
      if (Date.now() + this.refreshMarginMs < this.creds.expiresAt) {
        return; // Still fresh.
      }
    } else if (this.creds.accessToken) {
      // Token but no expiry → can't tell if fresh. Trust it for now;
      // a 401 will trigger reactive refresh.
      return;
    }
    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    const refreshed = await refreshGoogleToken({
      refreshToken: this.creds.refreshToken,
      clientId: this.creds.clientId,
      clientSecret: this.creds.clientSecret,
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
        accessToken: this.creds.accessToken!,
        refreshToken: this.creds.refreshToken,
        expiresAt: this.creds.expiresAt!,
      });
    }
  }

  /** Test hook — expose current credentials snapshot for assertions. */
  getCredentialsSnapshot(): GoogleAdsCredentials {
    return { ...this.creds };
  }
}

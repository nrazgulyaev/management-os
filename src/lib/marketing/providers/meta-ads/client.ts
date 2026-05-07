/**
 * Stage 6.P4.D — Meta Ads (Facebook Marketing API) client.
 *
 * REST v18+ over the Graph API:
 *   GET https://graph.facebook.com/v18.0/{ad_account_id}/campaigns
 *   GET https://graph.facebook.com/v18.0/{ad_account_id}/insights
 *   GET https://graph.facebook.com/v18.0/{campaign_id}/insights
 *
 * Auth: Bearer access_token. When `app_secret` is configured the
 * client adds `appsecret_proof` (HMAC-SHA256(access_token,
 * app_secret) hex) to every request — same defense-in-depth as the
 * Meta Pixel client (P4.B).
 *
 * Quirks the mapper has to handle:
 *   - `spend` is returned as a **string in major units** (e.g. "12.34"
 *     for 12.34 USD). The currency is implicit (set on the ad
 *     account, NOT per-campaign).
 *   - Conversions are aggregated in an `actions` array keyed by
 *     `action_type` (e.g. `"offsite_conversion.fb_pixel_purchase"`).
 *     The mapper sums values for the configured conversion events.
 *   - `attribution_setting` controls the conversion window
 *     (1d_view / 7d_click / etc.) — operator chooses it on the
 *     connection.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type { MetaAdsCredentials } from "../../types";
import { generateAppsecretProof } from "../meta-pixel/hash-pii";

const META_GRAPH_BASE = "https://graph.facebook.com/v18.0";

export interface MetaAdsClientOptions extends RetryOptions {
  apiBase?: string;
}

export interface MetaAdsResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

// ---------------------------------------------------------------------------
// API field projections
// ---------------------------------------------------------------------------

/** Campaign fields needed by `mapMetaCampaign`. */
export const META_CAMPAIGN_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "objective",
  "buying_type",
  "start_time",
  "stop_time",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
].join(",");

/** Insights fields needed by `mapMetaInsightsToMetrics`. */
export const META_INSIGHTS_FIELDS = [
  "campaign_id",
  "campaign_name",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "action_values",
  "video_play_actions",
  "video_thruplay_watched_actions",
].join(",");

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MetaAdsClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: MetaAdsCredentials,
    opts: MetaAdsClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? META_GRAPH_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  /** List all campaigns under the ad account. */
  async listCampaigns(opts: { limit?: number } = {}): Promise<MetaAdsResponse> {
    const url = new URL(
      `${this.apiBase}/${encodeURIComponent(this.creds.adAccountId)}/campaigns`,
    );
    url.searchParams.set("fields", META_CAMPAIGN_FIELDS);
    if (opts.limit) url.searchParams.set("limit", String(opts.limit));
    return this.get(url.toString());
  }

  /**
   * Pull campaign insights (metrics) for a date range, with results
   * broken down by date. Filters to campaign-level granularity.
   */
  async getCampaignInsights(input: {
    since: Date;
    until: Date;
    campaignIds?: string[];
    /** "1d_view" / "7d_click" / "1d_view,7d_click" — when omitted,
     *  defaults to the account's configured attribution. */
    attributionSetting?: string;
  }): Promise<MetaAdsResponse> {
    const url = new URL(
      `${this.apiBase}/${encodeURIComponent(this.creds.adAccountId)}/insights`,
    );
    url.searchParams.set("level", "campaign");
    url.searchParams.set("fields", META_INSIGHTS_FIELDS);
    url.searchParams.set("time_increment", "1"); // daily breakdown
    url.searchParams.set(
      "time_range",
      JSON.stringify({
        since: isoDate(input.since),
        until: isoDate(input.until),
      }),
    );
    if (input.campaignIds && input.campaignIds.length > 0) {
      url.searchParams.set(
        "filtering",
        JSON.stringify([
          {
            field: "campaign.id",
            operator: "IN",
            value: input.campaignIds,
          },
        ]),
      );
    }
    if (input.attributionSetting) {
      url.searchParams.set("action_attribution_windows", input.attributionSetting);
    }
    return this.get(url.toString());
  }

  /** Insights scoped to a single campaign — used by per-campaign UI. */
  async getInsightsForCampaign(
    campaignId: string,
    input: {
      since: Date;
      until: Date;
      attributionSetting?: string;
    },
  ): Promise<MetaAdsResponse> {
    const url = new URL(
      `${this.apiBase}/${encodeURIComponent(campaignId)}/insights`,
    );
    url.searchParams.set("fields", META_INSIGHTS_FIELDS);
    url.searchParams.set("time_increment", "1");
    url.searchParams.set(
      "time_range",
      JSON.stringify({
        since: isoDate(input.since),
        until: isoDate(input.until),
      }),
    );
    if (input.attributionSetting) {
      url.searchParams.set("action_attribution_windows", input.attributionSetting);
    }
    return this.get(url.toString());
  }

  /** Account-level metadata — used by `testConnection` to verify auth
   *  + currency. */
  async getAccount(): Promise<MetaAdsResponse> {
    const url = new URL(
      `${this.apiBase}/${encodeURIComponent(this.creds.adAccountId)}`,
    );
    url.searchParams.set("fields", "id,name,currency,account_status,timezone_name");
    return this.get(url.toString());
  }

  // -------------------------------------------------------------------------
  // Internal HTTP
  // -------------------------------------------------------------------------

  private async get(urlStr: string): Promise<MetaAdsResponse> {
    const url = new URL(urlStr);
    url.searchParams.set("access_token", this.creds.accessToken);
    if (this.creds.appSecret) {
      url.searchParams.set(
        "appsecret_proof",
        generateAppsecretProof(this.creds.accessToken, this.creds.appSecret),
      );
    }
    const result = await requestWithRetry(
      url.toString(),
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Stage 6.P4.E — TikTok Ads (Business API) client.
 *
 * REST over `https://business-api.tiktok.com/open_api/v1.3`.
 * Auth: `Access-Token` header (NOT Authorization Bearer — TikTok's
 * convention).
 *
 * Endpoints:
 *   GET /campaign/get/         — list campaigns
 *   GET /report/integrated/get/ — metrics with granular breakdowns
 *
 * Cost units: TikTok returns spend as a string in major units (USD
 * decimal) — same shape as Meta Ads.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type { TikTokAdsCredentials } from "../../types";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export interface TikTokAdsClientOptions extends RetryOptions {
  apiBase?: string;
}

export interface TikTokAdsResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export class TikTokAdsClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: TikTokAdsCredentials,
    opts: TikTokAdsClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? TIKTOK_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  async listCampaigns(): Promise<TikTokAdsResponse> {
    const url = new URL(`${this.apiBase}/campaign/get/`);
    url.searchParams.set("advertiser_id", this.creds.advertiserId);
    url.searchParams.set("page_size", "200");
    return this.get(url.toString());
  }

  async getCampaignReport(input: {
    since: Date;
    until: Date;
    campaignIds?: string[];
  }): Promise<TikTokAdsResponse> {
    const url = new URL(`${this.apiBase}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", this.creds.advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", "AUCTION_CAMPAIGN");
    url.searchParams.set(
      "dimensions",
      JSON.stringify(["campaign_id", "stat_time_day"]),
    );
    url.searchParams.set(
      "metrics",
      JSON.stringify([
        "spend",
        "impressions",
        "reach",
        "clicks",
        "ctr",
        "cpc",
        "conversion",
        "conversion_value",
        "video_play_actions",
      ]),
    );
    url.searchParams.set("start_date", isoDate(input.since));
    url.searchParams.set("end_date", isoDate(input.until));
    if (input.campaignIds && input.campaignIds.length > 0) {
      url.searchParams.set(
        "filtering",
        JSON.stringify([
          {
            field_name: "campaign_ids",
            filter_type: "IN",
            filter_value: JSON.stringify(input.campaignIds),
          },
        ]),
      );
    }
    return this.get(url.toString());
  }

  async getAdvertiser(): Promise<TikTokAdsResponse> {
    const url = new URL(`${this.apiBase}/advertiser/info/`);
    url.searchParams.set(
      "advertiser_ids",
      JSON.stringify([this.creds.advertiserId]),
    );
    return this.get(url.toString());
  }

  private async get(url: string): Promise<TikTokAdsResponse> {
    const result = await requestWithRetry(
      url,
      {
        method: "GET",
        headers: {
          "Access-Token": this.creds.accessToken,
          Accept: "application/json",
        },
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

/**
 * Stage 6.P4.E — TikTok Ads `MarketingProviderInterface` adapter.
 */

import type {
  ConnectionTestResult,
  ConversionEventInput,
  ConversionEventResult,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
  MarketingProviderInterface,
  MarketingProviderName,
  MarketingWebhookEvent,
  TikTokAdsCredentials,
} from "../../types";
import { TikTokAdsClient, type TikTokAdsClientOptions } from "./client";
import {
  mapTikTokCampaign,
  mapTikTokMetrics,
  parseTikTokList,
} from "./parsers";

const PROVIDER: MarketingProviderName = "tiktok_ads";
const DEFAULT_CURRENCY = "USD";

export interface TikTokAdsProviderOptions extends TikTokAdsClientOptions {
  defaultCurrency?: string;
}

export class TikTokAdsProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName = PROVIDER;
  private readonly client: TikTokAdsClient;
  private readonly defaultCurrency: string;

  constructor(
    credentials: TikTokAdsCredentials,
    opts: TikTokAdsProviderOptions = {},
  ) {
    this.client = new TikTokAdsClient(credentials, opts);
    this.defaultCurrency = opts.defaultCurrency ?? DEFAULT_CURRENCY;
  }

  async fetchCampaigns(): Promise<MarketingCampaignRecord[]> {
    let result;
    try {
      result = await this.client.listCampaigns();
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    const rows = parseTikTokList(result.body);
    const out: MarketingCampaignRecord[] = [];
    for (const row of rows) {
      const projected = mapTikTokCampaign(row);
      if (projected) {
        projected.budgetCurrency =
          projected.budgetCurrency ?? this.defaultCurrency;
        out.push(projected);
      }
    }
    return out;
  }

  async fetchMetrics(input: {
    campaignIds: string[];
    since: Date;
    until: Date;
  }): Promise<MarketingMetricsForDate[]> {
    let result;
    try {
      result = await this.client.getCampaignReport({
        since: input.since,
        until: input.until,
        campaignIds:
          input.campaignIds.length > 0 ? input.campaignIds : undefined,
      });
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    const rows = parseTikTokList(result.body);
    const out: MarketingMetricsForDate[] = [];
    for (const row of rows) {
      const projected = mapTikTokMetrics(row, {
        currency: this.defaultCurrency,
      });
      if (projected) out.push(projected);
    }
    return out;
  }

  async pullAnalyticsTouchpoints(): Promise<[]> {
    return [];
  }

  async sendConversionEvent(
    _event: ConversionEventInput,
  ): Promise<ConversionEventResult> {
    // TikTok's Events API would land alongside the Pixel surface;
    // for the bootstrap we route conversion firing through GA4.
    return {
      success: true,
      externalEventId: undefined,
      error:
        "TikTok Events API is not wired in P4.E — conversion events route through GA4 / Pixel.",
    };
  }

  verifyWebhook(
    _payload: string,
    _signature: string,
    _secret: string,
  ): boolean {
    return false;
  }

  parseWebhook(
    _payload: Record<string, unknown>,
  ): MarketingWebhookEvent | null {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    let result;
    try {
      result = await this.client.getAdvertiser();
    } catch (err) {
      return {
        connected: false,
        details: {
          provider: PROVIDER,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        status: result.status,
      },
    };
  }
}

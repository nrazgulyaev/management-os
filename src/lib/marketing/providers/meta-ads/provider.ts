/**
 * Stage 6.P4.D — Meta Ads `MarketingProviderInterface` adapter.
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
  MetaAdsCredentials,
} from "../../types";
import { MetaAdsClient, type MetaAdsClientOptions } from "./client";
import {
  mapMetaCampaign,
  mapMetaInsightsToMetrics,
  parseListResponse,
} from "./parsers";

const PROVIDER: MarketingProviderName = "meta_ads";
const DEFAULT_CURRENCY = "USD";

export interface MetaAdsProviderOptions extends MetaAdsClientOptions {
  defaultCurrency?: string;
  conversionActionTypes?: string[];
  attributionSetting?: string;
}

export class MetaAdsProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName = PROVIDER;
  private readonly client: MetaAdsClient;
  private readonly defaultCurrency: string;
  private readonly conversionActionTypes?: string[];
  private readonly attributionSetting?: string;

  constructor(
    credentials: MetaAdsCredentials,
    opts: MetaAdsProviderOptions = {},
  ) {
    this.client = new MetaAdsClient(credentials, opts);
    this.defaultCurrency = opts.defaultCurrency ?? DEFAULT_CURRENCY;
    this.conversionActionTypes = opts.conversionActionTypes;
    this.attributionSetting = opts.attributionSetting;
  }

  async fetchCampaigns(): Promise<MarketingCampaignRecord[]> {
    let result;
    try {
      result = await this.client.listCampaigns({ limit: 200 });
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    const rows = parseListResponse(result.body);
    const out: MarketingCampaignRecord[] = [];
    for (const row of rows) {
      const projected = mapMetaCampaign(row);
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
      result = await this.client.getCampaignInsights({
        since: input.since,
        until: input.until,
        campaignIds:
          input.campaignIds.length > 0 ? input.campaignIds : undefined,
        attributionSetting: this.attributionSetting,
      });
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    const rows = parseListResponse(result.body);
    const out: MarketingMetricsForDate[] = [];
    for (const row of rows) {
      const projected = mapMetaInsightsToMetrics(row, {
        currency: this.defaultCurrency,
        conversionActionTypes: this.conversionActionTypes,
      });
      if (projected) out.push(projected);
    }
    return out;
  }

  /** Meta Ads attribution lives inside Ads Manager — single-source-of-truth
   *  for the unified attribution engine is the touchpoints table populated
   *  by GA4 + the JS Tag. */
  async pullAnalyticsTouchpoints(): Promise<[]> {
    return [];
  }

  /** Conversion-event firing for Meta is the Pixel Conversions API
   *  surface (P4.B). Meta Ads imports those events automatically when
   *  the Pixel is linked to the ad account. */
  async sendConversionEvent(
    _event: ConversionEventInput,
  ): Promise<ConversionEventResult> {
    return {
      success: true,
      externalEventId: undefined,
      error:
        "Meta Ads conversion uploads are routed via Pixel Conversions API — see MetaPixelProvider.sendConversionEvent (P4.B).",
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
      result = await this.client.getAccount();
    } catch (err) {
      return {
        connected: false,
        details: {
          provider: PROVIDER,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
    let currency: string | undefined;
    let accountId: string | undefined;
    let accountStatus: number | undefined;
    if (result.status >= 200 && result.status < 300) {
      try {
        const parsed = JSON.parse(result.body) as Record<string, unknown>;
        if (typeof parsed["currency"] === "string")
          currency = parsed["currency"] as string;
        if (typeof parsed["id"] === "string")
          accountId = parsed["id"] as string;
        if (typeof parsed["account_status"] === "number")
          accountStatus = parsed["account_status"] as number;
      } catch {
        // ignore
      }
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        status: result.status,
        accountId,
        currency,
        accountStatus,
      },
    };
  }
}

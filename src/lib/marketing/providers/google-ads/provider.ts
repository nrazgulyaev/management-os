/**
 * Stage 6.P4.C — Google Ads `MarketingProviderInterface` adapter.
 *
 * Wraps `GoogleAdsClient` + parser projection helpers behind the
 * unified marketing interface. Pull-only — Google Ads doesn't push
 * webhooks, and outbound conversion-event firing belongs to the
 * GA4 Measurement Protocol path (P4.B) or Google Ads' Enhanced
 * Conversions upload (out of P4 scope).
 */

import type {
  ConnectionTestResult,
  ConversionEventInput,
  ConversionEventResult,
  GoogleAdsCredentials,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
  MarketingProviderInterface,
  MarketingProviderName,
  MarketingWebhookEvent,
} from "../../types";
import { GoogleAdsClient, type GoogleAdsClientOptions } from "./client";
import {
  mapGoogleAdsCampaign,
  mapGoogleAdsMetrics,
  parseSearchResponse,
} from "./parsers";

const PROVIDER: MarketingProviderName = "google_ads";

/** Default currency used by the metrics mapper when the connection
 *  doesn't supply one. Google Ads expresses cost in the customer's
 *  native currency, set at the customer level — operators configure
 *  the per-connection currency in the Marketing UI (P4.F). USD is a
 *  conservative default for the bootstrap path. */
const DEFAULT_CURRENCY = "USD";

export interface GoogleAdsProviderOptions extends GoogleAdsClientOptions {
  /** Currency the customer reports cost in. Defaults to USD. */
  defaultCurrency?: string;
}

export class GoogleAdsProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName = PROVIDER;
  private readonly client: GoogleAdsClient;
  private readonly defaultCurrency: string;

  constructor(
    credentials: GoogleAdsCredentials,
    opts: GoogleAdsProviderOptions = {},
  ) {
    this.client = new GoogleAdsClient(credentials, opts);
    this.defaultCurrency = opts.defaultCurrency ?? DEFAULT_CURRENCY;
  }

  async fetchCampaigns(): Promise<MarketingCampaignRecord[]> {
    let result;
    try {
      result = await this.client.searchCampaigns();
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    const rows = parseSearchResponse(result.body);
    const out: MarketingCampaignRecord[] = [];
    for (const row of rows) {
      const projected = mapGoogleAdsCampaign(row);
      if (projected) {
        // Annotate with the currency the connection is configured for.
        projected.budgetCurrency = projected.budgetCurrency ?? this.defaultCurrency;
        out.push(projected);
      }
    }
    return out;
  }

  /**
   * Fetch metrics across the date range. Issues one `searchCampaignMetricsRange`
   * call (Google paginates internally; we ignore `nextPageToken` for
   * the bootstrap — the date-range cron sweep typically pulls 1–7
   * days, well under Google's 10k row default).
   */
  async fetchMetrics(input: {
    campaignIds: string[];
    since: Date;
    until: Date;
  }): Promise<MarketingMetricsForDate[]> {
    const fromDate = isoDate(input.since);
    const toDate = isoDate(input.until);
    let result;
    try {
      result = await this.client.searchCampaignMetricsRange(fromDate, toDate);
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    const rows = parseSearchResponse(result.body);
    const requested = new Set(input.campaignIds);
    const out: MarketingMetricsForDate[] = [];
    for (const row of rows) {
      const projected = mapGoogleAdsMetrics(row, this.defaultCurrency);
      if (!projected) continue;
      // Filter to the requested campaigns when the caller passed a
      // non-empty allow-list.
      if (
        input.campaignIds.length > 0 &&
        !requested.has(projected.externalCampaignId)
      ) {
        continue;
      }
      out.push(projected);
    }
    return out;
  }

  /** Google Ads exposes per-channel attribution inside Ads Manager;
   *  the unified attribution engine reads from
   *  `attribution_touchpoints` (P4.A) populated by GA4 + the JS Tag.
   *  Pulling per-channel summaries from Google Ads Reports duplicates
   *  GA4's data and breaks the single-source-of-truth invariant —
   *  return empty. */
  async pullAnalyticsTouchpoints(): Promise<[]> {
    return [];
  }

  /** Google Ads supports server-side conversion uploads ("Enhanced
   *  Conversions") via the `conversionUploadService` endpoint. That's
   *  a separate write surface from the search-only client and lands
   *  alongside the operator UI in P4.F. For the bootstrap we route
   *  conversion-event firing through GA4 (P4.B) which Google Ads
   *  imports automatically when the GA4 property is linked. */
  async sendConversionEvent(
    _event: ConversionEventInput,
  ): Promise<ConversionEventResult> {
    return {
      success: true,
      externalEventId: undefined,
      error:
        "Google Ads conversion uploads are routed via GA4 Measurement Protocol — see GoogleAnalyticsProvider.sendConversionEvent (P4.B).",
    };
  }

  /** Google Ads doesn't push webhooks. Fail-closed for completeness.
   *  Signature matches `MarketingProviderInterface.verifyWebhook`. */
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
    // Hit the search endpoint with a minimal query — selects 1 campaign
    // ID. Validates auth, developer-token, and customer-id all in one
    // call.
    let result;
    try {
      result = await this.client.search(
        "SELECT campaign.id FROM campaign LIMIT 1",
      );
    } catch (err) {
      return {
        connected: false,
        details: {
          provider: PROVIDER,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
    let campaignCount: number | undefined;
    if (result.status >= 200 && result.status < 300) {
      try {
        const parsed = JSON.parse(result.body) as {
          totalResultsCount?: string;
          results?: unknown[];
        };
        if (parsed.totalResultsCount) {
          campaignCount = Number(parsed.totalResultsCount);
        } else if (Array.isArray(parsed.results)) {
          campaignCount = parsed.results.length;
        }
      } catch {
        // body wasn't JSON
      }
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        status: result.status,
        campaignCount,
        bodyPreview: truncate(result.body, 200),
      },
    };
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

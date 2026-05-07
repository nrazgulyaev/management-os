/**
 * Stage 6.P4.B — Google Analytics 4 `MarketingProviderInterface` adapter.
 *
 * Wraps `GoogleAnalyticsClient` + the parser projection helpers so
 * the cron sweep + UI + service layer don't need to know which
 * marketing provider they're talking to.
 *
 * Two-track surface:
 *   - `sendConversionEvent` → Measurement Protocol (server-side
 *     event firing). No PII required for GA4 (uses client_id only).
 *   - `pullAnalyticsTouchpoints` → Reporting Data API runs the
 *     traffic-sources report and projects per-channel touchpoint
 *     summaries.
 *   - `fetchCampaigns` / `fetchMetrics` → empty arrays. GA4 isn't
 *     a campaign-management surface; the campaign data comes from
 *     Google Ads (P4.C).
 */

import type {
  AttributionTouchpointRecord,
  ConnectionTestResult,
  ConversionEventInput,
  ConversionEventResult,
  GoogleAnalyticsCredentials,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
  MarketingProviderInterface,
  MarketingProviderName,
  MarketingWebhookEvent,
} from "../../types";
import {
  GoogleAnalyticsClient,
  type GoogleAnalyticsClientOptions,
} from "./client";
import { projectTrafficSources } from "./parsers";

const PROVIDER: MarketingProviderName = "google_analytics";

export class GoogleAnalyticsProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName = PROVIDER;
  private readonly client: GoogleAnalyticsClient;

  constructor(
    credentials: GoogleAnalyticsCredentials,
    opts: GoogleAnalyticsClientOptions = {},
  ) {
    this.client = new GoogleAnalyticsClient(credentials, opts);
  }

  async fetchCampaigns(): Promise<MarketingCampaignRecord[]> {
    return [];
  }

  async fetchMetrics(): Promise<MarketingMetricsForDate[]> {
    return [];
  }

  async pullAnalyticsTouchpoints(input: {
    since: Date;
    until: Date;
  }): Promise<AttributionTouchpointRecord[]> {
    const startDate = isoDate(input.since);
    const endDate = isoDate(input.until);
    let result;
    try {
      result = await this.client.getTrafficSources({ startDate, endDate });
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    return projectTrafficSources(result.body, input.since);
  }

  async sendConversionEvent(
    event: ConversionEventInput,
  ): Promise<ConversionEventResult> {
    if (!event.clientId) {
      return { success: false, error: "clientId required" };
    }
    const params: Record<string, unknown> = {
      ...(event.customParameters ?? {}),
    };
    if (event.eventValue != null) params["value"] = event.eventValue;
    if (event.currency) params["currency"] = event.currency;
    // Idempotency: GA4 uses `transaction_id` to dedupe purchase events.
    if (event.eventId) params["transaction_id"] = event.eventId;

    let result;
    try {
      result = await this.client.sendEvent({
        clientId: event.clientId,
        events: [
          {
            name: event.eventName,
            params,
          },
        ],
      });
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    // Measurement Protocol returns 204 No Content on success.
    if (result.status >= 200 && result.status < 300) {
      return {
        success: true,
        externalEventId: event.eventId ?? undefined,
      };
    }
    return {
      success: false,
      error: `Measurement Protocol HTTP ${result.status}: ${truncate(
        result.body,
        200,
      )}`,
    };
  }

  /** GA4 does not push webhooks — the analytics flow is pull-only via
   *  the Reporting API. Fail-closed for completeness. Signature
   *  matches `MarketingProviderInterface.verifyWebhook` so the
   *  interface contract holds. */
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
    // Hit the Reporting API with a minimal `runReport` query — pulls
    // a single date+activeUsers row from yesterday.
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    let result;
    try {
      result = await this.client.runReport({
        dimensions: ["date"],
        metrics: ["activeUsers"],
        dateRanges: [
          {
            startDate: isoDate(yesterday),
            endDate: isoDate(today),
          },
        ],
        limit: 1,
      });
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

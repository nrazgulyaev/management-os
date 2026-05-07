/**
 * Stage 6.P4.A — DryRun marketing provider.
 *
 * Default fallback when no credentials are configured. Returns
 * empty/successful responses without making any network calls.
 * Mirrors the Stage 3.A AI / Stage 6.P1.A channel-manager / Stage
 * 6.P2.A messaging / Stage 6.P3.A bank + payment dry-run pattern.
 *
 * Conversion-event firing is the only method that requires a
 * non-empty success response — the calling service-layer routine
 * relies on it to mark `attribution_conversions.first_touch_*` /
 * `last_touch_*` as "fired" even when no real platform got the
 * event. The DryRun returns a synthetic externalEventId.
 */

import type {
  AttributionTouchpointRecord,
  ConnectionTestResult,
  ConversionEventInput,
  ConversionEventResult,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
  MarketingProviderInterface,
  MarketingProviderName,
} from "../types";

export class DryRunMarketingProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName;

  constructor(provider: MarketingProviderName) {
    this.provider = provider;
  }

  async fetchCampaigns(_input: {
    since?: Date;
    until?: Date;
  }): Promise<MarketingCampaignRecord[]> {
    return [];
  }

  async fetchMetrics(_input: {
    campaignIds: string[];
    since: Date;
    until: Date;
  }): Promise<MarketingMetricsForDate[]> {
    return [];
  }

  async pullAnalyticsTouchpoints(_input: {
    since: Date;
    until: Date;
  }): Promise<AttributionTouchpointRecord[]> {
    return [];
  }

  async sendConversionEvent(
    event: ConversionEventInput,
  ): Promise<ConversionEventResult> {
    return {
      success: true,
      externalEventId: `dryrun_${this.provider}_${event.eventName}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
    };
  }

  /** Fail-closed by default. No real signature can validate against a
   *  DryRun provider, and we don't want a misconfigured connection to
   *  silently accept every webhook. */
  verifyWebhook(
    _payload: string,
    _signature: string,
    _secret: string,
  ): boolean {
    return false;
  }

  parseWebhook(_payload: Record<string, unknown>) {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      connected: true,
      details: {
        provider: this.provider,
        mode: "dry_run",
        note: "DryRun provider — no real marketing API calls. Configure credentials to go live.",
      },
    };
  }
}

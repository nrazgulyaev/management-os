/**
 * Stage 6.P4.E — ConvertKit `MarketingProviderInterface` adapter.
 *
 * ConvertKit's API uses two keys: `api_key` (write) and `api_secret`
 * (read). For metrics + campaign listing we use `api_secret` since
 * those endpoints require it.
 *
 * Endpoints (v3):
 *   GET /v3/broadcasts?api_secret=  — list broadcasts (campaigns)
 *   GET /v3/broadcasts/{id}/stats?api_secret=  — engagement metrics
 *
 * Like Mailchimp: zero spend, "conversions" mapped to engagement
 * (unique opens), no daily breakdown — one row per broadcast.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type {
  ConnectionTestResult,
  ConvertKitCredentials,
  ConversionEventInput,
  ConversionEventResult,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
  MarketingProviderInterface,
  MarketingProviderName,
  MarketingWebhookEvent,
} from "../../types";

const PROVIDER: MarketingProviderName = "convertkit";
const CONVERTKIT_API_BASE = "https://api.convertkit.com/v3";

export interface ConvertKitProviderOptions extends RetryOptions {
  apiBase?: string;
  defaultCurrency?: string;
}

export class ConvertKitProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName = PROVIDER;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly apiSecret: string;
  private readonly defaultCurrency: string;

  constructor(
    credentials: ConvertKitCredentials,
    opts: ConvertKitProviderOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? CONVERTKIT_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.apiSecret = credentials.apiSecret;
    this.defaultCurrency = opts.defaultCurrency ?? "USD";
  }

  async fetchCampaigns(): Promise<MarketingCampaignRecord[]> {
    let result;
    try {
      result = await requestWithRetry(
        `${this.apiBase}/broadcasts?api_secret=${encodeURIComponent(this.apiSecret)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        this.retryOpts,
      );
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    let parsed: { broadcasts?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(result.body) as {
        broadcasts?: Array<Record<string, unknown>>;
      };
    } catch {
      return [];
    }
    const rows = parsed.broadcasts ?? [];
    const out: MarketingCampaignRecord[] = [];
    for (const row of rows) {
      const id = pickStr(row["id"]) ?? pickStrFromNum(row["id"]);
      const subject = pickStr(row["subject"]);
      if (!id || !subject) continue;
      out.push({
        externalCampaignId: id,
        campaignName: subject,
        campaignType: "broadcast",
        campaignObjective: undefined,
        status: row["published_at"] ? "completed" : "draft",
        startDate: pickIsoDate(row["created_at"]),
        endDate: pickIsoDate(row["published_at"]),
        budgetCurrency: this.defaultCurrency,
        rawPayload: row,
      });
    }
    return out;
  }

  async fetchMetrics(input: {
    campaignIds: string[];
    since: Date;
    until: Date;
  }): Promise<MarketingMetricsForDate[]> {
    // Per ConvertKit's API, stats are fetched per-broadcast. We
    // call /stats for each requested broadcast.
    const out: MarketingMetricsForDate[] = [];
    for (const id of input.campaignIds) {
      let result;
      try {
        result = await requestWithRetry(
          `${this.apiBase}/broadcasts/${encodeURIComponent(id)}/stats?api_secret=${encodeURIComponent(this.apiSecret)}`,
          { method: "GET", headers: { Accept: "application/json" } },
          this.retryOpts,
        );
      } catch {
        continue;
      }
      if (result.status < 200 || result.status >= 300) continue;
      let parsed: { broadcast?: Record<string, unknown> };
      try {
        parsed = JSON.parse(result.body) as {
          broadcast?: Record<string, unknown>;
        };
      } catch {
        continue;
      }
      const broadcast = parsed.broadcast;
      if (!broadcast) continue;
      const stats =
        (broadcast["stats"] as Record<string, unknown> | undefined) ?? {};
      const recipients = pickBigInt(stats["recipients"]) ?? 0n;
      const opens = pickBigInt(stats["open_rate"]) ?? 0n;
      const uniqueOpens = pickBigInt(stats["unique_opens"]) ?? 0n;
      const clicks = pickBigInt(stats["clicks"]) ?? 0n;
      const sentAt = pickIsoDate(broadcast["created_at"]);
      if (!sentAt) continue;
      if (sentAt < input.since || sentAt > input.until) continue;
      out.push({
        externalCampaignId: id,
        metricDate: sentAt,
        spendMinor: 0n,
        spendCurrency: this.defaultCurrency,
        impressions: recipients,
        clicks,
        clickThroughRate:
          recipients > 0n ? Number(clicks) / Number(recipients) : undefined,
        conversions: uniqueOpens > 0n ? uniqueOpens : opens,
        conversionValueMinor: 0n,
        rawMetrics: broadcast,
      });
    }
    return out;
  }

  async pullAnalyticsTouchpoints(): Promise<[]> {
    return [];
  }

  async sendConversionEvent(
    _event: ConversionEventInput,
  ): Promise<ConversionEventResult> {
    return {
      success: true,
      externalEventId: undefined,
      error: "ConvertKit metrics surface via broadcast stats; no event API.",
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
      result = await requestWithRetry(
        `${this.apiBase}/account?api_secret=${encodeURIComponent(this.apiSecret)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        this.retryOpts,
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
    return {
      connected: result.status >= 200 && result.status < 300,
      details: { provider: PROVIDER, status: result.status },
    };
  }
}

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function pickStrFromNum(v: unknown): string | undefined {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;
}
function pickBigInt(v: unknown): bigint | undefined {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v))
    return BigInt(Math.trunc(v));
  return undefined;
}
function pickIsoDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

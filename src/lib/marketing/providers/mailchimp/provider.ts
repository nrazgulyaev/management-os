/**
 * Stage 6.P4.E — Mailchimp `MarketingProviderInterface` adapter.
 *
 * Mailchimp's API is structured differently from ad platforms:
 *   - "Campaigns" = email-marketing campaigns (one-shot or RSS).
 *   - Metrics = opens / clicks / bounces / unsubscribes (NOT
 *     impressions / spend / ROAS in the ad-platform sense).
 *
 * The mapper projects email metrics onto our `MarketingMetricsForDate`
 * shape:
 *   - `impressions`  ← `emails_sent`
 *   - `clicks`       ← `clicks.unique_clicks`
 *   - `conversions`  ← `clicks.unique_subscriber_clicks` (best proxy
 *                       for Mailchimp's "engagement")
 *   - `spend`        ← 0 (Mailchimp is per-list pricing, not per-campaign)
 *
 * Auth: HTTP Basic with `anystring:apiKey`. The datacenter (e.g.
 * `us1`, `us20`) is suffixed in the api_key — extracted to build
 * the API base URL.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type {
  ConnectionTestResult,
  ConversionEventInput,
  ConversionEventResult,
  MailchimpCredentials,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
  MarketingProviderInterface,
  MarketingProviderName,
  MarketingWebhookEvent,
} from "../../types";

const PROVIDER: MarketingProviderName = "mailchimp";

export interface MailchimpProviderOptions extends RetryOptions {
  apiBase?: string;
  defaultCurrency?: string;
}

/** Extract the datacenter suffix from a Mailchimp API key.
 *  e.g. `abc123-us1` → "us1". Returns "us1" as a safe default. */
export function extractDatacenter(apiKey: string): string {
  const m = apiKey.match(/-([a-z]{2,3}\d+)$/i);
  return m ? m[1] : "us1";
}

export class MailchimpProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName = PROVIDER;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly authHeader: string;
  private readonly defaultCurrency: string;

  constructor(
    credentials: MailchimpCredentials,
    opts: MailchimpProviderOptions = {},
  ) {
    const dc = extractDatacenter(credentials.apiKey);
    this.apiBase = opts.apiBase ?? `https://${dc}.api.mailchimp.com/3.0`;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.authHeader =
      "Basic " +
      Buffer.from(`anystring:${credentials.apiKey}`).toString("base64");
    this.defaultCurrency = opts.defaultCurrency ?? "USD";
  }

  async fetchCampaigns(): Promise<MarketingCampaignRecord[]> {
    let result;
    try {
      result = await requestWithRetry(
        `${this.apiBase}/campaigns?count=200`,
        {
          method: "GET",
          headers: {
            Authorization: this.authHeader,
            Accept: "application/json",
          },
        },
        this.retryOpts,
      );
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    let parsed: { campaigns?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(result.body) as {
        campaigns?: Array<Record<string, unknown>>;
      };
    } catch {
      return [];
    }
    const rows = parsed.campaigns ?? [];
    const out: MarketingCampaignRecord[] = [];
    for (const row of rows) {
      const id = pickStr(row["id"]);
      const settings =
        (row["settings"] as Record<string, unknown> | undefined) ?? {};
      const name = pickStr(settings["title"]) ?? pickStr(settings["subject_line"]);
      if (!id || !name) continue;
      const status = mapMailchimpStatus(row["status"]);
      out.push({
        externalCampaignId: id,
        campaignName: name,
        campaignType: pickStr(row["type"]),
        campaignObjective: undefined,
        status,
        startDate: pickIsoDate(row["send_time"]),
        endDate: undefined,
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
    // Mailchimp doesn't expose a daily metrics breakdown — reports
    // are cumulative-per-campaign. We project a single row per
    // campaign keyed to the campaign's send_time falling in the range.
    let result;
    try {
      result = await requestWithRetry(
        `${this.apiBase}/reports?count=200`,
        {
          method: "GET",
          headers: {
            Authorization: this.authHeader,
            Accept: "application/json",
          },
        },
        this.retryOpts,
      );
    } catch {
      return [];
    }
    if (result.status < 200 || result.status >= 300) return [];
    let parsed: { reports?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(result.body) as {
        reports?: Array<Record<string, unknown>>;
      };
    } catch {
      return [];
    }
    const rows = parsed.reports ?? [];
    const requested = new Set(input.campaignIds);
    const out: MarketingMetricsForDate[] = [];
    for (const row of rows) {
      const id = pickStr(row["id"]);
      if (!id) continue;
      if (input.campaignIds.length > 0 && !requested.has(id)) continue;
      const sendTime = pickIsoDate(row["send_time"]);
      if (!sendTime) continue;
      if (sendTime < input.since || sendTime > input.until) continue;
      const sent = pickBigInt(row["emails_sent"]) ?? 0n;
      const clickStats =
        (row["clicks"] as Record<string, unknown> | undefined) ?? {};
      const opensStats =
        (row["opens"] as Record<string, unknown> | undefined) ?? {};
      const clicks = pickBigInt(clickStats["unique_clicks"]) ?? 0n;
      const opens = pickBigInt(opensStats["unique_opens"]) ?? 0n;
      out.push({
        externalCampaignId: id,
        metricDate: sendTime,
        spendMinor: 0n,
        spendCurrency: this.defaultCurrency,
        impressions: sent,
        clicks,
        clickThroughRate:
          sent > 0n ? Number(clicks) / Number(sent) : undefined,
        conversions: opens,
        conversionValueMinor: 0n,
        rawMetrics: row,
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
      error:
        "Mailchimp doesn't accept conversion events — engagement metrics surface via campaign reports.",
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
        `${this.apiBase}/ping`,
        {
          method: "GET",
          headers: {
            Authorization: this.authHeader,
            Accept: "application/json",
          },
        },
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
      details: {
        provider: PROVIDER,
        status: result.status,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests
// ---------------------------------------------------------------------------

import type { CampaignStatus } from "../../types";

export function mapMailchimpStatus(status: unknown): CampaignStatus {
  if (typeof status !== "string") return "unknown";
  const s = status.toLowerCase();
  if (s === "sent") return "completed";
  if (s === "sending") return "active";
  if (s === "schedule" || s === "scheduled") return "active";
  if (s === "save" || s === "draft") return "draft";
  if (s === "paused") return "paused";
  if (s === "archived") return "archived";
  return "unknown";
}

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
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

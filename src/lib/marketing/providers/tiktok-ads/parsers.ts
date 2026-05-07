/**
 * Stage 6.P4.E — TikTok Ads → unified domain projection. Pure helpers.
 *
 * TikTok response envelope:
 *   { code: 0, message: "OK", data: { list: [...] } }
 *
 * Spend is a decimal-major string (same shape as Meta).
 */

import type {
  CampaignStatus,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
} from "../../types";

interface TikTokEnvelope {
  code?: number;
  message?: string;
  data?: {
    list?: Array<Record<string, unknown>>;
    page_info?: Record<string, unknown>;
  };
}

export function parseTikTokList(
  body: string,
): Array<Record<string, unknown>> {
  let parsed: TikTokEnvelope;
  try {
    parsed = JSON.parse(body) as TikTokEnvelope;
  } catch {
    return [];
  }
  return parsed.data?.list ?? [];
}

/** TikTok → minor (cents). Decimal-major-string input. */
export function tiktokSpendToMinor(value: unknown): bigint {
  if (value == null) return 0n;
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.length > 0) n = Number(value);
  else return 0n;
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * 100));
}

export function mapTikTokCampaignStatus(
  operationStatus: unknown,
  secondaryStatus: unknown,
): CampaignStatus {
  const op = pickStr(operationStatus)?.toUpperCase();
  const sec = pickStr(secondaryStatus)?.toUpperCase();
  if (op === "ENABLE") return "active";
  if (op === "DISABLE") return "paused";
  if (sec && sec.includes("DELETE")) return "archived";
  if (sec === "STATUS_DELETE") return "archived";
  if (sec === "CAMPAIGN_STATUS_PHASE_OUT") return "completed";
  return "unknown";
}

export function mapTikTokCampaign(
  row: Record<string, unknown>,
): MarketingCampaignRecord | null {
  const id = pickStr(row["campaign_id"]);
  const name = pickStr(row["campaign_name"]);
  if (!id || !name) return null;
  const status = mapTikTokCampaignStatus(
    row["operation_status"],
    row["secondary_status"],
  );
  const objective = pickStr(row["objective_type"]);
  const startDate = pickIsoDate(row["schedule_start_time"]);
  const endDate = pickIsoDate(row["schedule_end_time"]);

  // TikTok exposes both campaign-level and ad-group-level budgets;
  // we surface campaign-level when present.
  let budgetMinor: bigint | undefined;
  let budgetType: "daily" | "lifetime" | undefined;
  const dailyBudget = row["budget"];
  const budgetMode = pickStr(row["budget_mode"]);
  if (dailyBudget != null) {
    budgetMinor = tiktokSpendToMinor(dailyBudget);
    if (budgetMode === "BUDGET_MODE_DAY") budgetType = "daily";
    else if (budgetMode === "BUDGET_MODE_TOTAL") budgetType = "lifetime";
  }

  return {
    externalCampaignId: id,
    campaignName: name,
    campaignType: pickStr(row["campaign_type"]),
    campaignObjective: objective,
    status,
    startDate,
    endDate,
    budgetMinor,
    budgetType,
    rawPayload: row,
  };
}

export interface TikTokMetricsMapperOptions {
  currency: string;
}

export function mapTikTokMetrics(
  row: Record<string, unknown>,
  opts: TikTokMetricsMapperOptions,
): MarketingMetricsForDate | null {
  // TikTok report rows have shape:
  //   { dimensions: { campaign_id, stat_time_day }, metrics: {...} }
  const dimensions =
    (row["dimensions"] as Record<string, unknown> | undefined) ?? {};
  const metrics =
    (row["metrics"] as Record<string, unknown> | undefined) ?? {};
  const externalCampaignId = pickStr(dimensions["campaign_id"]);
  const dateStr = pickStr(dimensions["stat_time_day"]);
  if (!externalCampaignId || !dateStr) return null;
  const metricDate = parseIsoDate(dateStr);
  if (!metricDate) return null;

  const spendMinor = tiktokSpendToMinor(metrics["spend"]);
  const impressions = pickBigInt(metrics["impressions"]) ?? 0n;
  const reach = pickBigInt(metrics["reach"]);
  const clicks = pickBigInt(metrics["clicks"]) ?? 0n;
  const ctr = pickNumber(metrics["ctr"]);
  const cpc = metrics["cpc"] != null
    ? tiktokSpendToMinor(metrics["cpc"])
    : undefined;
  const conversions = pickBigInt(metrics["conversion"]) ?? 0n;
  const conversionValueMajor = pickNumber(metrics["conversion_value"]);
  const conversionValueMinor =
    conversionValueMajor != null
      ? BigInt(Math.round(conversionValueMajor * 100))
      : 0n;
  const videoViews = pickBigInt(metrics["video_play_actions"]);

  const costPerConversionMinor =
    conversions > 0n ? spendMinor / conversions : undefined;
  const returnOnAdSpend =
    spendMinor > 0n
      ? Number(conversionValueMinor) / Number(spendMinor)
      : undefined;

  return {
    externalCampaignId,
    metricDate,
    spendMinor,
    spendCurrency: opts.currency,
    impressions,
    reach,
    clicks,
    clickThroughRate: ctr,
    costPerClickMinor: cpc,
    conversions,
    conversionValueMinor,
    costPerConversionMinor,
    returnOnAdSpend,
    videoViews,
    rawMetrics: row,
  };
}

// Helpers
function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function pickNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
function pickBigInt(v: unknown): bigint | undefined {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v))
    return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^-?\d+$/.test(v)) {
    try {
      return BigInt(v);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
function pickIsoDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  return parseIsoDate(v);
}
function parseIsoDate(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

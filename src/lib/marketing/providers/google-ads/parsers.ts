/**
 * Stage 6.P4.C — Google Ads → unified domain projection.
 *
 * Pure helpers — no I/O. Take a Google Ads `googleAds:search`
 * response body and produce normalized records:
 *
 *   - Campaign rows  → MarketingCampaignRecord[]
 *   - Metrics rows   → MarketingMetricsForDate[]
 *
 * **Cost-unit normalization happens here.** Google Ads returns
 * `metrics.cost_micros` and `campaign_budget.amount_micros` where 1
 * USD = 1,000,000 micros = 100 cents. We convert to minor units
 * (cents) so the rest of the system (DB schema, attribution engine,
 * reporting) sees consistent units across providers — same invariant
 * as the P3 banking parsers.
 *
 * Conversion: `minor = micros / 10_000`. Integer division — Google's
 * cost values are always whole micros so this is exact.
 */

import type {
  CampaignBudgetType,
  CampaignStatus,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
} from "../../types";

// ---------------------------------------------------------------------------
// Cost-unit conversion
// ---------------------------------------------------------------------------

/**
 * Google Ads micros → minor units (cents).
 *
 * Examples:
 *   1_000_000 micros = 1 USD = 100 cents
 *   1_500_000 micros = 1.50 USD = 150 cents
 *   500_000 micros = 0.50 USD = 50 cents
 *
 * Returns 0 for null / undefined / NaN inputs (caller is responsible
 * for distinguishing "no spend" from "no row").
 */
export function microsToMinor(micros: unknown): bigint {
  if (micros == null) return 0n;
  if (typeof micros === "bigint") return micros / 10_000n;
  if (typeof micros === "number") {
    if (!Number.isFinite(micros)) return 0n;
    return BigInt(Math.trunc(micros)) / 10_000n;
  }
  if (typeof micros === "string" && /^-?\d+$/.test(micros)) {
    try {
      return BigInt(micros) / 10_000n;
    } catch {
      return 0n;
    }
  }
  return 0n;
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Google Ads campaign status enum → our `CampaignStatus`.
 *
 *   ENABLED  → active
 *   PAUSED   → paused
 *   REMOVED  → archived
 *   anything else → unknown
 */
export function mapCampaignStatus(status: unknown): CampaignStatus {
  if (typeof status !== "string") return "unknown";
  const s = status.toUpperCase();
  if (s === "ENABLED") return "active";
  if (s === "PAUSED") return "paused";
  if (s === "REMOVED") return "archived";
  if (s === "DRAFT") return "draft";
  return "unknown";
}

/**
 * Google Ads budget delivery method → our `CampaignBudgetType`.
 *
 * Google's `period` field: DAILY / FIXED_DAILY / CUSTOM_PERIOD. We
 * normalize to our 2-value FSM:
 *   DAILY / FIXED_DAILY → "daily"
 *   CUSTOM_PERIOD       → "lifetime"
 *   anything else       → undefined (caller decides)
 */
export function mapBudgetType(
  period: unknown,
): CampaignBudgetType | undefined {
  if (typeof period !== "string") return undefined;
  const p = period.toUpperCase();
  if (p === "DAILY" || p === "FIXED_DAILY") return "daily";
  if (p === "CUSTOM_PERIOD" || p === "TOTAL") return "lifetime";
  return undefined;
}

// ---------------------------------------------------------------------------
// Native API row shape — kept untyped at the boundary, projected here
// ---------------------------------------------------------------------------

interface GoogleAdsSearchResponse {
  results?: Array<Record<string, unknown>>;
  fieldMask?: string;
  totalResultsCount?: string;
  nextPageToken?: string;
}

/**
 * Generic body parser — extracts the `results` array from the
 * Google Ads search response. Returns empty array on malformed JSON.
 */
export function parseSearchResponse(body: string): Array<Record<string, unknown>> {
  let parsed: GoogleAdsSearchResponse;
  try {
    parsed = JSON.parse(body) as GoogleAdsSearchResponse;
  } catch {
    return [];
  }
  return parsed.results ?? [];
}

// ---------------------------------------------------------------------------
// Campaign mapper
// ---------------------------------------------------------------------------

/**
 * Project a single Google Ads search result row into a
 * `MarketingCampaignRecord`. The row shape depends on the GAQL —
 * for `GAQL_CAMPAIGNS` we expect `campaign.*` + `campaign_budget.*`.
 *
 * Returns null when the row is missing the required `id` / `name`
 * fields (defensive; callers can filter null out).
 */
export function mapGoogleAdsCampaign(
  row: Record<string, unknown>,
): MarketingCampaignRecord | null {
  const campaign = (row["campaign"] as Record<string, unknown> | undefined) ?? {};
  const budget = (row["campaignBudget"] as Record<string, unknown> | undefined) ?? {};
  const id = String(campaign["id"] ?? "");
  const name = String(campaign["name"] ?? "");
  if (!id || !name) return null;

  const status = mapCampaignStatus(campaign["status"]);
  const startDate = pickDate(campaign["startDate"]);
  const endDate = pickDate(campaign["endDate"]);
  const budgetMinor = budget["amountMicros"] != null
    ? microsToMinor(budget["amountMicros"])
    : undefined;
  const budgetType = mapBudgetType(budget["period"]);

  // Type / objective — Google Ads exposes these as `advertising_channel_type`
  // and `bidding_strategy_type`. We surface them as descriptive strings
  // so the UI can display them without knowing the enum values.
  const campaignType = pickStr(campaign["advertisingChannelType"]);
  const campaignObjective = pickStr(campaign["biddingStrategyType"]);

  return {
    externalCampaignId: id,
    campaignName: name,
    campaignType,
    campaignObjective,
    status,
    startDate,
    endDate,
    budgetMinor,
    budgetCurrency: undefined, // Google Ads expresses budget in the
    // customer's native currency (defined at the customer level, not
    // per-campaign). The provider fills this in from the connection's
    // `currency` field if needed.
    budgetType,
    rawPayload: row,
  };
}

// ---------------------------------------------------------------------------
// Metrics mapper
// ---------------------------------------------------------------------------

/**
 * Project a single metrics search-result row into a
 * `MarketingMetricsForDate`. The row shape comes from
 * `gaqlCampaignMetricsForDate` / `gaqlCampaignMetricsRange`.
 *
 * Returns null when required fields (campaign id, segments.date) are
 * missing.
 */
export function mapGoogleAdsMetrics(
  row: Record<string, unknown>,
  defaultCurrency: string,
): MarketingMetricsForDate | null {
  const campaign = (row["campaign"] as Record<string, unknown> | undefined) ?? {};
  const segments = (row["segments"] as Record<string, unknown> | undefined) ?? {};
  const metrics = (row["metrics"] as Record<string, unknown> | undefined) ?? {};

  const externalCampaignId = String(campaign["id"] ?? "");
  const dateStr = pickStr(segments["date"]);
  if (!externalCampaignId || !dateStr) return null;
  const metricDate = parseIsoDate(dateStr);
  if (!metricDate) return null;

  const spendMinor = microsToMinor(metrics["costMicros"]);
  // Google Ads CTR is a fraction (0.0–1.0). Pass through directly.
  const clickThroughRate =
    typeof metrics["ctr"] === "number"
      ? (metrics["ctr"] as number)
      : typeof metrics["ctr"] === "string"
        ? Number(metrics["ctr"])
        : undefined;

  // average_cpc is in micros too.
  const costPerClickMinor = metrics["averageCpc"] != null
    ? microsToMinor(metrics["averageCpc"])
    : undefined;

  // cost_per_conversion is also in micros.
  const costPerConversionMinor = metrics["costPerConversion"] != null
    ? microsToMinor(metrics["costPerConversion"])
    : undefined;

  // conversions_value is in major units (decimal). Multiply by 100
  // for cents — same shape as the P4.A `conversionValueMinor` column.
  const conversionValueMinor = pickNumber(metrics["conversionsValue"]);

  // Engagements / video views.
  const engagements = pickBigInt(metrics["engagements"]);
  const videoViews = pickBigInt(metrics["videoViews"]);

  // ROAS — Google Ads doesn't expose this directly; compute when we
  // have non-zero spend.
  let returnOnAdSpend: number | undefined;
  if (spendMinor > 0n && conversionValueMinor != null) {
    returnOnAdSpend = (conversionValueMinor * 100) / Number(spendMinor);
  }

  return {
    externalCampaignId,
    metricDate,
    spendMinor,
    spendCurrency: defaultCurrency,
    impressions: pickBigInt(metrics["impressions"]) ?? 0n,
    clicks: pickBigInt(metrics["clicks"]) ?? 0n,
    clickThroughRate,
    costPerClickMinor,
    conversions: pickBigInt(metrics["conversions"]) ?? 0n,
    conversionValueMinor:
      conversionValueMinor != null
        ? BigInt(Math.round(conversionValueMinor * 100))
        : 0n,
    costPerConversionMinor,
    returnOnAdSpend,
    engagements,
    videoViews,
    rawMetrics: metrics,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
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

function pickDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  return parseIsoDate(v);
}

function parseIsoDate(s: string): Date | undefined {
  // Google Ads dates are `yyyy-MM-dd`. Reject anything else to keep
  // the parser strict.
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * Stage 6.P4.D — Meta Ads → unified domain projection.
 *
 * Pure helpers — no I/O. Two load-bearing concerns:
 *
 * 1. **Major-unit string spend**. Meta returns `spend: "12.34"` as
 *    decimal-major. The mapper parses to a `number`, multiplies by
 *    100, and stores as `bigint` minor. Same invariant the P3
 *    banking parsers + P4.C Google Ads parsers preserve.
 * 2. **Conversion aggregation**. Meta's `actions` array carries
 *    typed conversion entries (offsite_conversion.fb_pixel_purchase,
 *    onsite_conversion.lead, etc.). The operator picks which action
 *    types count as conversions; the mapper sums their `value`s.
 */

import type {
  CampaignBudgetType,
  CampaignStatus,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
} from "../../types";

// ---------------------------------------------------------------------------
// Major-unit string → minor bigint
// ---------------------------------------------------------------------------

/**
 * Parse Meta's decimal-major-string to minor bigint.
 *
 *   "12.34"  → 1234n
 *   "0"      → 0n
 *   "1500"   → 150000n
 *   ""       → 0n
 *   null     → 0n
 *
 * Rounds to the nearest cent (Meta returns 2-decimal precision; we
 * round defensively in case a future API version changes that).
 */
export function metaSpendToMinor(value: unknown): bigint {
  if (value == null) return 0n;
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.length > 0) n = Number(value);
  else return 0n;
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * 100));
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Meta has both `status` (campaign-level) and `effective_status`
 * (resolved with parent objects). Prefer `effective_status` when
 * present.
 *
 *   ACTIVE    → active
 *   PAUSED    → paused
 *   DELETED   → archived
 *   ARCHIVED  → archived
 *   COMPLETED → completed
 *   anything else → unknown
 */
export function mapMetaCampaignStatus(
  status: unknown,
  effectiveStatus: unknown,
): CampaignStatus {
  const s = (
    typeof effectiveStatus === "string" && effectiveStatus.length > 0
      ? effectiveStatus
      : typeof status === "string"
        ? status
        : ""
  ).toUpperCase();
  if (s === "ACTIVE") return "active";
  if (s === "PAUSED") return "paused";
  if (s === "DELETED" || s === "ARCHIVED") return "archived";
  if (s === "COMPLETED") return "completed";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Native API row shape
// ---------------------------------------------------------------------------

interface MetaListResponse {
  data?: Array<Record<string, unknown>>;
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

interface MetaActionEntry {
  action_type: string;
  value?: string;
  /** Per-window breakdowns when `action_attribution_windows` is set. */
  "1d_view"?: string;
  "7d_click"?: string;
  "1d_click"?: string;
  "28d_click"?: string;
}

export function parseListResponse(
  body: string,
): Array<Record<string, unknown>> {
  let parsed: MetaListResponse;
  try {
    parsed = JSON.parse(body) as MetaListResponse;
  } catch {
    return [];
  }
  return parsed.data ?? [];
}

// ---------------------------------------------------------------------------
// Campaign mapper
// ---------------------------------------------------------------------------

export function mapMetaCampaign(
  row: Record<string, unknown>,
): MarketingCampaignRecord | null {
  const id = pickStr(row["id"]);
  const name = pickStr(row["name"]);
  if (!id || !name) return null;

  const status = mapMetaCampaignStatus(row["status"], row["effective_status"]);
  const objective = pickStr(row["objective"]);
  const startDate = pickIsoDate(row["start_time"]);
  const endDate = pickIsoDate(row["stop_time"]);

  // Meta returns daily_budget / lifetime_budget as decimal-MAJOR
  // strings. Whichever is set determines budgetType; if both are
  // unset we leave the budget undefined.
  let budgetMinor: bigint | undefined;
  let budgetType: CampaignBudgetType | undefined;
  if (row["daily_budget"]) {
    budgetMinor = metaSpendToMinor(row["daily_budget"]);
    budgetType = "daily";
  } else if (row["lifetime_budget"]) {
    budgetMinor = metaSpendToMinor(row["lifetime_budget"]);
    budgetType = "lifetime";
  }

  return {
    externalCampaignId: id,
    campaignName: name,
    campaignType: pickStr(row["buying_type"]),
    campaignObjective: objective,
    status,
    startDate,
    endDate,
    budgetMinor,
    // Currency comes from the ad account, not the campaign — the
    // provider annotates this in `fetchCampaigns` from the connection's
    // configured currency.
    budgetCurrency: undefined,
    budgetType,
    rawPayload: row,
  };
}

// ---------------------------------------------------------------------------
// Metrics mapper
// ---------------------------------------------------------------------------

export interface MetaMetricsMapperOptions {
  /** Currency code from the ad account (Meta doesn't include it on
   *  insights rows). */
  currency: string;
  /** Action types that count as conversions for this connection.
   *  Default: pixel purchases + leads + completed-registrations. */
  conversionActionTypes?: string[];
}

const DEFAULT_CONVERSION_ACTIONS = [
  "offsite_conversion.fb_pixel_purchase",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_complete_registration",
  "purchase",
  "lead",
];

/**
 * Project a single Meta insights row into the unified
 * `MarketingMetricsForDate`. The `actions` + `action_values` arrays
 * are reduced to a single (conversions, conversionValueMinor) pair
 * by summing entries whose `action_type` is in
 * `conversionActionTypes`.
 */
export function mapMetaInsightsToMetrics(
  row: Record<string, unknown>,
  opts: MetaMetricsMapperOptions,
): MarketingMetricsForDate | null {
  const externalCampaignId = pickStr(row["campaign_id"]);
  const dateStr = pickStr(row["date_start"]);
  if (!externalCampaignId || !dateStr) return null;
  const metricDate = parseIsoDate(dateStr);
  if (!metricDate) return null;

  const conversionTypes = new Set(
    opts.conversionActionTypes ?? DEFAULT_CONVERSION_ACTIONS,
  );

  const spendMinor = metaSpendToMinor(row["spend"]);
  const impressions = pickBigInt(row["impressions"]) ?? 0n;
  const reach = pickBigInt(row["reach"]);
  const frequency = pickNumber(row["frequency"]);
  const clicks = pickBigInt(row["clicks"]) ?? 0n;
  const clickThroughRate = pickNumber(row["ctr"]);
  const costPerClickMinor =
    row["cpc"] != null ? metaSpendToMinor(row["cpc"]) : undefined;

  const actions = (row["actions"] as MetaActionEntry[] | undefined) ?? [];
  const actionValues =
    (row["action_values"] as MetaActionEntry[] | undefined) ?? [];

  let conversions = 0n;
  let conversionValueMinor = 0n;
  for (const a of actions) {
    if (!conversionTypes.has(a.action_type)) continue;
    const v = pickBigInt(a.value);
    if (v != null) conversions += v;
  }
  for (const v of actionValues) {
    if (!conversionTypes.has(v.action_type)) continue;
    const value = pickNumber(v.value);
    if (value != null) {
      conversionValueMinor += BigInt(Math.round(value * 100));
    }
  }

  const costPerConversionMinor =
    conversions > 0n ? spendMinor / conversions : undefined;
  const returnOnAdSpend =
    spendMinor > 0n
      ? Number(conversionValueMinor) / Number(spendMinor)
      : undefined;

  // Video metrics — Meta nests these in `video_play_actions` /
  // `video_thruplay_watched_actions` which are also action arrays.
  const videoPlayActions =
    (row["video_play_actions"] as MetaActionEntry[] | undefined) ?? [];
  const videoViews = videoPlayActions.reduce<bigint>((acc, a) => {
    const v = pickBigInt(a.value);
    return v != null ? acc + v : acc;
  }, 0n);

  return {
    externalCampaignId,
    metricDate,
    spendMinor,
    spendCurrency: opts.currency,
    impressions,
    reach,
    frequency,
    clicks,
    clickThroughRate,
    costPerClickMinor,
    conversions,
    conversionValueMinor,
    costPerConversionMinor,
    returnOnAdSpend,
    videoViews: videoViews > 0n ? videoViews : undefined,
    rawMetrics: row,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

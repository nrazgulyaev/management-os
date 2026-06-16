import "server-only";

/**
 * Stage 6.P4.F — Attribution engine.
 *
 * Reads `attribution_touchpoints` + `attribution_conversions` and
 * computes per-conversion attribution into
 * `attribution_conversions.linear_attribution_data` (JSONB).
 *
 * Decoupled from ingestion — operators can re-run with a different
 * model + lookback window without re-importing.
 *
 * Three responsibilities:
 *   1. `attributeConversion` — pure-ish: given a conversion + its
 *      touchpoints + a model, write the attribution result back to
 *      the conversion row.
 *   2. `runAttributionBackfill` — sweep every unattributed conversion
 *      for an org. Used by the `attribution_engine` cron.
 *   3. `getChannelROI` — aggregate per-channel revenue ÷ spend.
 */

import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  attributionConversions,
  attributionTouchpoints,
  type AttributionConversionRow,
  type AttributionTouchpointRow,
  type ConversionType,
  type TouchpointChannel,
} from "@/lib/db/schema/attribution";
import {
  marketingMetrics,
  marketingCampaigns,
  type P4MarketingMetric,
} from "@/lib/db/schema/p4-marketing";
import {
  computeAttributionWeights,
  type AttributionModel,
  type ModelOptions,
} from "./models";
import type { AttributionTouchpointRecord } from "../types";

export interface AttributionConfig {
  model: AttributionModel;
  /** Lookback window in days. Default 30. */
  lookbackWindowDays?: number;
  /** Conversion types eligible for attribution. Default: all. */
  conversionTypes?: ConversionType[];
  modelOptions?: ModelOptions;
}

export interface AttributionResult {
  firstTouchCampaignId?: string;
  lastTouchCampaignId?: string;
  /** Per-campaign weighted credit — also persisted to
   *  `linear_attribution_data` JSONB. */
  perCampaign: Array<{
    campaignId: string;
    weight: number;
    creditValueMinor: bigint;
  }>;
  touchpointCount: number;
  daysToConvert?: number;
}

/**
 * Compute attribution for a single conversion. Pure-ish: takes the
 * loaded touchpoints + conversion + model, returns the result. The
 * caller persists.
 */
export function attributeConversion(input: {
  conversion: AttributionConversionRow;
  touchpoints: AttributionTouchpointRow[];
  config: AttributionConfig;
}): AttributionResult {
  const { conversion, touchpoints, config } = input;

  // Filter touchpoints to the lookback window AND those before the
  // conversion. Sort ascending by touchpointAt.
  const lookbackMs =
    (config.lookbackWindowDays ?? 30) * 24 * 60 * 60 * 1000;
  const cutoff = new Date(conversion.convertedAt.getTime() - lookbackMs);
  const eligible = touchpoints
    .filter(
      (t) =>
        t.touchpointAt >= cutoff &&
        t.touchpointAt <= conversion.convertedAt,
    )
    .sort((a, b) => a.touchpointAt.getTime() - b.touchpointAt.getTime());

  if (eligible.length === 0) {
    return {
      perCampaign: [],
      touchpointCount: 0,
    };
  }

  // Project to the cross-provider record shape (the model functions
  // accept the unified type).
  const records: AttributionTouchpointRecord[] = eligible.map((t) => ({
    sessionId: t.sessionId ?? undefined,
    clientId: t.clientId ?? undefined,
    userExternalId: t.userExternalId ?? undefined,
    touchpointAt: t.touchpointAt,
    channel: t.channel as TouchpointChannel,
    source: t.source ?? undefined,
    medium: t.medium ?? undefined,
    campaign: t.campaign ?? undefined,
    content: t.content ?? undefined,
    term: t.term ?? undefined,
    referrerUrl: t.referrerUrl ?? undefined,
    landingUrl: t.landingUrl ?? undefined,
  }));

  const weights = computeAttributionWeights(
    records,
    config.model,
    config.modelOptions ?? {},
  );

  // Aggregate by campaignId — multiple touchpoints may share a
  // campaign; combine their weights so the JSONB has one entry per
  // campaign.
  const value = conversion.conversionValueMinor ?? 0n;
  const perCampaignMap = new Map<string, { weight: number }>();
  eligible.forEach((tp, i) => {
    const cid = tp.campaignId;
    if (!cid) return; // touchpoints without a matched campaign drop out
    const w = weights[i] ?? 0;
    const existing = perCampaignMap.get(cid);
    if (existing) existing.weight += w;
    else perCampaignMap.set(cid, { weight: w });
  });

  const perCampaign = Array.from(perCampaignMap.entries()).map(
    ([campaignId, { weight }]) => ({
      campaignId,
      weight,
      creditValueMinor: BigInt(
        Math.round(weight * Number(value)),
      ),
    }),
  );

  const firstTouchCampaignId = eligible[0]?.campaignId ?? undefined;
  const lastTouchCampaignId =
    eligible[eligible.length - 1]?.campaignId ?? undefined;

  const daysToConvert = Math.round(
    (conversion.convertedAt.getTime() - eligible[0].touchpointAt.getTime()) /
      (24 * 60 * 60 * 1000),
  );

  return {
    firstTouchCampaignId: firstTouchCampaignId ?? undefined,
    lastTouchCampaignId: lastTouchCampaignId ?? undefined,
    perCampaign,
    touchpointCount: eligible.length,
    daysToConvert,
  };
}

/**
 * Run attribution over every unattributed conversion in the org. The
 * `attribution_engine` cron calls this hourly.
 *
 * "Unattributed" = `linear_attribution_data IS NULL`. Already-
 * attributed conversions are skipped — re-running with a new model
 * is opt-in via `forceReattribute`.
 */
export async function runAttributionBackfill(input: {
  organizationId: string;
  config: AttributionConfig;
  forceReattribute?: boolean;
  /** Cap rows processed per pass to keep cron lightweight. */
  limit?: number;
}): Promise<{
  scanned: number;
  attributed: number;
  noTouchpoints: number;
}> {
  const db = requireDb();
  const sinceDays = input.config.lookbackWindowDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 2 * 24 * 60 * 60 * 1000);

  const conds = [
    eq(attributionConversions.organizationId, input.organizationId),
    gte(attributionConversions.convertedAt, since),
  ] as const;

  const conversions = input.forceReattribute
    ? await db
        .select()
        .from(attributionConversions)
        .where(and(...conds))
        .limit(input.limit ?? 500)
    : await db
        .select()
        .from(attributionConversions)
        .where(
          and(...conds, isNull(attributionConversions.linearAttributionData)),
        )
        .limit(input.limit ?? 500);

  let attributed = 0;
  let noTouchpoints = 0;
  for (const conv of conversions) {
    // Touchpoints from the lookback window per (clientId / contactId).
    const lookbackMs =
      (input.config.lookbackWindowDays ?? 30) * 24 * 60 * 60 * 1000;
    const cutoff = new Date(conv.convertedAt.getTime() - lookbackMs);

    const tps = await db
      .select()
      .from(attributionTouchpoints)
      .where(
        and(
          eq(attributionTouchpoints.organizationId, input.organizationId),
          gte(attributionTouchpoints.touchpointAt, cutoff),
          lte(attributionTouchpoints.touchpointAt, conv.convertedAt),
          // Match on contact_id when available, else clientId.
          conv.contactId
            ? eq(attributionTouchpoints.contactId, conv.contactId)
            : conv.metadata && typeof conv.metadata === "object"
              ? eq(
                  attributionTouchpoints.clientId,
                  ((conv.metadata as Record<string, unknown>)["clientId"] as
                    | string
                    | null) ?? "",
                )
              : isNull(attributionTouchpoints.id),
        ),
      )
      .orderBy(asc(attributionTouchpoints.touchpointAt));

    if (tps.length === 0) {
      noTouchpoints++;
      continue;
    }

    const result = attributeConversion({
      conversion: conv,
      touchpoints: tps,
      config: input.config,
    });

    await db
      .update(attributionConversions)
      .set({
        firstTouchCampaignId: result.firstTouchCampaignId ?? null,
        lastTouchCampaignId: result.lastTouchCampaignId ?? null,
        linearAttributionData: result.perCampaign.map((c) => ({
          campaignId: c.campaignId,
          weight: c.weight,
          creditValueMinor: c.creditValueMinor.toString(),
        })) as never,
        touchpointCount: result.touchpointCount,
        daysToConvert: result.daysToConvert ?? null,
        updatedAt: new Date(),
      })
      .where(eq(attributionConversions.id, conv.id));
    attributed++;
  }

  return {
    scanned: conversions.length,
    attributed,
    noTouchpoints,
  };
}

/**
 * Aggregate spend (from `marketing_metrics`) and revenue (from
 * `attribution_conversions.linear_attribution_data`) per channel +
 * compute ROI / CPA.
 */
export async function getChannelROI(input: {
  organizationId: string;
  since: Date;
  until: Date;
}): Promise<
  Array<{
    channel: TouchpointChannel;
    spendMinor: bigint;
    revenueMinor: bigint;
    conversions: number;
    roi: number;
    cpaMinor: bigint;
  }>
> {
  const db = requireDb();
  // Pull metrics rows joined to campaigns to recover the platform/
  // channel grouping. We treat each platform's primary channel
  // assignment via a coarse map.
  const metricsRows = await db
    .select({
      campaignId: marketingMetrics.campaignId,
      platform: marketingCampaigns.platform,
      spendMinor: marketingMetrics.spendMinor,
    })
    .from(marketingMetrics)
    .innerJoin(
      marketingCampaigns,
      eq(marketingMetrics.campaignId, marketingCampaigns.id),
    )
    .where(
      and(
        eq(marketingMetrics.organizationId, input.organizationId),
        gte(marketingMetrics.metricDate, toDateString(input.since)),
        lte(marketingMetrics.metricDate, toDateString(input.until)),
      ),
    );

  const spendByChannel = new Map<TouchpointChannel, bigint>();
  for (const r of metricsRows) {
    const ch = platformToChannel(r.platform);
    spendByChannel.set(ch, (spendByChannel.get(ch) ?? 0n) + BigInt(r.spendMinor));
  }

  const conversionsRows = await db
    .select()
    .from(attributionConversions)
    .where(
      and(
        eq(attributionConversions.organizationId, input.organizationId),
        gte(attributionConversions.convertedAt, input.since),
        lte(attributionConversions.convertedAt, input.until),
      ),
    );

  const revenueByChannel = new Map<TouchpointChannel, bigint>();
  const conversionsByChannel = new Map<TouchpointChannel, number>();
  for (const conv of conversionsRows) {
    // We don't know which channel each conv credits without joining
    // back to touchpoints; for the bootstrap aggregate, use the
    // last_touch campaign's platform as the channel proxy when we
    // have one, else attribute to "direct".
    const breakdown =
      (conv.linearAttributionData as Array<{
        campaignId: string;
        creditValueMinor: string;
      }> | null) ?? null;
    if (breakdown) {
      for (const entry of breakdown) {
        const platformRow = await db
          .select({ platform: marketingCampaigns.platform })
          .from(marketingCampaigns)
          .where(
            and(
              eq(marketingCampaigns.id, entry.campaignId),
              eq(marketingCampaigns.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        const ch = platformToChannel(platformRow[0]?.platform);
        revenueByChannel.set(
          ch,
          (revenueByChannel.get(ch) ?? 0n) + BigInt(entry.creditValueMinor),
        );
        conversionsByChannel.set(
          ch,
          (conversionsByChannel.get(ch) ?? 0) + 1,
        );
      }
    } else {
      const ch: TouchpointChannel = "direct";
      revenueByChannel.set(
        ch,
        (revenueByChannel.get(ch) ?? 0n) +
          BigInt(conv.conversionValueMinor ?? 0),
      );
      conversionsByChannel.set(ch, (conversionsByChannel.get(ch) ?? 0) + 1);
    }
  }

  const channels = new Set<TouchpointChannel>([
    ...spendByChannel.keys(),
    ...revenueByChannel.keys(),
  ]);
  return Array.from(channels).map((channel) => {
    const spend = spendByChannel.get(channel) ?? 0n;
    const revenue = revenueByChannel.get(channel) ?? 0n;
    const conversions = conversionsByChannel.get(channel) ?? 0;
    const roi =
      spend > 0n ? Number(revenue) / Number(spend) : 0;
    const cpa =
      conversions > 0 ? spend / BigInt(conversions) : 0n;
    return {
      channel,
      spendMinor: spend,
      revenueMinor: revenue,
      conversions,
      roi,
      cpaMinor: cpa,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function platformToChannel(platform: string | undefined): TouchpointChannel {
  if (!platform) return "other";
  const p = platform.toLowerCase();
  if (p === "google_ads") return "paid_search";
  if (p === "meta_ads") return "paid_social";
  if (p === "tiktok_ads") return "paid_social";
  if (p === "mailchimp" || p === "convertkit") return "email";
  return "other";
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Suppress the unused-import warning for P4MarketingMetric — kept
// for future expansion of the ROI projection (per-platform
// breakdown rather than channel-collapsed).
void undefined as P4MarketingMetric | undefined;

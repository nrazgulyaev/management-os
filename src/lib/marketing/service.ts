"use server";

/**
 * Stage 6.P4.F — MarketingService.
 *
 * Service layer wrapping the provider abstraction + attribution
 * engine. Cron jobs + UI server actions + the JS Tag's touchpoint
 * ingest endpoint all go through this one entry-point so credential
 * decryption + RLS scope happen in one place.
 */

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  marketingCampaigns,
  marketingConnections,
  marketingMetrics,
  type MarketingConnection,
  type MarketingProviderName,
} from "@/lib/db/schema/p4-marketing";
import {
  attributionConversions,
  attributionTouchpoints,
  type ConversionType,
} from "@/lib/db/schema/attribution";
import { selectMarketingProvider } from "./select-provider";
import { openCredentials } from "@/lib/secure-connection-credentials";
import {
  serializeTouchpoint,
  type SerializeTouchpointInput,
} from "./utm-tracker";
import type { MarketingCredentials } from "./types";
import {
  runAttributionBackfill,
  type AttributionConfig,
} from "./attribution/engine";

// ---------------------------------------------------------------------------
// Connection sync — campaigns + metrics
// ---------------------------------------------------------------------------

export interface SyncCampaignsResult {
  connectionId: string;
  ok: boolean;
  inserted: number;
  updated: number;
  failed: number;
  error?: string;
}

export async function syncCampaignsForConnection(
  connectionId: string,
): Promise<SyncCampaignsResult> {
  const db = requireDb();
  const [conn] = await db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.id, connectionId))
    .limit(1);
  if (!conn) {
    return {
      connectionId,
      ok: false,
      inserted: 0,
      updated: 0,
      failed: 0,
      error: "connection not found",
    };
  }
  if (conn.status !== "active") {
    return {
      connectionId,
      ok: true,
      inserted: 0,
      updated: 0,
      failed: 0,
    };
  }
  const credentials = openCredentials<MarketingCredentials>(conn.credentials);
  const provider = selectMarketingProvider(
    conn.provider as MarketingProviderName,
    credentials,
  );

  let campaigns;
  try {
    campaigns = await provider.fetchCampaigns({});
  } catch (err) {
    await db
      .update(marketingConnections)
      .set({
        lastSyncStatus: "failed",
        lastSyncError: (err instanceof Error ? err.message : String(err)).slice(
          0,
          500,
        ),
        updatedAt: new Date(),
      })
      .where(eq(marketingConnections.id, connectionId));
    return {
      connectionId,
      ok: false,
      inserted: 0,
      updated: 0,
      failed: 1,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  for (const c of campaigns) {
    try {
      const [existing] = await db
        .select({ id: marketingCampaigns.id })
        .from(marketingCampaigns)
        .where(
          and(
            eq(marketingCampaigns.marketingConnectionId, connectionId),
            eq(marketingCampaigns.externalCampaignId, c.externalCampaignId),
          ),
        )
        .limit(1);
      if (existing) {
        await db
          .update(marketingCampaigns)
          .set({
            campaignName: c.campaignName,
            campaignType: c.campaignType,
            campaignObjective: c.campaignObjective,
            status: c.status,
            startDate: c.startDate ? toDateString(c.startDate) : null,
            endDate: c.endDate ? toDateString(c.endDate) : null,
            budgetMinor: c.budgetMinor ?? null,
            budgetCurrency: c.budgetCurrency ?? null,
            budgetType: c.budgetType ?? null,
            targetingSummary: (c.targetingSummary ?? null) as never,
            rawPayload: c.rawPayload as never,
            updatedAt: new Date(),
          })
          .where(eq(marketingCampaigns.id, existing.id));
        updated++;
      } else {
        await db.insert(marketingCampaigns).values({
          organizationId: conn.organizationId,
          marketingConnectionId: connectionId,
          externalCampaignId: c.externalCampaignId,
          campaignName: c.campaignName,
          platform: conn.provider,
          campaignType: c.campaignType,
          campaignObjective: c.campaignObjective,
          status: c.status,
          startDate: c.startDate ? toDateString(c.startDate) : null,
          endDate: c.endDate ? toDateString(c.endDate) : null,
          budgetMinor: c.budgetMinor ?? null,
          budgetCurrency: c.budgetCurrency ?? null,
          budgetType: c.budgetType ?? null,
          targetingSummary: (c.targetingSummary ?? null) as never,
          rawPayload: c.rawPayload as never,
        });
        inserted++;
      }
    } catch (err) {
      console.error("syncCampaigns insert/update failed", err);
      failed++;
    }
  }

  await db
    .update(marketingConnections)
    .set({
      lastSyncedAt: new Date(),
      lastSyncStatus: failed === 0 ? "ok" : "partial",
      lastSyncError:
        failed > 0 ? `${failed} campaigns failed` : null,
      lastSyncRecordsPulled: campaigns.length,
      updatedAt: new Date(),
    })
    .where(eq(marketingConnections.id, connectionId));

  return {
    connectionId,
    ok: failed === 0,
    inserted,
    updated,
    failed,
  };
}

export async function syncMetricsForConnection(
  connectionId: string,
  input: { since: Date; until: Date },
): Promise<{ inserted: number; updated: number; failed: number }> {
  const db = requireDb();
  const [conn] = await db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.id, connectionId))
    .limit(1);
  if (!conn || conn.status !== "active") {
    return { inserted: 0, updated: 0, failed: 0 };
  }
  const credentials = openCredentials<MarketingCredentials>(conn.credentials);
  const provider = selectMarketingProvider(
    conn.provider as MarketingProviderName,
    credentials,
  );

  // Collect campaign external-id → DB-id map.
  const campaignRows = await db
    .select({
      id: marketingCampaigns.id,
      externalCampaignId: marketingCampaigns.externalCampaignId,
    })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.marketingConnectionId, connectionId));
  const idMap = new Map(
    campaignRows.map((r) => [r.externalCampaignId, r.id] as const),
  );

  let metrics;
  try {
    metrics = await provider.fetchMetrics({
      campaignIds: Array.from(idMap.keys()),
      since: input.since,
      until: input.until,
    });
  } catch {
    return { inserted: 0, updated: 0, failed: 1 };
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  for (const m of metrics) {
    const dbCampaignId = idMap.get(m.externalCampaignId);
    if (!dbCampaignId) continue; // skip metrics for unknown campaigns
    try {
      const [existing] = await db
        .select({ id: marketingMetrics.id })
        .from(marketingMetrics)
        .where(
          and(
            eq(marketingMetrics.campaignId, dbCampaignId),
            eq(marketingMetrics.metricDate, toDateString(m.metricDate)),
          ),
        )
        .limit(1);
      const values = {
        organizationId: conn.organizationId,
        campaignId: dbCampaignId,
        metricDate: toDateString(m.metricDate),
        spendMinor: m.spendMinor,
        spendCurrency: m.spendCurrency,
        impressions: m.impressions,
        reach: m.reach ?? null,
        frequency: m.frequency != null ? String(m.frequency) : null,
        clicks: m.clicks,
        clickThroughRate:
          m.clickThroughRate != null ? String(m.clickThroughRate) : null,
        costPerClickMinor: m.costPerClickMinor ?? null,
        conversions: m.conversions,
        conversionValueMinor: m.conversionValueMinor,
        costPerConversionMinor: m.costPerConversionMinor ?? null,
        returnOnAdSpend:
          m.returnOnAdSpend != null ? String(m.returnOnAdSpend) : null,
        engagements: m.engagements ?? null,
        videoViews: m.videoViews ?? null,
        videoWatchTimeSeconds: m.videoWatchTimeSeconds ?? null,
        qualityScore:
          m.qualityScore != null ? String(m.qualityScore) : null,
        rawMetrics: m.rawMetrics as never,
      };
      if (existing) {
        await db
          .update(marketingMetrics)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(marketingMetrics.id, existing.id));
        updated++;
      } else {
        await db.insert(marketingMetrics).values(values);
        inserted++;
      }
    } catch (err) {
      console.error("syncMetrics insert/update failed", err);
      failed++;
    }
  }
  return { inserted, updated, failed };
}

export async function listActiveConnectionsForCron(): Promise<
  Array<{
    id: string;
    organizationId: string;
    provider: string;
    autoSyncEnabled: boolean;
  }>
> {
  const db = requireDb();
  return db
    .select({
      id: marketingConnections.id,
      organizationId: marketingConnections.organizationId,
      provider: marketingConnections.provider,
      autoSyncEnabled: marketingConnections.autoSyncEnabled,
    })
    .from(marketingConnections)
    .where(
      and(
        eq(marketingConnections.status, "active"),
        eq(marketingConnections.autoSyncEnabled, true),
      ),
    );
}

// ---------------------------------------------------------------------------
// Touchpoint ingestion
// ---------------------------------------------------------------------------

export async function ingestTouchpoint(input: {
  organizationId: string;
  serializeInput: SerializeTouchpointInput;
}): Promise<{ id: string }> {
  const db = requireDb();
  const tp = serializeTouchpoint(input.serializeInput);
  const [row] = await db
    .insert(attributionTouchpoints)
    .values({
      organizationId: input.organizationId,
      sessionId: tp.sessionId,
      clientId: tp.clientId,
      userExternalId: tp.userExternalId,
      touchpointAt: tp.touchpointAt,
      channel: tp.channel,
      source: tp.source,
      medium: tp.medium,
      campaign: tp.campaign,
      content: tp.content,
      term: tp.term,
      referrerUrl: tp.referrerUrl,
      landingUrl: tp.landingUrl,
      userAgent: tp.userAgent,
      deviceType: tp.deviceType,
      country: tp.country,
      rawPayload: tp.rawPayload as never,
    })
    .returning({ id: attributionTouchpoints.id });
  return { id: row.id };
}

// ---------------------------------------------------------------------------
// Conversion recording
// ---------------------------------------------------------------------------

export async function recordConversion(input: {
  organizationId: string;
  conversionType: ConversionType;
  contactId?: string;
  conversionValueMinor?: bigint;
  conversionCurrency?: string;
  convertedAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const db = requireDb();
  const [row] = await db
    .insert(attributionConversions)
    .values({
      organizationId: input.organizationId,
      conversionType: input.conversionType,
      contactId: input.contactId ?? null,
      conversionValueMinor: input.conversionValueMinor ?? null,
      conversionCurrency: input.conversionCurrency ?? null,
      convertedAt: input.convertedAt ?? new Date(),
      metadata: (input.metadata ?? null) as never,
    })
    .returning({ id: attributionConversions.id });
  return { id: row.id };
}

// ---------------------------------------------------------------------------
// Attribution sweep (delegates to engine)
// ---------------------------------------------------------------------------

export async function runAttributionForOrg(input: {
  organizationId: string;
  config?: AttributionConfig;
}) {
  return runAttributionBackfill({
    organizationId: input.organizationId,
    config: input.config ?? { model: "last_touch" },
  });
}

// ---------------------------------------------------------------------------
// Touchpoint cleanup
// ---------------------------------------------------------------------------

export async function archiveOldTouchpoints(opts: {
  olderThanDays?: number;
}): Promise<number> {
  const db = requireDb();
  const cutoff = new Date(
    Date.now() - (opts.olderThanDays ?? 90) * 24 * 60 * 60 * 1000,
  );
  const rows = await db
    .delete(attributionTouchpoints)
    .where(
      and(
        lte(attributionTouchpoints.touchpointAt, cutoff),
        sql`${attributionTouchpoints.contactId} IS NULL`,
      ),
    )
    .returning({ id: attributionTouchpoints.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export async function getMarketingDashboardMetrics(
  organizationId: string,
  period: { since: Date; until: Date },
): Promise<{
  totalSpendMinor: bigint;
  totalConversions: number;
  totalRevenueMinor: bigint;
  averageRoas: number;
}> {
  const db = requireDb();
  const rows = await db
    .select({
      spendMinor: marketingMetrics.spendMinor,
      conversions: marketingMetrics.conversions,
      conversionValueMinor: marketingMetrics.conversionValueMinor,
    })
    .from(marketingMetrics)
    .where(
      and(
        eq(marketingMetrics.organizationId, organizationId),
        gte(marketingMetrics.metricDate, toDateString(period.since)),
        lte(marketingMetrics.metricDate, toDateString(period.until)),
      ),
    );

  let totalSpendMinor = 0n;
  let totalConversions = 0;
  let totalRevenueMinor = 0n;
  for (const r of rows) {
    totalSpendMinor += BigInt(r.spendMinor);
    totalConversions += Number(r.conversions);
    totalRevenueMinor += BigInt(r.conversionValueMinor);
  }
  const averageRoas =
    totalSpendMinor > 0n
      ? Number(totalRevenueMinor) / Number(totalSpendMinor)
      : 0;
  return {
    totalSpendMinor,
    totalConversions,
    totalRevenueMinor,
    averageRoas,
  };
}

export async function listMarketingConnections(): Promise<MarketingConnection[]> {
  const db = requireDb();
  return db
    .select()
    .from(marketingConnections)
    .orderBy(desc(marketingConnections.createdAt))
    .limit(200);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

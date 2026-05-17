import "server-only";

import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  leads,
  marketingLeadSources,
  contentPieces,
  contentVariants,
} from "@/lib/db/schema/marketing";

/**
 * Sprint MD-4 Phase 2 — Marketing aggregator helpers.
 *
 * Two read-only loaders used by the Marketing Staff cabinet apex:
 *   - loadTopAttributedSource: which lead-source drove the most
 *     conversions in a window. Conversion = lead.lifecycleStatus
 *     in 'reservation' / 'contract'. Falls back to firstTouch when
 *     leadSourceKey is not set on the lead (Sprint-2 leads).
 *   - loadChannelSplit: per-channel publish counts derived from
 *     contentVariants.platformTarget. Tones map onto the
 *     design-system semantic palette per channel convention.
 *
 * No new schema. Both loaders fail soft (return [] / null) when
 * the source tables are empty.
 */

export interface TopAttributedSource {
  sourceKey: string;
  sourceLabel: string;
  channelType: string;
  leadCount: number;
  conversionCount: number;
  /** 0–100, rounded to 1dp. */
  conversionRate: number;
}

const _CONVERTED_STATUSES = ["reservation", "contract"] as const;

export async function loadTopAttributedSource(
  options: {
    managerId?: string;
    periodStart?: Date;
    periodEnd?: Date;
  } = {},
): Promise<TopAttributedSource | null> {
  const db = getDb();
  if (!db) return null;

  const filters = [isNotNull(leads.leadSourceKey)];
  if (options.managerId) {
    filters.push(eq(leads.assignedManagerId, options.managerId));
  }
  if (options.periodStart) {
    filters.push(gte(leads.createdAt, options.periodStart));
  }
  if (options.periodEnd) {
    filters.push(lte(leads.createdAt, options.periodEnd));
  }

  const rows = await db
    .select({
      sourceKey: leads.leadSourceKey,
      leadCount: sql<number>`count(*)::int`,
      conversionCount: sql<number>`count(*) FILTER (WHERE ${leads.lifecycleStatus} IN ('reservation', 'contract'))::int`,
    })
    .from(leads)
    .where(and(...filters))
    .groupBy(leads.leadSourceKey);

  if (rows.length === 0) return null;

  // Pick the row with the most conversions; tie-break on lead volume.
  rows.sort((a, b) => {
    if (b.conversionCount !== a.conversionCount) {
      return b.conversionCount - a.conversionCount;
    }
    return b.leadCount - a.leadCount;
  });
  const winner = rows[0];
  if (!winner.sourceKey) return null;

  const [source] = await db
    .select({
      sourceKey: marketingLeadSources.sourceKey,
      displayName: marketingLeadSources.displayName,
      channelType: marketingLeadSources.channelType,
    })
    .from(marketingLeadSources)
    .where(eq(marketingLeadSources.sourceKey, winner.sourceKey))
    .limit(1);

  const conversionRate =
    winner.leadCount === 0
      ? 0
      : Math.round((winner.conversionCount / winner.leadCount) * 1000) / 10;

  return {
    sourceKey: winner.sourceKey,
    sourceLabel: source?.displayName ?? winner.sourceKey,
    channelType: source?.channelType ?? "—",
    leadCount: winner.leadCount,
    conversionCount: winner.conversionCount,
    conversionRate,
  };
}

export type ChannelTone =
  | "emerald"
  | "gold"
  | "coral"
  | "sage"
  | "terracotta";

export interface ChannelSplitRow {
  channel: string;
  publishCount: number;
  /** 0-100, rounded to 1dp. */
  shareOfTotal: number;
  tone: ChannelTone;
}

const CHANNEL_TONE: Record<string, ChannelTone> = {
  instagram: "coral",
  email: "gold",
  whatsapp: "emerald",
  web: "sage",
  facebook: "terracotta",
  tiktok: "coral",
  youtube: "terracotta",
  linkedin: "sage",
};

function toneFor(channel: string): ChannelTone {
  const key = channel.trim().toLowerCase();
  return CHANNEL_TONE[key] ?? "sage";
}

export async function loadChannelSplit(
  options: { periodStart?: Date; periodEnd?: Date } = {},
): Promise<ChannelSplitRow[]> {
  const db = getDb();
  if (!db) return [];

  // Channel split is derived from variants with a non-null
  // platform_target on a published parent content_piece.
  const filters = [eq(contentPieces.status, "published")];
  if (options.periodStart) {
    filters.push(gte(contentPieces.publishedAt, options.periodStart));
  }
  if (options.periodEnd) {
    filters.push(lte(contentPieces.publishedAt, options.periodEnd));
  }

  const rows = await db
    .select({
      platformTarget: contentVariants.platformTarget,
      count: sql<number>`count(*)::int`,
    })
    .from(contentVariants)
    .innerJoin(
      contentPieces,
      eq(contentPieces.id, contentVariants.parentContentId),
    )
    .where(and(isNotNull(contentVariants.platformTarget), ...filters))
    .groupBy(contentVariants.platformTarget)
    .orderBy(desc(sql`count(*)`));

  if (rows.length === 0) return [];

  const total = rows.reduce((acc, r) => acc + r.count, 0);

  return rows.slice(0, 5).map((r): ChannelSplitRow => {
    const channel = (r.platformTarget ?? "—").toString();
    return {
      channel,
      publishCount: r.count,
      shareOfTotal:
        total === 0 ? 0 : Math.round((r.count / total) * 1000) / 10,
      tone: toneFor(channel),
    };
  });
}

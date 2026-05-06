"use server";
import "server-only";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { campaigns, campaignCosts } from "@/lib/db/schema/marketing";

const createCampaignSchema = z.object({
  campaignCode: z.string().min(2).max(80),
  name: z.string().min(2).max(200),
  campaignObjective: z.string(),
  campaignStart: z.string(),
  campaignEnd: z.string(),
  totalBudgetMinor: z.number().int().nonnegative().default(0),
  currency: z.string().default("IDR"),
  primaryChannels: z.array(z.string()).default([]),
});

export async function createCampaign(input: z.input<typeof createCampaignSchema>) {
  const parsed = createCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db.insert(campaigns).values({
    campaignCode: parsed.data.campaignCode,
    name: parsed.data.name,
    campaignObjective: parsed.data.campaignObjective,
    campaignStart: parsed.data.campaignStart,
    campaignEnd: parsed.data.campaignEnd,
    totalBudgetMinor: BigInt(parsed.data.totalBudgetMinor),
    currency: parsed.data.currency,
    primaryChannels: parsed.data.primaryChannels,
  });
  return { ok: true as const };
}

export async function transitionCampaignStatus(args: {
  campaignCode: string;
  newStatus:
    | "planned"
    | "in_preparation"
    | "active"
    | "paused"
    | "completed"
    | "cancelled"
    | "archived";
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(campaigns)
    .set({ status: args.newStatus })
    .where(eq(campaigns.campaignCode, args.campaignCode));
  return { ok: true as const };
}

const recordCostSchema = z.object({
  campaignId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  sourceKey: z.string(),
  costMinor: z.number().int().nonnegative(),
  currency: z.string().default("IDR"),
  dataSource: z.enum([
    "manual_entry",
    "meta_api",
    "google_ads_api",
    "tiktok_ads_api",
    "imported_csv",
  ]),
  impressions: z.number().int().nonnegative().optional(),
  clicks: z.number().int().nonnegative().optional(),
  conversions: z.number().int().nonnegative().optional(),
});

export async function recordCampaignCost(input: z.input<typeof recordCostSchema>) {
  const parsed = recordCostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db.insert(campaignCosts).values({
    campaignId: parsed.data.campaignId,
    periodStart: parsed.data.periodStart,
    periodEnd: parsed.data.periodEnd,
    sourceKey: parsed.data.sourceKey,
    costMinor: BigInt(parsed.data.costMinor),
    currency: parsed.data.currency,
    dataSource: parsed.data.dataSource,
    impressions: parsed.data.impressions ?? null,
    clicks: parsed.data.clicks ?? null,
    conversions: parsed.data.conversions ?? null,
  });
  // Bump campaign spent_to_date.
  await db
    .update(campaigns)
    .set({
      spentToDateMinor: sql`${campaigns.spentToDateMinor} + ${BigInt(parsed.data.costMinor)}`,
    })
    .where(eq(campaigns.id, parsed.data.campaignId));
  return { ok: true as const };
}

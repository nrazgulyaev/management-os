import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { campaigns, campaignCosts } from "@/lib/db/schema/marketing";

export async function listCampaigns(limit = 100) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.campaignStart))
    .limit(limit);
}

export async function getCampaignByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.campaignCode, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCampaignCosts(campaignId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(campaignCosts)
    .where(eq(campaignCosts.campaignId, campaignId))
    .orderBy(desc(campaignCosts.periodStart));
}

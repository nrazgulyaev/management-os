import "server-only";

import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { campaigns, campaignCosts } from "@/lib/db/schema/marketing";
import { requireOrgId } from "@/features/auth/require-org";

export async function listCampaigns(limit = 100) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.organizationId, organizationId))
    .orderBy(desc(campaigns.campaignStart))
    .limit(limit);
}

export async function getCampaignByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.campaignCode, code),
        eq(campaigns.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listCampaignCosts(campaignId: string) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(campaignCosts)
    .where(
      and(
        eq(campaignCosts.campaignId, campaignId),
        eq(campaignCosts.organizationId, organizationId),
      ),
    )
    .orderBy(desc(campaignCosts.periodStart));
}

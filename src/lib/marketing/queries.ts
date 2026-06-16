import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  marketingCampaigns,
  marketingConnections,
  marketingMetrics,
} from "@/lib/db/schema/p4-marketing";
import {
  attributionConversions,
  attributionTouchpoints,
} from "@/lib/db/schema/attribution";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Stage 6.P4.F — Read queries for the marketing UI.
 *
 * The DB role is BYPASSRLS, so per-org isolation is enforced
 * explicitly here via requireOrgId() + an organization_id predicate.
 */

export async function listConnectionsForUi() {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(marketingConnections)
    .where(eq(marketingConnections.organizationId, organizationId))
    .orderBy(desc(marketingConnections.createdAt))
    .limit(100);
}

export async function listCampaignsForUi(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  // TENANCY: marketing_campaigns is org-owned (organization_id NOT NULL).
  // Without this predicate the campaigns UI would list every tenant's
  // campaigns. Scope to the caller's org like the sibling read helpers.
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.organizationId, organizationId))
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(opts.limit ?? 100);
}

export async function listConversionsForUi(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(attributionConversions)
    .where(eq(attributionConversions.organizationId, organizationId))
    .orderBy(desc(attributionConversions.convertedAt))
    .limit(opts.limit ?? 200);
}

export async function listRecentTouchpointsForUi(opts: { limit?: number } = {}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(attributionTouchpoints)
    .where(eq(attributionTouchpoints.organizationId, organizationId))
    .orderBy(desc(attributionTouchpoints.touchpointAt))
    .limit(opts.limit ?? 100);
}

export async function getMetricsTotals(orgId: string, dateRange: { since: Date; until: Date }) {
  const db = getDb();
  if (!db) return { spendMinor: 0n, conversions: 0, revenueMinor: 0n };
  const rows = await db
    .select()
    .from(marketingMetrics)
    .where(
      and(
        eq(marketingMetrics.organizationId, orgId),
        gte(marketingMetrics.metricDate, dateRange.since.toISOString().slice(0, 10)),
        lte(marketingMetrics.metricDate, dateRange.until.toISOString().slice(0, 10)),
      ),
    );
  let spendMinor = 0n;
  let conversions = 0;
  let revenueMinor = 0n;
  for (const r of rows) {
    spendMinor += BigInt(r.spendMinor);
    conversions += Number(r.conversions);
    revenueMinor += BigInt(r.conversionValueMinor);
  }
  return { spendMinor, conversions, revenueMinor };
}

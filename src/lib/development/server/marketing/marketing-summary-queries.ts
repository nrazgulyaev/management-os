import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * design-live gap plan · P1 — real data for the /development-os/marketing
 * summary cabinet. Two loaders replace the previously-hardcoded
 * active-campaigns table and the missing per-source attribution grid:
 *
 *   - loadActiveCampaigns: real campaigns (status active/in_preparation),
 *     joined to their attributed lead counts. Spend is the live
 *     spent_to_date_minor (bumped by recordCampaignCost). Channels come
 *     from primary_channels[].
 *   - loadSourceAttribution: per lead-source funnel — leads / qualified /
 *     reservations + CPL derived from campaign_costs.cost_minor booked
 *     against that source_key. Grouped on the real channel registry, so
 *     Meta / Google / Direct / Referral / Press surface only when they
 *     have data (no invented rows).
 *
 * No new schema. Both fail soft (return []) when the DB is unconfigured
 * or the source tables are empty.
 */

export interface ActiveCampaignRow {
  id: string;
  campaignCode: string;
  name: string;
  channels: string;
  status: string;
  /** spent_to_date in MINOR units. */
  spentMinor: number;
  /** total_budget in MINOR units. */
  budgetMinor: number;
  currency: string;
  leadCount: number;
}

export async function loadActiveCampaigns(
  limit = 8,
): Promise<ActiveCampaignRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const rows = await db.execute<{
    id: string;
    campaign_code: string;
    name: string;
    primary_channels: string[] | null;
    status: string;
    spent_to_date_minor: string;
    total_budget_minor: string;
    currency: string;
    lead_count: string;
  }>(sql`
    SELECT
      c.id,
      c.campaign_code,
      c.name,
      c.primary_channels,
      c.status,
      c.spent_to_date_minor::text  AS spent_to_date_minor,
      c.total_budget_minor::text   AS total_budget_minor,
      c.currency,
      (SELECT COUNT(*)::text FROM leads l WHERE l.campaign_id = c.id AND l.organization_id = ${organizationId}) AS lead_count
    FROM campaigns c
    WHERE c.status IN ('active', 'in_preparation', 'paused')
      AND c.organization_id = ${organizationId}
    ORDER BY
      CASE c.status WHEN 'active' THEN 0 WHEN 'in_preparation' THEN 1 ELSE 2 END,
      c.campaign_start DESC
    LIMIT ${limit}
  `);

  return rowsOf<{
    id: string;
    campaign_code: string;
    name: string;
    primary_channels: string[] | null;
    status: string;
    spent_to_date_minor: string;
    total_budget_minor: string;
    currency: string;
    lead_count: string;
  }>(rows).map((r) => ({
    id: r.id,
    campaignCode: r.campaign_code,
    name: r.name,
    channels:
      Array.isArray(r.primary_channels) && r.primary_channels.length > 0
        ? r.primary_channels.join(" + ")
        : "—",
    status: r.status,
    spentMinor: Number(r.spent_to_date_minor ?? "0"),
    budgetMinor: Number(r.total_budget_minor ?? "0"),
    currency: r.currency ?? "IDR",
    leadCount: Number(r.lead_count ?? "0"),
  }));
}

export interface SourceAttributionRow {
  sourceKey: string;
  sourceLabel: string;
  channelType: string;
  isPaid: boolean;
  leads: number;
  qualified: number;
  reservations: number;
  /** total spend booked against this source, MINOR units. */
  spendMinor: number;
  /** cost-per-lead in MINOR units, or null when leads = 0 / no spend. */
  cplMinor: number | null;
  currency: string;
}

/**
 * Per-source attribution grid. One row per lead source that has either
 * attributed leads or booked spend. Qualified = qualified + hot stages;
 * Reservations = reservation + contract stages (consistent with
 * loadTopAttributedSource). Spend is summed from campaign_costs by
 * source_key; CPL = spend / leads.
 */
export async function loadSourceAttribution(): Promise<SourceAttributionRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const rows = await db.execute<{
    source_key: string;
    display_name: string | null;
    channel_type: string | null;
    is_paid: boolean | null;
    currency: string | null;
    lead_count: string;
    qualified_count: string;
    reservation_count: string;
    spend_minor: string;
  }>(sql`
    WITH src AS (
      SELECT
        s.source_key,
        s.display_name,
        s.channel_type,
        s.is_paid
      FROM marketing_lead_sources s
    ),
    lead_agg AS (
      SELECT
        l.lead_source_key AS source_key,
        COUNT(*)::text AS lead_count,
        COUNT(*) FILTER (WHERE l.lifecycle_status IN ('qualified', 'hot'))::text
          AS qualified_count,
        COUNT(*) FILTER (WHERE l.lifecycle_status IN ('reservation', 'contract'))::text
          AS reservation_count
      FROM leads l
      WHERE l.lead_source_key IS NOT NULL
        AND l.organization_id = ${organizationId}
      GROUP BY l.lead_source_key
    ),
    cost_agg AS (
      SELECT
        cc.source_key,
        COALESCE(SUM(cc.cost_minor), 0)::text AS spend_minor,
        MIN(cc.currency) AS currency
      FROM campaign_costs cc
      WHERE cc.organization_id = ${organizationId}
      GROUP BY cc.source_key
    )
    SELECT
      src.source_key,
      src.display_name,
      src.channel_type,
      src.is_paid,
      cost_agg.currency AS currency,
      COALESCE(lead_agg.lead_count, '0')        AS lead_count,
      COALESCE(lead_agg.qualified_count, '0')   AS qualified_count,
      COALESCE(lead_agg.reservation_count, '0') AS reservation_count,
      COALESCE(cost_agg.spend_minor, '0')       AS spend_minor
    FROM src
    LEFT JOIN lead_agg ON lead_agg.source_key = src.source_key
    LEFT JOIN cost_agg ON cost_agg.source_key = src.source_key
    WHERE COALESCE(lead_agg.lead_count, '0') <> '0'
       OR COALESCE(cost_agg.spend_minor, '0') <> '0'
    ORDER BY COALESCE(lead_agg.lead_count, '0')::int DESC, src.display_name ASC
  `);

  return rowsOf<{
    source_key: string;
    display_name: string | null;
    channel_type: string | null;
    is_paid: boolean | null;
    currency: string | null;
    lead_count: string;
    qualified_count: string;
    reservation_count: string;
    spend_minor: string;
  }>(rows).map((r) => {
    const leads = Number(r.lead_count ?? "0");
    const spendMinor = Number(r.spend_minor ?? "0");
    const cplMinor =
      leads > 0 && spendMinor > 0 ? Math.round(spendMinor / leads) : null;
    return {
      sourceKey: r.source_key,
      sourceLabel: r.display_name ?? r.source_key,
      channelType: r.channel_type ?? "—",
      isPaid: r.is_paid ?? false,
      leads,
      qualified: Number(r.qualified_count ?? "0"),
      reservations: Number(r.reservation_count ?? "0"),
      spendMinor,
      cplMinor,
      currency: r.currency ?? "IDR",
    };
  });
}

import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * design-live gap plan · P1 — read-only loader backing the "Export
 * leads" CSV download on the marketing summary cabinet. Flat,
 * spreadsheet-friendly rows joined to the source label + campaign code.
 * No PII beyond what already lives on the lead row. Fails soft to [].
 */

export interface LeadExportRow {
  leadCode: string;
  lifecycleStatus: string;
  leadSourceKey: string;
  sourceLabel: string;
  campaignCode: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  estimatedValueMinor: string;
  currency: string;
  createdAt: string;
}

export async function loadLeadsForExport(limit = 5000): Promise<LeadExportRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const rows = await db.execute<{
    lead_code: string;
    lifecycle_status: string;
    lead_source_key: string | null;
    source_label: string | null;
    campaign_code: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    estimated_value_minor: string | null;
    currency: string | null;
    created_at: string;
  }>(sql`
    SELECT
      l.lead_code,
      l.lifecycle_status,
      l.lead_source_key,
      s.display_name AS source_label,
      c.campaign_code,
      l.utm_source,
      l.utm_medium,
      l.utm_campaign,
      l.estimated_value_minor::text AS estimated_value_minor,
      l.currency,
      l.created_at::text AS created_at
    FROM leads l
    LEFT JOIN marketing_lead_sources s ON s.source_key = l.lead_source_key
    LEFT JOIN campaigns c ON c.id = l.campaign_id
    WHERE l.organization_id = ${organizationId}
    ORDER BY l.created_at DESC
    LIMIT ${limit}
  `);

  return rowsOf<{
    lead_code: string;
    lifecycle_status: string;
    lead_source_key: string | null;
    source_label: string | null;
    campaign_code: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    estimated_value_minor: string | null;
    currency: string | null;
    created_at: string;
  }>(rows).map((r) => ({
    leadCode: r.lead_code,
    lifecycleStatus: r.lifecycle_status,
    leadSourceKey: r.lead_source_key ?? "",
    sourceLabel: r.source_label ?? "",
    campaignCode: r.campaign_code ?? "",
    utmSource: r.utm_source ?? "",
    utmMedium: r.utm_medium ?? "",
    utmCampaign: r.utm_campaign ?? "",
    estimatedValueMinor: r.estimated_value_minor ?? "",
    currency: r.currency ?? "",
    createdAt: r.created_at,
  }));
}

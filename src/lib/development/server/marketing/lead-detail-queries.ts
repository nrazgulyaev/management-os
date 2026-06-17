import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Read-only loader for a single marketing `leads` row by `lead_code`,
 * backing the `/marketing/leads/[code]` detail surface (the drill-in
 * from the leads index). Org-scoped (the lead's `organization_id` must
 * match the caller) and joined to its source label + campaign code +
 * (when present) the contact's display name. Fails soft to null.
 */
export interface LeadDetail {
  leadCode: string;
  lifecycleStatus: string;
  lifecycleStatusChangedAt: string | null;
  leadSourceKey: string;
  sourceLabel: string;
  campaignCode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  estimatedValueMinor: string;
  currency: string;
  notes: string;
  createdAt: string;
}

export async function loadLeadByCode(code: string): Promise<LeadDetail | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();

  const rows = await db.execute<{
    lead_code: string;
    lifecycle_status: string;
    lifecycle_status_changed_at: string | null;
    lead_source_key: string | null;
    source_label: string | null;
    campaign_code: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    estimated_value_minor: string | null;
    currency: string | null;
    notes: string | null;
    created_at: string;
  }>(sql`
    SELECT
      l.lead_code,
      l.lifecycle_status,
      l.lifecycle_status_changed_at::text AS lifecycle_status_changed_at,
      l.lead_source_key,
      s.display_name AS source_label,
      c.campaign_code,
      ct.full_name AS contact_name,
      ct.email AS contact_email,
      ct.phone AS contact_phone,
      l.utm_source,
      l.utm_medium,
      l.utm_campaign,
      l.estimated_value_minor::text AS estimated_value_minor,
      l.currency,
      l.notes,
      l.created_at::text AS created_at
    FROM leads l
    LEFT JOIN marketing_lead_sources s ON s.source_key = l.lead_source_key
    LEFT JOIN campaigns c ON c.id = l.campaign_id
    LEFT JOIN contacts ct ON ct.id = l.contact_id
    WHERE l.lead_code = ${code}
      AND l.organization_id = ${organizationId}
    LIMIT 1
  `);

  const [r] = rowsOf<{
    lead_code: string;
    lifecycle_status: string;
    lifecycle_status_changed_at: string | null;
    lead_source_key: string | null;
    source_label: string | null;
    campaign_code: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    estimated_value_minor: string | null;
    currency: string | null;
    notes: string | null;
    created_at: string;
  }>(rows);
  if (!r) return null;

  return {
    leadCode: r.lead_code,
    lifecycleStatus: r.lifecycle_status,
    lifecycleStatusChangedAt: r.lifecycle_status_changed_at,
    leadSourceKey: r.lead_source_key ?? "",
    sourceLabel: r.source_label ?? "",
    campaignCode: r.campaign_code ?? "",
    contactName: r.contact_name ?? "",
    contactEmail: r.contact_email ?? "",
    contactPhone: r.contact_phone ?? "",
    utmSource: r.utm_source ?? "",
    utmMedium: r.utm_medium ?? "",
    utmCampaign: r.utm_campaign ?? "",
    estimatedValueMinor: r.estimated_value_minor ?? "",
    currency: r.currency ?? "IDR",
    notes: r.notes ?? "",
    createdAt: r.created_at,
  };
}

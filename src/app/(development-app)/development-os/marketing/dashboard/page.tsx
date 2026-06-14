import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb, rowsOf } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import { requireOrgId } from "@/features/auth/require-org";

export const metadata: Metadata = {
  title: "Marketing dashboard · Development OS",
};
export const dynamic = "force-dynamic";

export default async function MarketingDashboardPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Marketing dashboard</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const organizationId = await requireOrgId();

  const summaryResult = await safeQuery(
    "marketingSummary",
    db.execute<{
      active_campaigns: string;
      total_leads: string;
      content_published: string;
      content_scheduled: string;
      open_followup_alerts: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::text FROM campaigns WHERE status = 'active' AND organization_id = ${organizationId}) AS active_campaigns,
        (SELECT COUNT(*)::text FROM leads WHERE organization_id = ${organizationId}) AS total_leads,
        (SELECT COUNT(*)::text FROM content_pieces WHERE status = 'published' AND organization_id = ${organizationId}) AS content_published,
        (SELECT COUNT(*)::text FROM content_pieces WHERE status = 'scheduled' AND organization_id = ${organizationId}) AS content_scheduled,
        (SELECT COUNT(*)::text FROM risk_radar_alerts WHERE detection_method = 'rule:missed-followup' AND status IN ('open','acknowledged','investigating') AND organization_id = ${organizationId}) AS open_followup_alerts
    `),
    null as unknown as Awaited<ReturnType<typeof db.execute>>,
  );
  const row =
    rowsOf<{
      active_campaigns: string;
      total_leads: string;
      content_published: string;
      content_scheduled: string;
      open_followup_alerts: string;
    }>(summaryResult)[0] ?? null;

  const sourceMixResult = await safeQuery(
    "leadSourceMix",
    db.execute<{ source: string; n: string }>(sql`
      SELECT COALESCE(lead_source_key, 'unknown') AS source,
             COUNT(*)::text AS n
        FROM leads l
       WHERE l.organization_id = ${organizationId}
       GROUP BY lead_source_key
       ORDER BY n DESC
       LIMIT 8
    `),
    null as unknown as Awaited<ReturnType<typeof db.execute>>,
  );
  const sourceRows = rowsOf<{ source: string; n: string }>(sourceMixResult);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> / <span>Dashboard</span>
          </div>
          <h1>Marketing dashboard</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Cross-channel attribution, content pipeline, sales conversation
            health.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Top-line</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Active campaigns" value={row?.active_campaigns ?? "0"} />
          <Kpi label="Total leads" value={row?.total_leads ?? "0"} />
          <Kpi label="Content published" value={row?.content_published ?? "0"} />
          <Kpi label="Content scheduled" value={row?.content_scheduled ?? "0"} />
          <Kpi
            label="Open follow-up alerts"
            value={row?.open_followup_alerts ?? "0"}
            sub="missed conversations"
          />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Lead source mix</div>
        {sourceRows.length === 0 ? (
          <EmptyState
            title="No leads yet"
            description="Create or import leads to populate this view."

          action={
            <Link href="/development-os/marketing/connections" className="btn btn-secondary btn-sm">Configure connections</Link>
          }
        />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col" className="num">Leads</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((s) => (
                  <tr key={s.source}>
                    <td className="row-title">{s.source}</td>
                    <td className="num">{s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}

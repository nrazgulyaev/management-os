import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb, rowsOf } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Marketing dashboard · Development OS",
};
export const dynamic = "force-dynamic";

export default async function MarketingDashboardPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Marketing dashboard" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

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
        (SELECT COUNT(*)::text FROM campaigns WHERE status = 'active') AS active_campaigns,
        (SELECT COUNT(*)::text FROM leads) AS total_leads,
        (SELECT COUNT(*)::text FROM content_pieces WHERE status = 'published') AS content_published,
        (SELECT COUNT(*)::text FROM content_pieces WHERE status = 'scheduled') AS content_scheduled,
        (SELECT COUNT(*)::text FROM risk_radar_alerts WHERE detection_method = 'rule:missed-followup' AND status IN ('open','acknowledged','investigating')) AS open_followup_alerts
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
        FROM leads
       GROUP BY lead_source_key
       ORDER BY n DESC
       LIMIT 8
    `),
    null as unknown as Awaited<ReturnType<typeof db.execute>>,
  );
  const sourceRows = rowsOf<{ source: string; n: string }>(sourceMixResult);

  return (
    <DevelopmentShell>
      <PageHeader
        title="Marketing dashboard"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Dashboard" },
        ]}
        description="Cross-channel attribution, content pipeline, sales conversation health."
      />
      <Section title="Top-line">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard label="Active campaigns" value={row?.active_campaigns ?? "0"} />
          <MetricCard label="Total leads" value={row?.total_leads ?? "0"} />
          <MetricCard
            label="Content published"
            value={row?.content_published ?? "0"}
          />
          <MetricCard
            label="Content scheduled"
            value={row?.content_scheduled ?? "0"}
          />
          <MetricCard
            label="Open follow-up alerts"
            value={row?.open_followup_alerts ?? "0"}
            hint="missed conversations"
          />
        </div>
      </Section>
      <Section title="Lead source mix">
        {sourceRows.length === 0 ? (
          <EmptyState
            title="No leads yet"
            description="Create or import leads to populate this view."
          
          action={
            <Link href="/development-os/marketing/connections" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">Configure connections</Link>
          }
        />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Source</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((s) => (
                <tr key={s.source} className="border-b border-line-soft">
                  <td className="py-2">{s.source}</td>
                  <td className="font-mono tabular-nums">{s.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

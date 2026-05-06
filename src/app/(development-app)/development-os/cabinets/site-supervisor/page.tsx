import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ClipboardList, AlertTriangle, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadSiteSupervisorCabinet } from "@/lib/development/server/cabinets/site-supervisor-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Site supervisor · Cabinet",
};
export const dynamic = "force-dynamic";

/**
 * Stage 5.F — Site Supervisor Mobile Cabinet.
 *
 * Mobile-first: single column on small screens, 2-column on desktop.
 * Touch targets >= 44px (large `min-h-[44px]` on action cards).
 */
export default async function SiteSupervisorCabinetPage() {
  const me = await getCurrentAppUser();
  const data = me
    ? await safeQuery(
        "siteSupervisorCabinet",
        loadSiteSupervisorCabinet(me.id),
        {
          todaysSiteReportCount: 0,
          openQaQcAssignedToMe: 0,
          materialsExpectedToday: 0,
          yesterdayPhotoCount: 0,
          yesterdayWorkforceRecorded: 0,
          recentReports: [],
        },
      )
    : null;

  return (
    <DevelopmentShell>
      <PageHeader
        title="Site supervisor"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cabinets" },
          { label: "Site supervisor" },
        ]}
        description="Field-first dashboard. Mobile-optimised."
      />

      <Section title="Quick actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/development-os/site-reports/new"
            className="min-h-[44px] flex items-center gap-3 rounded-md border border-line-soft bg-surface p-4 hover:border-ink/20"
          >
            <Camera className="w-5 h-5 text-info" strokeWidth={1.75} />
            <span className="text-sm font-medium">Quick photo</span>
          </Link>
          <Link
            href="/development-os/site-reports"
            className="min-h-[44px] flex items-center gap-3 rounded-md border border-line-soft bg-surface p-4 hover:border-ink/20"
          >
            <ClipboardList className="w-5 h-5 text-info" strokeWidth={1.75} />
            <span className="text-sm font-medium">Today's site report</span>
          </Link>
          <Link
            href="/development-os/qa-qc"
            className="min-h-[44px] flex items-center gap-3 rounded-md border border-line-soft bg-surface p-4 hover:border-ink/20"
          >
            <AlertTriangle className="w-5 h-5 text-warning" strokeWidth={1.75} />
            <span className="text-sm font-medium">Report issue</span>
          </Link>
          <Link
            href="/development-os/inventory"
            className="min-h-[44px] flex items-center gap-3 rounded-md border border-line-soft bg-surface p-4 hover:border-ink/20"
          >
            <Package className="w-5 h-5 text-info" strokeWidth={1.75} />
            <span className="text-sm font-medium">Material received</span>
          </Link>
        </div>
      </Section>

      {!data ? (
        <EmptyState title="Sign in" description="Log in to see your site data." />
      ) : (
        <>
          <Section title="Today">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Site reports today"
                value={String(data.todaysSiteReportCount)}
              />
              <MetricCard
                label="Open QA/QC assigned to me"
                value={String(data.openQaQcAssignedToMe)}
              />
              <MetricCard
                label="Materials expected today"
                value={String(data.materialsExpectedToday)}
              />
              <MetricCard
                label="Yesterday's photos"
                value={String(data.yesterdayPhotoCount)}
              />
            </div>
          </Section>
          <Section title="My last 5 reports">
            {data.recentReports.length === 0 ? (
              <EmptyState
                title="No reports yet"
                description="Use 'Today's site report' to file the first one."
              />
            ) : (
              <ul className="text-sm space-y-2">
                {data.recentReports.map((r) => (
                  <li key={r.id} className="border-b border-line-soft py-2">
                    <Link
                      href={`/development-os/site-reports/${r.id}`}
                      className="hover:underline block min-h-[44px]"
                    >
                      <span className="font-mono text-xs text-ink-tertiary block">
                        {r.id.slice(0, 8)}
                      </span>
                      <span>{r.reportDate}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </DevelopmentShell>
  );
}

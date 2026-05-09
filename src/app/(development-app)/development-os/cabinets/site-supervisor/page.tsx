import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ClipboardList, AlertTriangle, Package } from "lucide-react";
import {
  DashboardKpi,
  NoItemsYet,
  PageHeaderHero,
} from "@/components/ui/primitives";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadSiteSupervisorCabinet } from "@/lib/development/server/cabinets/site-supervisor-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Stage 10.5.A.2.1 — Site Supervisor cabinet (replatformed).
 *
 * Layout follows the pattern doc shipped in 10.5.A.1.4. The mobile-first
 * "Quick actions" row from Stage 5.F is preserved (touch targets ≥ 44px)
 * — moved into a header-row aside so it sits alongside the hero greeting.
 *
 * KPI mapping (existing data → operator vocabulary):
 *   - Tasks today           → todaysSiteReportCount
 *   - Active workers (yest) → yesterdayWorkforceRecorded
 *   - Open incidents (mine) → openQaQcAssignedToMe
 *   - Daily progress photos → yesterdayPhotoCount
 *
 * No trend deltas — site_reports doesn't surface a per-period snapshot.
 * Carry-over: a 7-day rolling photo count would let us show progress
 * direction.
 */

export const metadata: Metadata = { title: "Site supervisor · Cabinet" };
export const dynamic = "force-dynamic";

export default async function SiteSupervisorCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("site-supervisor");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;
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
      <div className="flex flex-col gap-8">
        <PageHeaderHero
          firstName={firstName ?? undefined}
          eyebrow="Site supervisor"
          title="Today on site"
          description="Field-first dashboard. Mobile-optimised. Capture photos, file the day's report, raise issues."
        />

        {!data ? (
          <NoItemsYet
            entityLabel="data"
            description="Sign in to see your site activity."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardKpi
                label="Tasks today"
                value={String(data.todaysSiteReportCount)}
                status={
                  data.todaysSiteReportCount === 0 ? "warn" : "neutral"
                }
                drillHref="/development-os/site-reports"
                hint="Site reports filed today"
              />
              <DashboardKpi
                label="Active workers (yesterday)"
                value={String(data.yesterdayWorkforceRecorded)}
                status="neutral"
                drillHref="/development-os/site-reports"
                hint="Workforce log entries"
              />
              <DashboardKpi
                label="Open incidents (mine)"
                value={String(data.openQaQcAssignedToMe)}
                status={
                  data.openQaQcAssignedToMe === 0
                    ? "good"
                    : data.openQaQcAssignedToMe > 5
                      ? "bad"
                      : "warn"
                }
                drillHref="/development-os/qa-qc"
                hint="QA/QC assigned to me"
              />
              <DashboardKpi
                label="Photos yesterday"
                value={String(data.yesterdayPhotoCount)}
                status={
                  data.yesterdayPhotoCount === 0 ? "warn" : "neutral"
                }
                drillHref="/development-os/site-reports"
                hint="Daily progress capture"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 flex flex-col gap-6">
                <Section eyebrow="Quick actions" title="Capture & file">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <QuickActionCard
                      href="/development-os/site-reports/new"
                      icon={<Camera className="w-5 h-5" strokeWidth={1.75} />}
                      label="Quick photo"
                      tone="info"
                    />
                    <QuickActionCard
                      href="/development-os/site-reports"
                      icon={
                        <ClipboardList
                          className="w-5 h-5"
                          strokeWidth={1.75}
                        />
                      }
                      label="Today's site report"
                      tone="info"
                    />
                    <QuickActionCard
                      href="/development-os/qa-qc"
                      icon={
                        <AlertTriangle
                          className="w-5 h-5"
                          strokeWidth={1.75}
                        />
                      }
                      label="Report issue"
                      tone="warning"
                    />
                    <QuickActionCard
                      href="/development-os/inventory"
                      icon={<Package className="w-5 h-5" strokeWidth={1.75} />}
                      label="Material received"
                      tone="info"
                    />
                  </div>
                </Section>

                <Section eyebrow="Inventory" title="Materials expected today">
                  <DashboardKpi
                    label="Deliveries on schedule"
                    value={String(data.materialsExpectedToday)}
                    status={
                      data.materialsExpectedToday === 0 ? "neutral" : "good"
                    }
                    drillHref="/development-os/inventory"
                    hint="Material orders due today"
                  />
                </Section>
              </div>

              <aside className="flex flex-col gap-4">
                <Section eyebrow="History" title="My recent reports">
                  {data.recentReports.length === 0 ? (
                    <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                      No reports filed yet. Use Today&rsquo;s site report to file
                      the first one.
                    </div>
                  ) : (
                    <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                      {data.recentReports.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/development-os/site-reports/${r.id}`}
                            className="block px-4 py-3 min-h-[44px] hover:bg-surface-hover"
                          >
                            <div className="text-sm text-ink">
                              {r.reportDate}
                            </div>
                            <div className="text-xs text-ink-tertiary font-mono">
                              {r.id.slice(0, 8)}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Link
                      href="/development-os/site-reports"
                      className="text-xs text-ink-tertiary hover:underline"
                    >
                      All site reports →
                    </Link>
                  </div>
                </Section>
              </aside>
            </div>
          </>
        )}
      </div>
    </DevelopmentShell>
  );
}

function QuickActionCard({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone: "info" | "warning";
}) {
  return (
    <Link
      href={href}
      className="min-h-[44px] flex items-center gap-3 rounded-md border border-line-soft bg-surface p-4 hover:border-line-strong transition-colors"
    >
      <span
        className={tone === "warning" ? "text-warning" : "text-info"}
        aria-hidden
      >
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getSiteReports } from "@/lib/development/server/site-reports";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { REPORT_STATUS_LABEL, WEATHER_LABEL } from "@/lib/development/constants/site-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { SiteReportModalForm } from "@/components/development/operations/site-report-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Site reports · Development OS" };
export const dynamic = "force-dynamic";

export default async function SiteReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; hasBlocker?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "calendar";
  const db = getDb();
  const [reports, projects] = await Promise.all([
    db
      ? safeQuery(
          "getSiteReports",
          getSiteReports({
            status:
              sp.status === "draft" ||
              sp.status === "submitted" ||
              sp.status === "reviewed" ||
              sp.status === "flagged"
                ? sp.status
                : undefined,
            hasBlocker: sp.hasBlocker === "true" ? true : undefined,
          }),
          [],
          4000,
        )
      : Promise.resolve([]),
    db
      ? safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000)
      : Promise.resolve([]),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  // Date-grouped grouping for the calendar view: groups reports by
  // date desc. Full month-grid lightbox UI is deferred (more polish
  // than load-bearing). The grouped grid lets ops see at a glance
  // which days have what status across projects.
  const calendarGroups = new Map<string, typeof reports>();
  for (const r of reports) {
    const arr = calendarGroups.get(r.reportDate) ?? [];
    arr.push(r);
    calendarGroups.set(r.reportDate, arr);
  }
  const calendarDates = [...calendarGroups.keys()].sort().reverse();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Site reports</span>
          </div>
          <h1>Daily site reports</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            One report per project per day. Captures weather, workforce, zone
            activities, photos, blockers, and material consumption. Source can be
            web form, mobile app, or WhatsApp ingestion.
          </p>
          <div className="label mt-2">
            {db
              ? `${reports.length} reports · ${reports.filter((r) => r.blockerCount > 0).length} with blockers`
              : "Database not configured"}
          </div>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <SiteReportModalForm projects={projectOptions} />
            <Button asChild variant="secondary">
              <Link href="/development-os/site-reports/new">Full form</Link>
            </Button>
            <ExportButton entity="site_reports" />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : reports.length === 0 ? (
        <EmptyState
          title="No site reports yet"
          description="Capture your first daily site report from the cabinets / site-supervisor surface."
        />
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/development-os/site-reports?view=calendar"
              className={`rounded-md px-3 py-1.5 ${view === "calendar" ? "bg-ink text-ink-inverse" : "border border-line-soft hover:bg-muted/40"}`}
            >
              Calendar
            </Link>
            <Link
              href="/development-os/site-reports?view=list"
              className={`rounded-md px-3 py-1.5 ${view === "list" ? "bg-ink text-ink-inverse" : "border border-line-soft hover:bg-muted/40"}`}
            >
              List
            </Link>
          </div>

          {view === "calendar" ? (
            <div>
              <div className="label mb-2.5">Calendar</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {calendarDates.map((d) => (
                  <div
                    key={d}
                    className="rounded-lg border border-line-soft bg-surface p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{d}</span>
                      <span className="text-[11px] text-ink-tertiary">
                        {(calendarGroups.get(d) ?? []).length} report
                        {(calendarGroups.get(d) ?? []).length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {(calendarGroups.get(d) ?? []).map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/development-os/site-reports/${r.id}`}
                            className="block rounded-md border border-line-soft bg-muted/20 hover:bg-muted/40 px-2 py-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate flex-1 mr-2">
                                {r.projectName ?? "—"}
                              </span>
                              <HandoffBadge
                                tone={
                                  r.status === "reviewed"
                                    ? "ok"
                                    : r.status === "submitted"
                                      ? "info"
                                      : r.status === "flagged"
                                        ? "danger"
                                        : "soft"
                                }
                              >
                                {REPORT_STATUS_LABEL[r.status]}
                              </HandoffBadge>
                            </div>
                            <div className="text-[11px] text-ink-tertiary mt-0.5 flex items-center gap-2">
                              <span>{r.totalWorkersPresent} workers</span>
                              {r.blockerCount > 0 && (
                                <span className="text-warning">
                                  {r.blockerCount} blocker
                                  {r.blockerCount === 1 ? "" : "s"}
                                </span>
                              )}
                              {r.photoCount > 0 && (
                                <span>{r.photoCount} photos</span>
                              )}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="label mb-2.5">All reports</div>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Project</TH>
                <TH>Weather</TH>
                <TH>Workers</TH>
                <TH>Zones</TH>
                <TH>Photos</TH>
                <TH>Blockers</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {reports.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs">
                    <Link
                      href={`/development-os/site-reports/${r.id}`}
                      className="hover:underline"
                    >
                      {r.reportDate}
                    </Link>
                  </TD>
                  <TD className="text-sm">{r.projectName ?? "—"}</TD>
                  <TD className="text-xs text-ink-secondary">
                    {r.weatherConditions ? WEATHER_LABEL[r.weatherConditions] : "—"}
                  </TD>
                  <TDNum>
                    {r.totalWorkersPresent}
                    {r.totalWorkersPlanned ? ` / ${r.totalWorkersPlanned}` : ""}
                  </TDNum>
                  <TDNum>{r.zoneCount}</TDNum>
                  <TDNum>{r.photoCount}</TDNum>
                  <TDNum>
                    {r.blockerCount > 0 ? (
                      <HandoffBadge tone="warn">{r.blockerCount}</HandoffBadge>
                    ) : (
                      "—"
                    )}
                  </TDNum>
                  <TD>
                    <HandoffBadge
                      tone={
                        r.status === "reviewed"
                          ? "ok"
                          : r.status === "submitted"
                            ? "info"
                            : r.status === "flagged"
                              ? "danger"
                              : "soft"
                      }
                    >
                      {REPORT_STATUS_LABEL[r.status]}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
            </div>
          )}
        </>
      )}
    </DevelopmentShell>
  );
}

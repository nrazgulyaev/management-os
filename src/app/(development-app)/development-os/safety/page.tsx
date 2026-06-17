import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getSafetyIncidents,
  getSafetyMetrics,
} from "@/lib/development/server/safety";
import {
  SAFETY_CATEGORY_LABEL,
  SAFETY_SEVERITY_LABEL,
  SAFETY_SEVERITY_TONE,
  SAFETY_STATUS_LABEL,
} from "@/lib/development/constants/safety-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { SafetyStatusControl } from "./_status-control";

export const metadata: Metadata = { title: "Safety · Development OS" };
export const dynamic = "force-dynamic";

/** Presentational map: legacy severity tone → handoff badge tone. */
const SEVERITY_BADGE_TONE: Record<
  "neutral" | "info" | "warning" | "danger",
  "soft" | "info" | "warn" | "danger"
> = {
  neutral: "soft",
  info: "info",
  warning: "warn",
  danger: "danger",
};

export default async function SafetyPage() {
  const db = getDb();
  const [list, metrics] = db
    ? await Promise.all([
        safeQuery("getSafetyIncidents", getSafetyIncidents(), [], 4000),
        safeQuery(
          "getSafetyMetrics",
          getSafetyMetrics(),
          {
            totalIncidents: 0,
            bySeverity: {
              near_miss: 0,
              minor: 0,
              moderate: 0,
              severe: 0,
              fatal: 0,
            } as Record<
              "near_miss" | "minor" | "moderate" | "severe" | "fatal",
              number
            >,
            byStatus: {
              open: 0,
              under_investigation: 0,
              resolved: 0,
              closed: 0,
            } as Record<
              "open" | "under_investigation" | "resolved" | "closed",
              number
            >,
            openCount: 0,
            affectedWorkersTotal: 0,
          },
          4000,
        ),
      ])
    : [[], null];

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Safety</span>
            {" · "}
            {db
              ? `${list.length} incidents · ${metrics?.openCount ?? 0} open`
              : "Database not configured"}
          </div>
          <h1>Safety incident log</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Every safety event from near-miss to fatal. Severe and fatal
            incidents that stay open &gt;24h are escalated by the
            safety-escalation cron.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/safety/new" className="btn btn-accent">
            + Record incident
          </Link>
          <Link href="/development-os" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : (
        <>
          {metrics && (
            <div>
              <div className="label mb-2.5">Snapshot</div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Kpi
                  label="Open"
                  value={String(metrics.openCount)}
                  sub={
                    metrics.bySeverity.severe + metrics.bySeverity.fatal > 0
                      ? `${metrics.bySeverity.severe + metrics.bySeverity.fatal} severe/fatal`
                      : undefined
                  }
                />
                <Kpi
                  label="Affected"
                  value={String(metrics.affectedWorkersTotal)}
                  sub="cumulative workers"
                />
                <Kpi
                  label="Severe + fatal"
                  value={String(
                    metrics.bySeverity.severe + metrics.bySeverity.fatal,
                  )}
                />
                <Kpi
                  label="Moderate"
                  value={String(metrics.bySeverity.moderate)}
                />
                <Kpi
                  label="Minor + near miss"
                  value={String(
                    metrics.bySeverity.minor + metrics.bySeverity.near_miss,
                  )}
                />
              </div>
            </div>
          )}

          <div>
            <div className="label mb-2.5">Incidents</div>
            {list.length === 0 ? (
              <EmptyState
                title="No incidents on record"
                description="Record your first safety incident from the cabinets / site-supervisor surface."
              />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Date</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Category</th>
                    <th scope="col" className="num">Affected</th>
                    <th scope="col">Description</th>
                    <th scope="col">Status</th>
                    <th scope="col">Set status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.id}>
                      <td className="row-title mono text-xs">
                        <Link
                          href={`/development-os/safety/${i.id}`}
                          className="hover:underline"
                        >
                          {i.incidentCode}
                        </Link>
                      </td>
                      <td className="text-xs">{i.incidentDate}</td>
                      <td>
                        <HandoffBadge tone={SEVERITY_BADGE_TONE[SAFETY_SEVERITY_TONE[i.severity]]}>
                          {SAFETY_SEVERITY_LABEL[i.severity]}
                        </HandoffBadge>
                      </td>
                      <td className="text-xs text-ink-secondary">
                        {SAFETY_CATEGORY_LABEL[i.category]}
                      </td>
                      <td className="num">{i.affectedWorkersCount}</td>
                      <td className="text-xs">
                        {i.description.length > 80
                          ? i.description.slice(0, 80) + "…"
                          : i.description}
                      </td>
                      <td>
                        <HandoffBadge
                          tone={
                            i.status === "open"
                              ? "danger"
                              : i.status === "under_investigation"
                                ? "warn"
                                : "soft"
                          }
                        >
                          {SAFETY_STATUS_LABEL[i.status]}
                        </HandoffBadge>
                      </td>
                      <td>
                        <SafetyStatusControl id={i.id} status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}

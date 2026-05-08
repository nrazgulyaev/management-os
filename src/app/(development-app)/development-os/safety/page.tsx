import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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

export const metadata: Metadata = { title: "Safety · Development OS" };
export const dynamic = "force-dynamic";

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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Safety" },
        ]}
        eyebrow={
          db
            ? `${list.length} incidents · ${metrics?.openCount ?? 0} open`
            : "Database not configured"
        }
        title="Safety incident log"
        description="Every safety event from near-miss to fatal. Severe and fatal incidents that stay open >24h are escalated by the safety-escalation cron."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/development-os/safety/new">
                + Record incident
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : (
        <>
          {metrics && (
            <Section eyebrow="Snapshot" title="By severity + status">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <MetricCard
                  label="Open"
                  value={String(metrics.openCount)}
                  hint={
                    metrics.bySeverity.severe + metrics.bySeverity.fatal > 0
                      ? `${metrics.bySeverity.severe + metrics.bySeverity.fatal} severe/fatal`
                      : undefined
                  }
                />
                <MetricCard
                  label="Affected"
                  value={String(metrics.affectedWorkersTotal)}
                  hint="cumulative workers"
                />
                <MetricCard
                  label="Severe + fatal"
                  value={String(
                    metrics.bySeverity.severe + metrics.bySeverity.fatal,
                  )}
                />
                <MetricCard
                  label="Moderate"
                  value={String(metrics.bySeverity.moderate)}
                />
                <MetricCard
                  label="Minor + near miss"
                  value={String(
                    metrics.bySeverity.minor + metrics.bySeverity.near_miss,
                  )}
                />
              </div>
            </Section>
          )}

          <Section eyebrow="Incidents" title="Chronological">
            {list.length === 0 ? (
              <EmptyState
                title="No incidents on record"
                description="Record your first safety incident from the cabinets / site-supervisor surface."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Date</TH>
                    <TH>Severity</TH>
                    <TH>Category</TH>
                    <TH>Affected</TH>
                    <TH>Description</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.map((i) => (
                    <TR key={i.id}>
                      <TD className="font-mono text-xs">{i.incidentCode}</TD>
                      <TD className="text-xs">{i.incidentDate}</TD>
                      <TD>
                        <Badge tone={SAFETY_SEVERITY_TONE[i.severity]}>
                          {SAFETY_SEVERITY_LABEL[i.severity]}
                        </Badge>
                      </TD>
                      <TD className="text-xs text-ink-secondary">
                        {SAFETY_CATEGORY_LABEL[i.category]}
                      </TD>
                      <TDNum>{i.affectedWorkersCount}</TDNum>
                      <TD className="text-xs">
                        {i.description.length > 80
                          ? i.description.slice(0, 80) + "…"
                          : i.description}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            i.status === "open"
                              ? "danger"
                              : i.status === "under_investigation"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {SAFETY_STATUS_LABEL[i.status]}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
        </>
      )}
    </DevelopmentShell>
  );
}

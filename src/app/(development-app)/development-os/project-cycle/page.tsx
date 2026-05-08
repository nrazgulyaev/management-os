import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listCycleRecommendations,
  listPayrollPeriods,
  listTeamCapacityTracking,
} from "@/lib/development/server/project-cycle/cycle-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Project cycle intelligence · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  unreviewed: "warning",
  reviewed: "info",
  accepted: "success",
  rejected: "danger",
  partially_accepted: "info",
};

const CONFIDENCE_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  low: "warning",
  medium: "info",
  high: "success",
};

export default async function ProjectCyclePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Project cycle intelligence" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [recs, payroll, capacity] = await Promise.all([
    safeQuery(
      "listCycleRecommendations",
      listCycleRecommendations({ limit: 20 }),
      [],
      4000,
    ),
    safeQuery("listPayrollPeriods", listPayrollPeriods(), [], 4000),
    safeQuery(
      "listTeamCapacityTracking",
      listTeamCapacityTracking(),
      [],
      4000,
    ),
  ]);

  const unreviewedCount = recs.filter(
    (r) => r.operatorStatus === "unreviewed",
  ).length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Project cycle intelligence" },
        ]}
        eyebrow={`${unreviewedCount} unreviewed`}
        title="Project cycle intelligence"
        description="When should we start the next project? AI advisory only — recommendations need operator review before any action. The cycle-helpers.ts orchestrator is pure and runtime-tested."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Advisory" title="Latest recommendations">
        {recs.length === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="The weekly cron (Mon 06:00 UTC) generates one PCR-YYYY-### per run."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Action</TH>
                <TH>Confidence</TH>
                <TH>Status</TH>
                <TH>Generated</TH>
              </TR>
            </THead>
            <TBody>
              {recs.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.recommendationCode}</TD>
                  <TD className="text-sm">{r.recommendedAction}</TD>
                  <TD>
                    {r.confidenceLevel ? (
                      <Badge tone={CONFIDENCE_TONE[r.confidenceLevel] ?? "neutral"}>
                        {r.confidenceLevel}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[r.operatorStatus] ?? "neutral"}>
                      {r.operatorStatus}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{r.generatedForDate}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section eyebrow="Commitments" title="Payroll periods">
        {payroll.length === 0 ? (
          <EmptyState
            title="No payroll periods"
            description="Seed via scripts/seed-dev-os.mjs."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Period</TH>
                <TH>Type</TH>
                <TH>Headcount</TH>
                <TH className="text-right">Total (minor)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {payroll.slice(0, 12).map((p) => (
                <TR key={p.id}>
                  <TD className="text-sm">{p.periodLabel}</TD>
                  <TD className="text-xs">
                    {p.periodStart} → {p.periodEnd}
                  </TD>
                  <TD className="text-xs">{p.periodType}</TD>
                  <TD className="text-xs">{p.totalHeadcount}</TD>
                  <TD className="text-right font-mono text-xs">
                    {String(p.totalPayrollAmountMinor)}
                  </TD>
                  <TD>
                    <Badge tone="neutral">{p.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section eyebrow="Capacity" title="Team capacity tracking">
        {capacity.length === 0 ? (
          <EmptyState
            title="No capacity records"
            description="Use trackTeamCapacity action."
          
          action={
            <Link href="/dashboard/jobs" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">View jobs</Link>
          }
        />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Role</TH>
                <TH>Members</TH>
                <TH className="text-right">Capacity (h)</TH>
                <TH className="text-right">Utilized (h)</TH>
                <TH className="text-right">Idle (h)</TH>
                <TH className="text-right">Util %</TH>
              </TR>
            </THead>
            <TBody>
              {capacity.slice(0, 12).map((c) => (
                <TR key={c.id}>
                  <TD className="text-xs">
                    {c.trackingPeriodStart} → {c.trackingPeriodEnd}
                  </TD>
                  <TD className="text-sm">{c.roleType}</TD>
                  <TD className="text-xs">{c.totalTeamMembers}</TD>
                  <TD className="text-right font-mono text-xs">
                    {c.totalCapacityHours}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {c.utilizedHours}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {c.idleHours ?? "—"}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {c.utilizationRate ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  HandoffBadge,
  Pulse,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import {
  listCycleRecommendations,
  listPayrollPeriods,
  listTeamCapacityTracking,
} from "@/lib/development/server/project-cycle/cycle-queries";
import { formatMoneyMinor } from "@/lib/money";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { CycleReviewActions } from "./_review-actions";
import { ProjectCycleInputForms } from "./_input-forms";
import { safeQuery } from "@/lib/development/safe-query";

/**
 * Dev OS /project-cycle — pixel redesign to cabinets/dev-p3/Dev Ops.html
 * (Project cycle screen): advisory eyebrow · SectionHeading hero ·
 * 4-KPI strip (unreviewed / capacity / payroll / idle crews) · a 2-col
 * block of the recommendations table + a team-capacity bar card, with
 * the full payroll-period table retained below so no data is dropped.
 *
 * Every fetch + the accept/reject action (CycleReviewActions →
 * reviewCycleRecommendation) is preserved; only the markup is restyled
 * to the engineering palette under data-surface="development-os". The
 * getDb() guard stays.
 */

export const metadata: Metadata = {
  title: "Project cycle intelligence · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "info" | "warn" | "danger"> = {
  unreviewed: "warn",
  reviewed: "info",
  accepted: "ok",
  rejected: "danger",
  partially_accepted: "info",
};

const CONFIDENCE_TONE: Record<string, "ok" | "info" | "warn" | "danger"> = {
  low: "warn",
  medium: "info",
  high: "ok",
};

export default async function ProjectCyclePage() {
  const db = getDb();
  if (!db) {
    return (
      <>
        <SectionHeading
          eyebrow="operations · advisory only"
          title="Project cycle intelligence"
        />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </>
    );
  }

  const [recs, payroll, capacity, projectList] = await Promise.all([
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
    safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000),
  ]);

  const projectOptions = projectList.map((p) => ({
    id: p.realProjectId,
    name: p.name,
  }));

  const unreviewedCount = recs.filter(
    (r) => r.operatorStatus === "unreviewed",
  ).length;

  // Capacity roll-up: utilisation per role for the bar card, plus the
  // strip KPIs (avg utilisation, idle crews). Numeric columns come back
  // as strings from the driver — coerce before maths.
  const capacityRows = capacity.slice(0, 8).map((c) => {
    const util =
      c.utilizationRate != null
        ? Math.round(Number(c.utilizationRate))
        : c.totalCapacityHours && Number(c.totalCapacityHours) > 0
          ? Math.round(
              (Number(c.utilizedHours) / Number(c.totalCapacityHours)) * 100,
            )
          : 0;
    return { id: c.id, role: c.roleType, util };
  });
  const avgUtil =
    capacityRows.length > 0
      ? Math.round(
          capacityRows.reduce((s, r) => s + r.util, 0) / capacityRows.length,
        )
      : null;
  const idleCrews = capacity.filter(
    (c) => c.idleHours != null && Number(c.idleHours) > 0,
  ).length;

  // Latest payroll commitment for the strip KPI.
  const latestPayroll = payroll[payroll.length - 1] ?? null;

  return (
    <>
      <SectionHeading
        eyebrow="operations · advisory only"
        title={
          <>
            When do we start the{" "}
            <span className="text-amber italic">next project</span>?
          </>
        }
        subtitle="AI recommendations need operator review before any action. The cycle orchestrator is pure and runtime-tested; capacity + payroll commitments anchor the call."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">
              <Pulse />
              AI advisory · operator review
            </span>
            <ProjectCycleInputForms projects={projectOptions} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-5 lg:grid-cols-4">
        <Kpi
          label="Unreviewed"
          value={String(unreviewedCount)}
          sub="recommendations"
          tone={unreviewedCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Team capacity"
          value={avgUtil != null ? `${avgUtil}%` : "—"}
          sub="utilized"
        />
        <Kpi
          label="Payroll · month"
          value={
            latestPayroll
              ? formatMoneyMinor(
                  latestPayroll.totalPayrollAmountMinor,
                  latestPayroll.currency,
                  { compact: true },
                )
              : "—"
          }
          sub="commitment"
        />
        <Kpi
          label="Idle crews"
          value={String(idleCrews)}
          sub="capacity free"
          tone={idleCrews > 0 ? "success" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-6 lg:grid-cols-[1.5fr_1fr] items-start">
        {/* ---- LEFT: latest recommendations ---- */}
        <div className="card card-pad min-w-0">
          <div className="flex items-center gap-2.5 mb-3.5">
            <h3 className="font-display text-[19px] font-medium leading-none tracking-[-0.02em] text-ink m-0">
              Latest recommendations
            </h3>
            <span className="ml-auto font-mono text-[10.5px] tracking-[0.04em] text-ink-tertiary uppercase">
              weekly cron
            </span>
          </div>
          {recs.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              description="The weekly cron (Mon 06:00 UTC) generates one PCR-YYYY-### per run."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Action</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-[11px]">
                      <Link
                        href={`/development-os/project-cycle/${r.recommendationCode}`}
                        className="text-accent hover:underline"
                      >
                        {r.recommendationCode}
                      </Link>
                    </td>
                    <td className="text-[13px]">{r.recommendedAction}</td>
                    <td>
                      {r.confidenceLevel ? (
                        <HandoffBadge
                          tone={CONFIDENCE_TONE[r.confidenceLevel] ?? "info"}
                        >
                          {r.confidenceLevel}
                        </HandoffBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[r.operatorStatus] ?? "info"}>
                        {r.operatorStatus.replace(/_/g, " ")}
                      </HandoffBadge>
                    </td>
                    <td>
                      <CycleReviewActions
                        recommendationId={r.id}
                        currentStatus={r.operatorStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ---- RIGHT: team capacity bars ---- */}
        <div className="card card-pad min-w-0">
          <div className="flex items-center gap-2.5 mb-3.5">
            <h3 className="font-display text-[19px] font-medium leading-none tracking-[-0.02em] text-ink m-0">
              Team capacity
            </h3>
          </div>
          {capacityRows.length === 0 ? (
            <EmptyState
              title="No capacity records"
              description="Use 'Record capacity' above to log team utilisation per role and project."
            />
          ) : (
            <div className="flex flex-col gap-[11px]">
              {capacityRows.map((c) => {
                const barColor =
                  c.util >= 90
                    ? "var(--amber)"
                    : c.util < 60
                      ? "var(--steel)"
                      : "var(--ok)";
                return (
                  <div key={c.id}>
                    <div className="flex justify-between text-[12.5px] text-ink-secondary mb-[5px]">
                      <span className="capitalize">
                        {c.role.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono tabular-nums">{c.util}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-inset overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(Math.max(c.util, 0), 100)}%`,
                          background: barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ---- Payroll commitments (retained — compressed into a KPI in the
              mock but kept as a full table here so no data is dropped) ---- */}
      <div className="card card-pad mt-6">
        <div className="flex items-center gap-2.5 mb-3.5">
          <h3 className="font-display text-[19px] font-medium leading-none tracking-[-0.02em] text-ink m-0">
            Payroll periods
          </h3>
          <span className="ml-auto font-mono text-[10.5px] tracking-[0.04em] text-ink-tertiary uppercase">
            commitments
          </span>
        </div>
        {payroll.length === 0 ? (
          <EmptyState
            title="No payroll periods"
            description="Use 'New payroll period' above to record a payroll commitment and its per-project allocation."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Label</th>
                <th>Period</th>
                <th>Type</th>
                <th className="num">Headcount</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payroll.slice(0, 12).map((p) => (
                <tr key={p.id}>
                  <td className="text-[13px]">{p.periodLabel}</td>
                  <td className="font-mono text-[11px] text-ink-tertiary">
                    {p.periodStart} → {p.periodEnd}
                  </td>
                  <td className="text-[12px] capitalize">
                    {p.periodType.replace(/_/g, " ")}
                  </td>
                  <td className="num">{p.totalHeadcount}</td>
                  <td className="num">
                    {formatMoneyMinor(p.totalPayrollAmountMinor, p.currency, {
                      compact: true,
                    })}
                  </td>
                  <td>
                    <HandoffBadge tone="info">{p.status}</HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

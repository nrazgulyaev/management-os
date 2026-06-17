import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Globe, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SourceBadge } from "@/components/ui/source-badge";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { PhasesTimeline } from "@/components/development/phases-timeline";
import { LandPlotCard } from "@/components/development/land-plot-card";
import { UnitTable } from "@/components/development/unit-row";
import {
  ProjectDetailTabs,
  type ProjectTab,
} from "@/components/development/project-detail-tabs";
import { HealthPill } from "@/components/projects/health-pill";
import { formatDate, formatUSD } from "@/lib/utils";
import { mapPoolAll } from "@/lib/db/map-pool";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { getActiveLeadSources, getProjectLeads } from "@/lib/development/server/leads";
import { LeadPipelineBoard } from "@/components/development/sales/lead-pipeline-board";
import { ProjectSalesUnified } from "@/components/development/sales/project-sales-unified";
import { getProjectSalesData } from "@/lib/development/server/project-sales";
import { getCommitments } from "@/lib/development/server/investors";
import {
  getBudgetVsActual,
  getProjectFinancialSummary,
} from "@/lib/development/server/budget";
import { evaluateSelfSustainingThreshold } from "@/lib/development/server/self-sustaining";
import { getActiveSuggestionForProject } from "@/lib/development/server/distribution-suggestion-actions";
import { DistributionSuggestionCard } from "@/components/development/projects/distribution-suggestion-card";
import { getProjectBalance } from "@/lib/development/server/bank-accounts";
import { getTransactions } from "@/lib/development/server/transactions";
import { safeQuery } from "@/lib/development/safe-query";
import {
  COMMITMENT_STATUS_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { getSiteReports } from "@/lib/development/server/site-reports";
import { listProjectRfis } from "@/lib/development/server/rfis/rfi-queries";
import { getVendorEngagements } from "@/lib/development/server/vendors";
import { getMaterialPurchaseOrders } from "@/lib/development/server/materials";
import { getSafetyIncidents } from "@/lib/development/server/safety";
import { listProjectDocuments } from "@/lib/development/server/documents/project-documents-queries";
import { ProjectDocumentsTab } from "./_documents-tab";
import {
  REPORT_STATUS_LABEL,
  WEATHER_LABEL,
} from "@/lib/development/constants/site-constants";
import {
  ENGAGEMENT_STATUS_LABEL,
} from "@/lib/development/constants/vendor-constants";
import {
  MATERIAL_PO_STATUS_LABEL,
} from "@/lib/development/constants/material-constants";
import {
  SAFETY_CATEGORY_LABEL,
  SAFETY_SEVERITY_LABEL,
  SAFETY_SEVERITY_TONE,
  SAFETY_STATUS_LABEL,
} from "@/lib/development/constants/safety-constants";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  return {
    title: detail
      ? `${detail.project.name} · Development OS`
      : "Project · Development OS",
  };
}

function fmtMinor(minor: bigint, currency: string): string {
  const major = Number(minor) / 100;
  if (currency === "USD" || currency === "EUR") return formatUSD(major);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(major);
}

const acquisitionLabel: Record<string, string> = {
  leasehold: "Leasehold",
  freehold: "Freehold",
  joint_venture: "Joint venture",
  mixed: "Mixed",
};

// Map the shared (Layer-A Badge) severity tone vocabulary onto the
// handoff badge palette used on this ported page.
const SEVERITY_HANDOFF_TONE: Record<
  "neutral" | "info" | "warning" | "danger",
  "soft" | "info" | "warn" | "danger"
> = {
  neutral: "soft",
  info: "info",
  warning: "warn",
  danger: "danger",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail) notFound();

  const { project, meta, phases, plots, units } = detail;

  const [
    projectLeads,
    allSourcesRaw,
    salesUnified,
    projectCommitments,
    budgetRows,
    financialSummary,
    sustainCheck,
    projectBalance,
    projectTransactions,
  ] = await mapPoolAll([
    () => (detail.source === "db" ? getProjectLeads(project.realProjectId) : Promise.resolve([])),
    () => (detail.source === "db" ? getActiveLeadSources() : Promise.resolve([])),
    () => (detail.source === "db"
      ? getProjectSalesData(project.realProjectId)
      : Promise.resolve(null)),
    () => (detail.source === "db"
      ? safeQuery(
          "getCommitments(project)",
          getCommitments({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([])),
    () => (detail.source === "db"
      ? safeQuery(
          "getBudgetVsActual(project)",
          getBudgetVsActual(project.realProjectId),
          [],
          4000,
        )
      : Promise.resolve([])),
    () => (detail.source === "db"
      ? safeQuery(
          "getProjectFinancialSummary",
          getProjectFinancialSummary(project.realProjectId),
          {
            totalBudgetUsdMinor: "0",
            totalCommittedUsdMinor: "0",
            totalActualUsdMinor: "0",
            remainingBudgetUsdMinor: "0",
            budgetConsumedPercent: 0,
            outstandingCommitmentUsdMinor: "0",
            byCategoryType: {
              capex: { budget: "0", actual: "0" },
              opex: { budget: "0", actual: "0" },
              cogs: { budget: "0", actual: "0" },
            },
          },
          4000,
        )
      : Promise.resolve(null)),
    () => (detail.source === "db"
      ? safeQuery(
          "evaluateSelfSustainingThreshold",
          evaluateSelfSustainingThreshold(project.realProjectId),
          {
            projectId: project.realProjectId,
            isThresholdMet: false,
            netCashFlowUsdMinor: "0",
            inflowUsdMinor: "0",
            outflowUsdMinor: "0",
            evaluationPeriodDays: 90,
            evaluatedAt: new Date().toISOString(),
          },
          4000,
        )
      : Promise.resolve(null)),
    () => (detail.source === "db"
      ? safeQuery(
          "getProjectBalance",
          getProjectBalance(project.realProjectId),
          0n,
          4000,
        )
      : Promise.resolve(0n)),
    () => (detail.source === "db"
      ? safeQuery(
          "getTransactions(project)",
          getTransactions(
            { projectId: project.realProjectId },
            { limit: 25 },
          ),
          [],
          4000,
        )
      : Promise.resolve([])),
  ] as const, 4);

  // Stage 3.C — active distribution suggestion for the Capital tab card.
  const distributionSuggestion =
    detail.source === "db"
      ? await safeQuery(
          "getActiveSuggestionForProject",
          getActiveSuggestionForProject(project.realProjectId),
          null,
          4000,
        )
      : null;

  // Stage 2.4 — Site Operations data for the project tabs.
  const [
    projectSiteReports,
    projectVendorEngagements,
    projectMaterialPos,
    projectSafetyIncidents,
    projectRfis,
  ] = await mapPoolAll([
    () => (detail.source === "db"
      ? safeQuery(
          "getSiteReports(project)",
          getSiteReports({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([])),
    () => (detail.source === "db"
      ? safeQuery(
          "getVendorEngagements(project)",
          getVendorEngagements({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([])),
    () => (detail.source === "db"
      ? safeQuery(
          "getMaterialPurchaseOrders(project)",
          getMaterialPurchaseOrders({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([])),
    () => (detail.source === "db"
      ? safeQuery(
          "getSafetyIncidents(project)",
          getSafetyIncidents({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([])),
    () => (detail.source === "db"
      ? safeQuery(
          "listProjectRfis(open)",
          listProjectRfis({
            projectId: project.realProjectId,
            status: "open",
          }),
          [],
          4000,
        )
      : Promise.resolve([])),
  ] as const, 4);
  const projectDocuments =
    detail.source === "db"
      ? await safeQuery(
          "listProjectDocuments(project)",
          listProjectDocuments(project.realProjectId),
          [],
          4000,
        )
      : [];

  const sourceOptions = allSourcesRaw.map((s) => ({
    id: s.id,
    code: s.sourceCode,
    category: s.sourceCategory,
    campaignName: s.campaignName,
  }));

  const totalBudgetMajor = Number(project.totalBudgetMinor) / 100;
  const usedMajor = Number(project.budgetUsedMinor) / 100;
  const budgetPct =
    totalBudgetMajor > 0 ? Math.round((usedMajor / totalBudgetMajor) * 100) : 0;

  const activePhases = phases.filter((p) => p.status === "in_progress");

  // Upcoming-milestones panel (Overview) — synthesize from the phase roster
  // (same proof-of-life source the standalone milestones editor uses when no
  // milestones are authored). Earliest target first, only what's still ahead.
  const today = new Date();
  const upcomingPhases = phases
    .filter((p) => p.status !== "completed")
    .map((p) => {
      const target = p.plannedEndDate ?? p.plannedStartDate ?? null;
      const targetDate = target ? new Date(target) : null;
      const daysAway = targetDate
        ? Math.round((targetDate.getTime() - today.getTime()) / 86_400_000)
        : null;
      const slipping = daysAway !== null && daysAway < 0;
      return { phase: p, target, daysAway, slipping };
    })
    .sort((a, b) => {
      if (!a.target) return 1;
      if (!b.target) return -1;
      return a.target.localeCompare(b.target);
    })
    .slice(0, 4);

  // Overview KPIs + RFIs panel — real reads (db-gated; empty on mock source).
  const nextMilestone = upcomingPhases[0] ?? null;
  const openRfis = projectRfis.slice(0, 4);
  const openRfiCount = projectRfis.length;
  const oldestRfiAgeDays =
    projectRfis.length > 0
      ? Math.max(
          ...projectRfis.map((r) =>
            Math.max(
              0,
              Math.floor(
                (today.getTime() - new Date(r.openedAt).getTime()) /
                  86_400_000,
              ),
            ),
          ),
        )
      : null;

  const tabs: ProjectTab[] = [
    {
      value: "overview",
      label: "Overview",
      content: (
        <div className="project-overview">
          <div className="po-main">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px]">
              <Kpi
                label="Schedule"
                value={`${project.constructionProgressPct}%`}
                sub="weighted complete"
              />
              <Kpi
                label="Budget burn"
                value={fmtMinor(project.budgetUsedMinor, project.currency)}
                sub={`${budgetPct}% of plan`}
                tone="accent"
              />
              <Kpi
                label="RFIs open"
                value={`${openRfiCount}`}
                sub={
                  oldestRfiAgeDays !== null
                    ? `oldest ${oldestRfiAgeDays}d`
                    : "none open"
                }
              />
              <Kpi
                label="Next milestone"
                value={
                  nextMilestone
                    ? nextMilestone.daysAway === null
                      ? "—"
                      : nextMilestone.daysAway < 0
                        ? `${-nextMilestone.daysAway}d`
                        : `${nextMilestone.daysAway}d`
                    : "—"
                }
                sub={
                  nextMilestone
                    ? nextMilestone.phase.phaseType.replace(/_/g, " ")
                    : "none scheduled"
                }
              />
            </div>

            <div className="card po-panel overflow-hidden">
              <div className="po-panel-head">
                <h3 className="display">Upcoming milestones</h3>
                <span className="po-panel-tag mono">
                  {upcomingPhases.length} next · next 90d
                </span>
              </div>
              {upcomingPhases.length === 0 ? (
                <div className="po-panel-body">
                  <p className="text-sm text-ink-3 py-2">
                    No upcoming milestones — every authored phase is complete,
                    or none are dated yet.
                  </p>
                </div>
              ) : (
                <div className="po-panel-body">
                  {upcomingPhases.map((u) => (
                    <div key={u.phase.id} className="milestone-row next">
                      <span className="when mono">
                        {u.target ? formatDate(u.target, "short") : "—"}
                      </span>
                      <div className="ms-body">
                        <span className="name">
                          {u.phase.phaseType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="po-away mono">
                        {u.daysAway === null
                          ? "—"
                          : u.daysAway < 0
                            ? `${-u.daysAway}d late`
                            : `${u.daysAway}d away`}
                      </span>
                      <HealthPill
                        level={u.slipping ? "amber" : "green"}
                        verbose
                        verboseLabel={u.slipping ? "Slipping" : "On plan"}
                      />
                      <span className="ms-check next" aria-hidden>
                        ✓
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card po-panel overflow-hidden">
              <div className="po-panel-head">
                <h3 className="display">Open RFIs · {openRfiCount}</h3>
                <span className="po-panel-tag mono">
                  <span className="pulse-dot accent" aria-hidden />
                  RFI-ROUTER
                </span>
              </div>
              {openRfis.length === 0 ? (
                <div className="po-panel-body">
                  <p className="text-sm text-ink-3 py-2">
                    No open RFIs on this project.{" "}
                    <Link
                      href={`/development-os/projects/${slug}/rfis`}
                      className="underline"
                    >
                      Open the RFI log
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Question</th>
                      <th>Discipline</th>
                      <th>Routed to</th>
                      <th className="num">Age</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {openRfis.map((r) => {
                      const ageDays = Math.max(
                        0,
                        Math.floor(
                          (today.getTime() - new Date(r.openedAt).getTime()) /
                            86_400_000,
                        ),
                      );
                      return (
                        <tr key={r.id}>
                          <td className="mono text-[11px]">
                            <Link
                              href={`/development-os/projects/${slug}/rfis/${r.id}`}
                              className="hover:underline"
                            >
                              {r.ref}
                            </Link>
                          </td>
                          <td className="text-sm">{r.question}</td>
                          <td>
                            <span className="badge">{r.discipline}</span>
                          </td>
                          <td className="text-sm text-ink-2">
                            {r.routedToName ?? "Unrouted"}
                          </td>
                          <td
                            className={`num text-[11px] ${ageDays >= 5 ? "rfi-age-warn" : "text-ink-3"}`}
                          >
                            {ageDays}d
                          </td>
                          <td className="num text-ink-3">→</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <section>
              <div className="section-heading">
                <div className="label eyebrow">Active phases</div>
                <h2>In progress · {activePhases.length}</h2>
                <p>
                  Phases currently running on this project. The full timeline
                  is on the next tab.
                </p>
              </div>
              {activePhases.length === 0 ? (
                <p className="text-sm text-ink-3">
                  No phases in progress — either everything is completed or
                  nothing has started yet.
                </p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activePhases.map((p) => (
                    <li key={p.id} className="po-phase-row">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="status-dot in-progress" aria-hidden />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-ink truncate">
                            {p.phaseType.replace(/_/g, " ")}
                          </span>
                          <span className="mono text-[11px] text-ink-3">
                            since{" "}
                            {p.actualStartDate
                              ? formatDate(p.actualStartDate, "short")
                              : "—"}
                          </span>
                        </div>
                      </div>
                      {p.notes && (
                        <span className="text-xs text-ink-2 text-right truncate max-w-[50%]">
                          {p.notes}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="section-heading">
                <div className="label eyebrow">Quick stats</div>
                <h2>Project facts</h2>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Stat label="Acquisition" value={acquisitionLabel[meta.acquisitionMode] ?? meta.acquisitionMode} />
                <Stat label="Land area" value={meta.landAreaSqm ? `${meta.landAreaSqm.toLocaleString()} m²` : "—"} />
                <Stat label="Gross / net" value={meta.grossSquareMeters && meta.netSquareMeters
                  ? `${meta.grossSquareMeters.toLocaleString()} / ${meta.netSquareMeters.toLocaleString()} m²`
                  : "—"} />
                <Stat label="Project currency" value={meta.projectCurrency} />
                <Stat label="Operational currency" value={meta.operationalCurrency} />
                <Stat label="Acquisition date" value={meta.acquisitionDate ? formatDate(meta.acquisitionDate, "long") : "—"} />
              </dl>
              {meta.notes && (
                <p className="mt-4 text-sm text-ink-2 leading-relaxed">
                  {meta.notes}
                </p>
              )}
            </section>
          </div>

          <aside className="po-rail">
            <div className="po-rail-card">
              <div className="po-rail-label mono">Site</div>
              <h4 className="display">{project.location}</h4>
              <div className="po-rail-sub">
                {acquisitionLabel[meta.acquisitionMode] ?? meta.acquisitionMode}
                {meta.landAreaSqm ? ` · ${meta.landAreaSqm.toLocaleString()} m²` : ""}
              </div>
            </div>
            <div className="po-rail-card">
              <div className="po-rail-label mono">Units · {project.units}</div>
              <div className="po-rail-sub">
                {project.unitsSold} of {project.units} contracted ·{" "}
                {project.constructionProgressPct}% built
              </div>
            </div>
            <div className="po-rail-card">
              <div className="po-rail-label mono">
                Investors · {projectCommitments.length}
              </div>
              <div className="po-rail-sub">
                {formatUsdMinor(
                  projectCommitments.reduce(
                    (a, c) => a + BigInt(c.committedAmountUsdMinor),
                    0n,
                  ),
                )}{" "}
                committed
              </div>
              <Link
                href={`/development-os/projects/${slug}/milestones`}
                className="btn btn-dark btn-sm w-full mt-2 justify-center"
              >
                Compose update
              </Link>
            </div>
          </aside>
        </div>
      ),
    },
    {
      value: "phases",
      label: "Phases",
      badge: `${phases.length}`,
      content: <PhasesTimeline phases={phases} />,
    },
    {
      value: "land",
      label: "Land",
      badge: `${plots.length}`,
      content:
        plots.length === 0 ? (
          <EmptyState
            title="No land plots recorded"
            description="Add a plot record to track acquisition and lease."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {plots.map((p) => (
              <LandPlotCard key={p.id} plot={p} />
            ))}
          </div>
        ),
    },
    {
      value: "units",
      label: "Units",
      badge: `${units.length}`,
      content: <UnitTable units={units} />,
    },
    {
      value: "documents",
      label: "Documents",
      badge: projectDocuments.length > 0 ? `${projectDocuments.length}` : undefined,
      content:
        detail.source !== "db" ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Documents light up once the database is configured."
          />
        ) : (
          <ProjectDocumentsTab
            projectId={project.realProjectId}
            slug={slug}
            documents={projectDocuments}
          />
        ),
    },
    {
      value: "capital",
      label: "Capital",
      badge:
        projectCommitments.length > 0
          ? `${projectCommitments.length}`
          : undefined,
      content:
        detail.source !== "db" ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Capital tab lights up once the database is configured."
          />
        ) : projectCommitments.length === 0 ? (
          <EmptyState
            title="No commitments allocated to this project"
            description="When investors commit capital to this project, their commitments appear here."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                label="Project balance"
                value={formatUsdMinor(projectBalance ?? 0n)}
              />
              <Kpi
                label="Committed"
                value={formatUsdMinor(
                  projectCommitments.reduce(
                    (a, c) => a + BigInt(c.committedAmountUsdMinor),
                    0n,
                  ),
                )}
                sub={`${projectCommitments.length} commitments`}
              />
              <Kpi
                label="Drawn"
                value={formatUsdMinor(
                  projectCommitments.reduce(
                    (a, c) => a + BigInt(c.drawnUsdMinor),
                    0n,
                  ),
                )}
              />
              <Kpi
                label="Self-sustaining"
                value={
                  sustainCheck?.isThresholdMet ? "Yes" : "Not yet"
                }
                sub={
                  sustainCheck
                    ? `Net 90d ${formatUsdMinor(
                        BigInt(sustainCheck.netCashFlowUsdMinor),
                      )}`
                    : undefined
                }
              />
            </div>
            <div>
              <div className="label mb-2.5">Commitments</div>
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Investor</TH>
                    <TH>Committed</TH>
                    <TH>Drawn</TH>
                    <TH>Drawn %</TH>
                    <TH>Profit %</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {projectCommitments.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/commitments/${c.id}`}
                          className="hover:underline"
                        >
                          {c.commitmentCode}
                        </Link>
                      </TD>
                      <TD>
                        <Link
                          href={`/development-os/investors/${c.investorCode}`}
                          className="hover:underline text-sm"
                        >
                          {c.investorLegalName}
                        </Link>
                      </TD>
                      <TDNum>
                        {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                      </TDNum>
                      <TDNum>{formatUsdMinor(BigInt(c.drawnUsdMinor))}</TDNum>
                      <TDNum>{c.drawnPercent.toFixed(1)}%</TDNum>
                      <TDNum>{Number(c.profitSharePercent).toFixed(1)}%</TDNum>
                      <TD>
                        <HandoffBadge
                          tone={
                            c.status === "active"
                              ? "ok"
                              : c.status === "fully_called"
                                ? "info"
                                : "soft"
                          }
                        >
                          {COMMITMENT_STATUS_LABEL[c.status]}
                        </HandoffBadge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <div>
              <div className="label mb-2.5">AI</div>
              <DistributionSuggestionCard
                projectId={project.realProjectId}
                isSelfSustaining={Boolean(sustainCheck?.isThresholdMet)}
                suggestion={
                  distributionSuggestion
                    ? {
                        id: distributionSuggestion.id,
                        status: distributionSuggestion.status as
                          | "draft"
                          | "reviewed",
                        suggestedAmountUsdMinor: String(
                          distributionSuggestion.suggestedAmountUsdMinor,
                        ),
                        suggestedDistributionType:
                          distributionSuggestion.suggestedDistributionType as
                            | "capital_return"
                            | "profit_distribution"
                            | "mixed"
                            | "none",
                        suggestedEffectiveDate:
                          distributionSuggestion.suggestedEffectiveDate,
                        currentProjectBalanceUsdMinor: String(
                          distributionSuggestion.currentProjectBalanceUsdMinor,
                        ),
                        currentCompanyBalanceUsdMinor: String(
                          distributionSuggestion.currentCompanyBalanceUsdMinor,
                        ),
                        bufferAmountUsdMinor: String(
                          distributionSuggestion.bufferAmountUsdMinor,
                        ),
                        outstandingCapitalUsdMinor: String(
                          distributionSuggestion.outstandingCapitalUsdMinor,
                        ),
                        outstandingCommitmentsUsdMinor: String(
                          distributionSuggestion.outstandingCommitmentsUsdMinor,
                        ),
                        netCashFlow90dUsdMinor: String(
                          distributionSuggestion.netCashFlow90dUsdMinor,
                        ),
                        isSelfSustaining:
                          distributionSuggestion.isSelfSustaining,
                        reasoning: distributionSuggestion.reasoning,
                        confidenceLevel:
                          distributionSuggestion.confidenceLevel as
                            | "low"
                            | "medium"
                            | "high",
                        riskFactors: distributionSuggestion.riskFactors,
                        recommendations:
                          distributionSuggestion.recommendations,
                        allocationPreview:
                          (distributionSuggestion.allocationPreview as Array<{
                            commitmentCode: string;
                            investorLegalName: string;
                            capitalReturnAmountUsdMinor: string;
                            profitAmountUsdMinor: string;
                            totalAmountUsdMinor: string;
                          }>) ?? [],
                        generatedAt: distributionSuggestion.generatedAt,
                      }
                    : null
                }
              />
            </div>
          </div>
        ),
    },
    {
      value: "finance",
      label: "Finance",
      content:
        detail.source !== "db" || !financialSummary ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Finance tab lights up once the database is configured."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                label="Total budget"
                value={formatUsdMinor(BigInt(financialSummary.totalBudgetUsdMinor))}
              />
              <Kpi
                label="Committed (POs)"
                value={formatUsdMinor(
                  BigInt(financialSummary.totalCommittedUsdMinor),
                )}
              />
              <Kpi
                label="Actual spent"
                value={formatUsdMinor(
                  BigInt(financialSummary.totalActualUsdMinor),
                )}
                sub={`${financialSummary.budgetConsumedPercent.toFixed(1)}% of budget`}
              />
              <Kpi
                label="Remaining"
                value={formatUsdMinor(
                  BigInt(financialSummary.remainingBudgetUsdMinor),
                )}
              />
            </div>
            <div>
              <div className="label mb-2.5">Three-state</div>
              {budgetRows.length === 0 ? (
                <EmptyState
                  title="No budget lines for this project yet"
                  description="Use the createBudgetLine action to add the first."
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Category</TH>
                      <TH>Budgeted</TH>
                      <TH>Committed</TH>
                      <TH>Actual</TH>
                      <TH>Variance %</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {budgetRows.map((r) => (
                      <TR key={r.categoryId}>
                        <TD className="text-sm">{r.categoryDisplayName}</TD>
                        <TDNum>{formatUsdMinor(BigInt(r.budgetedUsdMinor))}</TDNum>
                        <TDNum>{formatUsdMinor(BigInt(r.committedUsdMinor))}</TDNum>
                        <TDNum>{formatUsdMinor(BigInt(r.actualUsdMinor))}</TDNum>
                        <TDNum
                          className={
                            r.variancePercent > 0 ? "text-danger" : "text-success"
                          }
                        >
                          {r.variancePercent > 0 ? "+" : ""}
                          {r.variancePercent.toFixed(1)}%
                        </TDNum>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </div>
            {projectTransactions.length > 0 && (
              <div>
                <div className="label mb-2.5">Activity</div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Code</TH>
                      <TH>Date</TH>
                      <TH>Direction</TH>
                      <TH>Description</TH>
                      <TH>USD</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {projectTransactions.map((t) => (
                      <TR key={t.id}>
                        <TD className="font-mono text-[11px]">
                          <Link
                            href={`/development-os/finance/transactions/${t.id}`}
                            className="hover:underline"
                          >
                            {t.transactionCode}
                          </Link>
                        </TD>
                        <TD className="text-xs">{t.transactionDate}</TD>
                        <TD>
                          <HandoffBadge
                            tone={
                              t.direction === "inflow"
                                ? "ok"
                                : t.direction === "outflow"
                                  ? "danger"
                                  : "soft"
                            }
                          >
                            {t.direction}
                          </HandoffBadge>
                        </TD>
                        <TD className="text-xs">{t.description}</TD>
                        <TDNum>{formatUsdMinor(BigInt(t.amountUsdMinor))}</TDNum>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
        ),
    },
    {
      value: "sales",
      label: "Sales",
      badge: projectLeads.length > 0 ? `${projectLeads.length}` : undefined,
      content:
        detail.source !== "db" || !salesUnified ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Sales lights up here once the database is configured (runs against the contacts + sales schema)."
          />
        ) : (
          <ProjectSalesUnified
            data={salesUnified}
            leadsView={
              <LeadPipelineBoard
                leads={projectLeads}
                pendingDraftsByRoleId={{}}
                filterOptions={{
                  projects: [
                    { id: project.realProjectId, name: project.name },
                  ],
                  sources: sourceOptions,
                  agents: [],
                }}
                scopedProjectId={project.realProjectId}
              />
            }
          />
        ),
    },
    {
      value: "site-reports",
      label: "Site reports",
      badge:
        projectSiteReports.length > 0
          ? `${projectSiteReports.length}`
          : undefined,
      content:
        detail.source !== "db" ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Site reports light up once the database is configured."
          />
        ) : projectSiteReports.length === 0 ? (
          <EmptyState
            title="No site reports yet for this project"
            description="The first daily report will show here once submitted."
            action={
              <Button asChild>
                <Link
                  href={`/development-os/site-reports/new?projectId=${project.realProjectId}`}
                >
                  + New report
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                label="Total reports"
                value={String(projectSiteReports.length)}
              />
              <Kpi
                label="With blockers"
                value={String(
                  projectSiteReports.filter((r) => r.blockerCount > 0).length,
                )}
              />
              <Kpi
                label="Avg workers"
                value={String(
                  Math.round(
                    projectSiteReports.reduce(
                      (a, r) => a + r.totalWorkersPresent,
                      0,
                    ) / Math.max(1, projectSiteReports.length),
                  ),
                )}
              />
              <Kpi
                label="Photos uploaded"
                value={String(
                  projectSiteReports.reduce((a, r) => a + r.photoCount, 0),
                )}
              />
            </div>
            <div>
              <div className="label mb-2.5">Recent</div>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Weather</TH>
                    <TH>Workers</TH>
                    <TH>Zones</TH>
                    <TH>Photos</TH>
                    <TH>Blockers</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {projectSiteReports.slice(0, 20).map((r) => (
                    <TR key={r.id}>
                      <TD className="text-xs">
                        <Link
                          href={`/development-os/site-reports/${r.id}`}
                          className="hover:underline"
                        >
                          {r.reportDate}
                        </Link>
                      </TD>
                      <TD className="text-xs">
                        {r.weatherConditions
                          ? WEATHER_LABEL[r.weatherConditions]
                          : "—"}
                      </TD>
                      <TDNum>{r.totalWorkersPresent}</TDNum>
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
          </div>
        ),
    },
    {
      value: "vendors",
      label: "Vendors",
      badge:
        projectVendorEngagements.length > 0
          ? `${projectVendorEngagements.length}`
          : undefined,
      content:
        detail.source !== "db" ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Vendor engagements light up once the database is configured."
          />
        ) : projectVendorEngagements.length === 0 ? (
          <EmptyState
            title="No vendor engagements on this project"
            description="When a vendor is engaged for work on this project, the engagement appears here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Engagement</TH>
                <TH>Vendor</TH>
                <TH>Scope</TH>
                <TH>Start</TH>
                <TH>Expected end</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {projectVendorEngagements.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.engagementCode}</TD>
                  <TD>
                    <Link
                      href={`/development-os/vendors/${e.vendorCode}`}
                      className="hover:underline text-sm"
                    >
                      {e.vendorLegalName}
                    </Link>
                  </TD>
                  <TD className="text-xs">{e.scopeDescription}</TD>
                  <TD className="text-xs">{e.startDate}</TD>
                  <TD className="text-xs">{e.expectedEndDate ?? "—"}</TD>
                  <TD>
                    <HandoffBadge
                      tone={
                        e.status === "active"
                          ? "ok"
                          : e.status === "completed"
                            ? "soft"
                            : e.status === "terminated"
                              ? "danger"
                              : "warn"
                      }
                    >
                      {ENGAGEMENT_STATUS_LABEL[e.status]}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ),
    },
    {
      value: "materials",
      label: "Materials",
      badge:
        projectMaterialPos.length > 0
          ? `${projectMaterialPos.length}`
          : undefined,
      content:
        detail.source !== "db" ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Material POs light up once the database is configured."
          />
        ) : projectMaterialPos.length === 0 ? (
          <EmptyState
            title="No material POs for this project"
            description="POs created against this project will appear here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>PO</TH>
                <TH>Vendor</TH>
                <TH>Order</TH>
                <TH>Expected</TH>
                <TH>Lines</TH>
                <TH>Total (USD)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {projectMaterialPos.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/materials/${p.poCode}`}
                      className="hover:underline"
                    >
                      {p.poCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{p.vendorLegalName}</TD>
                  <TD className="text-xs">{p.orderDate}</TD>
                  <TD className="text-xs">{p.expectedDeliveryDate ?? "—"}</TD>
                  <TDNum>{p.lineCount}</TDNum>
                  <TDNum>{formatUsdMinor(BigInt(p.totalAmountUsdMinor))}</TDNum>
                  <TD>
                    <HandoffBadge
                      tone={
                        p.status === "fully_delivered"
                          ? "ok"
                          : p.status === "partially_delivered"
                            ? "info"
                            : p.status === "ordered"
                              ? "warn"
                              : "soft"
                      }
                    >
                      {MATERIAL_PO_STATUS_LABEL[p.status]}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ),
    },
    {
      value: "safety",
      label: "Safety",
      badge:
        projectSafetyIncidents.filter((i) => i.status === "open").length > 0
          ? `${projectSafetyIncidents.filter((i) => i.status === "open").length}`
          : undefined,
      content:
        detail.source !== "db" ? (
          <ComingInPlaceholder
            stage="Soon"
            summary="Safety incidents light up once the database is configured."
          />
        ) : projectSafetyIncidents.length === 0 ? (
          <EmptyState
            title="No safety incidents on this project"
            description="Hopefully it stays that way. Use the Safety section to record any incidents."
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
              {projectSafetyIncidents.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">{i.incidentCode}</TD>
                  <TD className="text-xs">{i.incidentDate}</TD>
                  <TD>
                    <HandoffBadge tone={SEVERITY_HANDOFF_TONE[SAFETY_SEVERITY_TONE[i.severity]]}>
                      {SAFETY_SEVERITY_LABEL[i.severity]}
                    </HandoffBadge>
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
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ),
    },
  ];

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Dev OS</Link>
            <span>/</span>
            <Link href="/development-os/projects">Projects</Link>
            <span>/</span>
            <span>{project.name}</span>
          </div>
          <h1>{project.name}</h1>
          <div className="page-header-meta">
            <Layers className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            <span>
              {(acquisitionLabel[meta.acquisitionMode] ?? meta.acquisitionMode).toUpperCase()}
            </span>
            {meta.acquisitionDate && (
              <>
                <span>·</span>
                <Calendar className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                <span>ACQUIRED {formatDate(meta.acquisitionDate, "short")}</span>
              </>
            )}
            <span>·</span>
            <Globe className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            <span>
              {meta.projectCurrency} / {meta.operationalCurrency}
            </span>
          </div>
        </div>
        <div className="actions">
          <SourceBadge source={detail.source} />
          <Link
            href="/development-os/projects"
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All projects
          </Link>
          <Link
            href={`/development-os/projects/${slug}/rfis`}
            className="btn btn-dark btn-sm"
          >
            + RFI
          </Link>
          <Link
            href={`/development-os/projects/${slug}/milestones`}
            className="btn btn-amber btn-sm"
          >
            + Milestone
          </Link>
        </div>
      </header>

      {meta.notes && (
        <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
          {meta.notes}
        </p>
      )}

      <ProjectDetailTabs tabs={tabs} defaultValue="overview" />
    </DevelopmentShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="po-stat">
      <span className="label">{label}</span>
      <span className="mono text-sm text-ink tabular-nums">{value}</span>
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </div>
  );
}

function ComingInPlaceholder({ stage, summary }: { stage: string; summary: string }) {
  return (
    <div className="po-coming">
      <HandoffBadge tone="gold">Stage {stage}</HandoffBadge>
      <p className="text-sm text-ink-2 max-w-md leading-relaxed">{summary}</p>
    </div>
  );
}

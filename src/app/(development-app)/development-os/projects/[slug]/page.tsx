import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Globe, Layers } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SourceBadge } from "@/components/ui/source-badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { DevelopmentMetricCard } from "@/components/development/metric-card";
import { PhasesTimeline } from "@/components/development/phases-timeline";
import { LandPlotCard } from "@/components/development/land-plot-card";
import { UnitTable } from "@/components/development/unit-row";
import {
  ProjectDetailTabs,
  type ProjectTab,
} from "@/components/development/project-detail-tabs";
import { formatDate, formatUSD } from "@/lib/utils";
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
import { getVendorEngagements } from "@/lib/development/server/vendors";
import { getMaterialPurchaseOrders } from "@/lib/development/server/materials";
import { getSafetyIncidents } from "@/lib/development/server/safety";
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
import type { DevelopmentMetric } from "@/lib/development/types";

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
  ] = await Promise.all([
    detail.source === "db" ? getProjectLeads(project.realProjectId) : Promise.resolve([]),
    detail.source === "db" ? getActiveLeadSources() : Promise.resolve([]),
    detail.source === "db"
      ? getProjectSalesData(project.realProjectId)
      : Promise.resolve(null),
    detail.source === "db"
      ? safeQuery(
          "getCommitments(project)",
          getCommitments({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([]),
    detail.source === "db"
      ? safeQuery(
          "getBudgetVsActual(project)",
          getBudgetVsActual(project.realProjectId),
          [],
          4000,
        )
      : Promise.resolve([]),
    detail.source === "db"
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
      : Promise.resolve(null),
    detail.source === "db"
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
      : Promise.resolve(null),
    detail.source === "db"
      ? safeQuery(
          "getProjectBalance",
          getProjectBalance(project.realProjectId),
          0n,
          4000,
        )
      : Promise.resolve(0n),
    detail.source === "db"
      ? safeQuery(
          "getTransactions(project)",
          getTransactions(
            { projectId: project.realProjectId },
            { limit: 25 },
          ),
          [],
          4000,
        )
      : Promise.resolve([]),
  ]);

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
  ] = await Promise.all([
    detail.source === "db"
      ? safeQuery(
          "getSiteReports(project)",
          getSiteReports({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([]),
    detail.source === "db"
      ? safeQuery(
          "getVendorEngagements(project)",
          getVendorEngagements({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([]),
    detail.source === "db"
      ? safeQuery(
          "getMaterialPurchaseOrders(project)",
          getMaterialPurchaseOrders({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([]),
    detail.source === "db"
      ? safeQuery(
          "getSafetyIncidents(project)",
          getSafetyIncidents({ projectId: project.realProjectId }),
          [],
          4000,
        )
      : Promise.resolve([]),
  ]);
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

  const overviewMetrics: DevelopmentMetric[] = [
    {
      id: "m-progress",
      label: "Construction",
      value: `${project.constructionProgressPct}`,
      unit: "% weighted",
      changePct: null,
      trend: "flat",
      status: "ok",
    },
    {
      id: "m-units",
      label: "Units contracted",
      value: `${project.unitsSold} / ${project.units}`,
      changePct: null,
      trend: "flat",
      status: project.unitsSold > 0 ? "ok" : "watch",
    },
    {
      id: "m-budget",
      label: "Budget used",
      value: fmtMinor(project.budgetUsedMinor, project.currency),
      changePct: null,
      trend: "flat",
      status: budgetPct > 90 ? "watch" : "ok",
      hint: `${budgetPct}% of plan`,
    },
    {
      id: "m-handover",
      label: "Planned handover",
      value: project.expectedHandover
        ? formatDate(project.expectedHandover, "short")
        : "—",
      changePct: null,
      trend: "flat",
      status: "ok",
    },
  ];

  const activePhases = phases.filter((p) => p.status === "in_progress");

  const tabs: ProjectTab[] = [
    {
      value: "overview",
      label: "Overview",
      content: (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {overviewMetrics.map((m) => (
              <DevelopmentMetricCard key={m.id} metric={m} />
            ))}
          </div>

          <Section
            eyebrow="Active phases"
            title={`In progress · ${activePhases.length}`}
            description="Phases currently running on this project. The full timeline is on the next tab."
          >
            {activePhases.length === 0 ? (
              <EmptyState
                title="No phases in progress"
                description="Either everything is completed or nothing has started yet."
              />
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activePhases.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-accent" aria-hidden />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-ink truncate">
                          {p.phaseType.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-ink-tertiary">
                          since{" "}
                          {p.actualStartDate
                            ? formatDate(p.actualStartDate, "short")
                            : "—"}
                        </span>
                      </div>
                    </div>
                    {p.notes && (
                      <span className="text-xs text-ink-secondary text-right truncate max-w-[50%]">
                        {p.notes}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section eyebrow="Quick stats" title="Project facts">
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
              <p className="mt-4 text-sm text-ink-secondary leading-relaxed">
                {meta.notes}
              </p>
            )}
          </Section>
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
      content: (
        <ComingInPlaceholder
          stage="2.4"
          summary="Drawings, permits, contracts indexed against this project. Reuses the existing `documents` table."
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
            stage="2.3"
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
              <Stat
                label="Project balance"
                value={formatUsdMinor(projectBalance ?? 0n)}
              />
              <Stat
                label="Committed"
                value={formatUsdMinor(
                  projectCommitments.reduce(
                    (a, c) => a + BigInt(c.committedAmountUsdMinor),
                    0n,
                  ),
                )}
                hint={`${projectCommitments.length} commitments`}
              />
              <Stat
                label="Drawn"
                value={formatUsdMinor(
                  projectCommitments.reduce(
                    (a, c) => a + BigInt(c.drawnUsdMinor),
                    0n,
                  ),
                )}
              />
              <Stat
                label="Self-sustaining"
                value={
                  sustainCheck?.isThresholdMet ? "Yes" : "Not yet"
                }
                hint={
                  sustainCheck
                    ? `Net 90d ${formatUsdMinor(
                        BigInt(sustainCheck.netCashFlowUsdMinor),
                      )}`
                    : undefined
                }
              />
            </div>
            <Section
              eyebrow="Commitments"
              title="Investor capital allocated to this project"
            >
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
                        <Badge
                          tone={
                            c.status === "active"
                              ? "success"
                              : c.status === "fully_called"
                                ? "info"
                                : "neutral"
                          }
                        >
                          {COMMITMENT_STATUS_LABEL[c.status]}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
            <Section
              eyebrow="AI"
              title="Distribution preview"
              description="The AI agent reviews this project's cash flow and suggests whether to declare a distribution. Suggestions are HITL: nothing is declared without your approval. Conservative defaults (6-month buffer, 30-day cooldown, capital-return-first) are enforced in code regardless of the AI's view."
            >
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
            </Section>
          </div>
        ),
    },
    {
      value: "finance",
      label: "Finance",
      content:
        detail.source !== "db" || !financialSummary ? (
          <ComingInPlaceholder
            stage="2.3"
            summary="Finance tab lights up once the database is configured."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat
                label="Total budget"
                value={formatUsdMinor(BigInt(financialSummary.totalBudgetUsdMinor))}
              />
              <Stat
                label="Committed (POs)"
                value={formatUsdMinor(
                  BigInt(financialSummary.totalCommittedUsdMinor),
                )}
              />
              <Stat
                label="Actual spent"
                value={formatUsdMinor(
                  BigInt(financialSummary.totalActualUsdMinor),
                )}
                hint={`${financialSummary.budgetConsumedPercent.toFixed(1)}% of budget`}
              />
              <Stat
                label="Remaining"
                value={formatUsdMinor(
                  BigInt(financialSummary.remainingBudgetUsdMinor),
                )}
              />
            </div>
            <Section
              eyebrow="Three-state"
              title="Budget vs committed vs actual"
            >
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
            </Section>
            {projectTransactions.length > 0 && (
              <Section
                eyebrow="Activity"
                title={`Last ${projectTransactions.length} transactions`}
              >
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
                          <Badge
                            tone={
                              t.direction === "inflow"
                                ? "success"
                                : t.direction === "outflow"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {t.direction}
                          </Badge>
                        </TD>
                        <TD className="text-xs">{t.description}</TD>
                        <TDNum>{formatUsdMinor(BigInt(t.amountUsdMinor))}</TDNum>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Section>
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
            stage="2.2.A"
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
            stage="2.4"
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
              <Stat
                label="Total reports"
                value={String(projectSiteReports.length)}
              />
              <Stat
                label="With blockers"
                value={String(
                  projectSiteReports.filter((r) => r.blockerCount > 0).length,
                )}
              />
              <Stat
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
              <Stat
                label="Photos uploaded"
                value={String(
                  projectSiteReports.reduce((a, r) => a + r.photoCount, 0),
                )}
              />
            </div>
            <Section
              eyebrow="Recent"
              title={`Last ${Math.min(20, projectSiteReports.length)} reports`}
            >
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
                          <Badge tone="warning">{r.blockerCount}</Badge>
                        ) : (
                          "—"
                        )}
                      </TDNum>
                      <TD>
                        <Badge
                          tone={
                            r.status === "reviewed"
                              ? "success"
                              : r.status === "submitted"
                                ? "info"
                                : r.status === "flagged"
                                  ? "danger"
                                  : "neutral"
                          }
                        >
                          {REPORT_STATUS_LABEL[r.status]}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
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
            stage="2.4"
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
                    <Badge
                      tone={
                        e.status === "active"
                          ? "success"
                          : e.status === "completed"
                            ? "neutral"
                            : e.status === "terminated"
                              ? "danger"
                              : "warning"
                      }
                    >
                      {ENGAGEMENT_STATUS_LABEL[e.status]}
                    </Badge>
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
            stage="2.4"
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
                    <Badge
                      tone={
                        p.status === "fully_delivered"
                          ? "success"
                          : p.status === "partially_delivered"
                            ? "info"
                            : p.status === "ordered"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {MATERIAL_PO_STATUS_LABEL[p.status]}
                    </Badge>
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
            stage="2.4"
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
        ),
    },
  ];

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: project.name },
        ]}
        eyebrow={project.location}
        title={project.name}
        description={
          meta.notes ??
          "Project workspace — phases, land, units, and the artifact trail behind every decision."
        }
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={detail.source} />
            <Button asChild variant="secondary">
              <Link href="/development-os/projects">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                All projects
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 -mt-4 flex-wrap">
        <Badge tone="outline">
          <Layers className="w-3 h-3 mr-1" strokeWidth={2} />
          {acquisitionLabel[meta.acquisitionMode] ?? meta.acquisitionMode}
        </Badge>
        {meta.acquisitionDate && (
          <Badge tone="outline">
            <Calendar className="w-3 h-3 mr-1" strokeWidth={2} />
            Acquired {formatDate(meta.acquisitionDate, "short")}
          </Badge>
        )}
        <Badge tone="outline">
          <Globe className="w-3 h-3 mr-1" strokeWidth={2} />
          {meta.projectCurrency} / {meta.operationalCurrency}
        </Badge>
      </div>

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
    <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex flex-col gap-0.5">
      <span className="text-label">{label}</span>
      <span className="text-sm text-ink font-mono tabular-nums">{value}</span>
      {hint && (
        <span className="text-[11px] text-ink-tertiary">{hint}</span>
      )}
    </div>
  );
}

function ComingInPlaceholder({ stage, summary }: { stage: string; summary: string }) {
  return (
    <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 flex flex-col items-center text-center gap-2">
      <Badge tone="gold">Stage {stage}</Badge>
      <p className="text-sm text-ink-secondary max-w-md leading-relaxed">{summary}</p>
    </div>
  );
}

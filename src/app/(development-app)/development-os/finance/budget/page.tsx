import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { projects } from "@/lib/db/schema/projects";
import {
  getBudgetVsActual,
  getProjectFinancialSummary,
} from "@/lib/development/server/budget";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { requireOrgId } from "@/features/auth/require-org";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { AddBudgetLineButton } from "./_budget-line-form";

export const metadata: Metadata = { title: "Budget · Development OS" };
export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Budget</span>
            </div>
            <h1>Budget</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const organizationId = await requireOrgId();
  const projectList = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(projects.name);

  const categoryRows = await safeQuery(
    "getCostCategories",
    getCostCategories(),
    [] as Awaited<ReturnType<typeof getCostCategories>>,
    4000,
  );
  const categoryOptions = categoryRows
    .filter((c) => c.isActive)
    .map((c) => ({
      id: c.id,
      code: c.categoryCode,
      displayName: c.displayName,
    }));
  const projectOptions = projectList.map((p) => ({ id: p.id, name: p.name }));

  const projectId = sp.projectId ?? projectList[0]?.id;
  const selectedProject = projectList.find((p) => p.id === projectId);

  const [rows, summary] = projectId
    ? await Promise.all([
        safeQuery(
          "getBudgetVsActual",
          getBudgetVsActual(projectId),
          [],
          4000,
        ),
        safeQuery(
          "getProjectFinancialSummary",
          getProjectFinancialSummary(projectId),
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
        ),
      ])
    : [[], null];

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Budget</span>
          </div>
          <h1>Budget vs actual</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Three-state cost ledger per category — Budgeted (planned), Committed
            (signed POs), Actual (cash out the door). Variance = Actual −
            Budgeted.
          </p>
        </div>
        <div className="actions">
          <AddBudgetLineButton
            projects={projectOptions}
            categories={categoryOptions}
            defaultProjectId={projectId}
          />
          <Link href="/development-os/finance" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
        </div>
      </div>

      <form
        method="GET"
        action="/development-os/finance/budget"
        className="rounded-lg border border-line-soft bg-surface p-3 flex items-center gap-3"
      >
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          Project
        </span>
        <select
          name="projectId"
          defaultValue={projectId ?? ""}
          className="rounded-md border border-line-soft bg-surface px-2 py-1 text-sm"
        >
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-accent">
          Apply
        </button>
        {selectedProject && (
          <Link
            href={`/development-os/finance/budget/${selectedProject.id}`}
            className="text-xs text-ink-secondary hover:text-ink ml-auto"
          >
            Project budget detail →
          </Link>
        )}
      </form>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Total budget" value={formatUsdMinor(BigInt(summary.totalBudgetUsdMinor))} />
          <Kpi
            label="Committed"
            value={formatUsdMinor(BigInt(summary.totalCommittedUsdMinor))}
          />
          <Kpi
            label="Actual"
            value={formatUsdMinor(BigInt(summary.totalActualUsdMinor))}
            sub={`${summary.budgetConsumedPercent.toFixed(1)}% of budget`}
          />
          <Kpi
            label="Remaining"
            value={formatUsdMinor(BigInt(summary.remainingBudgetUsdMinor))}
          />
        </div>
      )}

      <div>
        <div className="label mb-2.5">Per category</div>
        {rows.length === 0 ? (
          <EmptyState
            title="No budget lines for this project"
            description="Use the createBudgetLine action to add the first one."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <TH>Type</TH>
                <TH>Budgeted</TH>
                <TH>Committed</TH>
                <TH>Actual</TH>
                <TH>Variance %</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const pct = r.variancePercent;
                const tone =
                  pct > 0
                    ? "danger"
                    : Math.abs(pct) > 20
                      ? "warn"
                      : "ok";
                return (
                  <TR key={r.categoryId}>
                    <TD className="text-sm">
                      <div className="font-mono text-xs text-ink-tertiary">
                        {r.categoryCode}
                      </div>
                      {r.categoryDisplayName}
                    </TD>
                    <TD className="text-xs text-ink-secondary">{r.categoryType}</TD>
                    <TDNum>{formatUsdMinor(BigInt(r.budgetedUsdMinor))}</TDNum>
                    <TDNum>{formatUsdMinor(BigInt(r.committedUsdMinor))}</TDNum>
                    <TDNum>{formatUsdMinor(BigInt(r.actualUsdMinor))}</TDNum>
                    <TDNum>
                      <span
                        className={
                          pct > 0
                            ? "text-danger"
                            : pct < -20
                              ? "text-success"
                              : "text-ink"
                        }
                      >
                        {pct > 0 ? "+" : ""}
                        {pct.toFixed(1)}%
                      </span>
                    </TDNum>
                    <TD>
                      <HandoffBadge tone={tone}>
                        {r.isOverBudget ? "Over" : "OK"}
                      </HandoffBadge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}

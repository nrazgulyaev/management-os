import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import {
  getBudgetVsActual,
  getProjectFinancialSummary,
} from "@/lib/development/server/budget";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

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
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Budget" },
          ]}
          title="Budget"
        />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const projectList = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .orderBy(projects.name);

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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Budget" },
        ]}
        eyebrow={selectedProject?.name ?? "Select a project"}
        title="Budget vs actual"
        description="Three-state cost ledger per category — Budgeted (planned), Committed (signed POs), Actual (cash out the door). Variance = Actual − Budgeted."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Finance
            </Link>
          </Button>
        }
      />

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
        <Button type="submit">Apply</Button>
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
          <Stat label="Total budget" value={formatUsdMinor(BigInt(summary.totalBudgetUsdMinor))} />
          <Stat
            label="Committed"
            value={formatUsdMinor(BigInt(summary.totalCommittedUsdMinor))}
          />
          <Stat
            label="Actual"
            value={formatUsdMinor(BigInt(summary.totalActualUsdMinor))}
            hint={`${summary.budgetConsumedPercent.toFixed(1)}% of budget`}
          />
          <Stat
            label="Remaining"
            value={formatUsdMinor(BigInt(summary.remainingBudgetUsdMinor))}
          />
        </div>
      )}

      <Section eyebrow="Per category" title="Three-state matrix">
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
                      ? "warning"
                      : "success";
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
                      <Badge tone={tone}>
                        {r.isOverBudget ? "Over" : "OK"}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
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
    <div className="rounded-lg border border-line-soft bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="text-2xl font-medium tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-ink-tertiary mt-1">{hint}</div>}
    </div>
  );
}

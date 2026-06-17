import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { getBudgetVsActual } from "@/lib/development/server/budget";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { requireOrgId } from "@/features/auth/require-org";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { AddBudgetLineButton } from "../_budget-line-form";

export const metadata: Metadata = { title: "Project budget · Development OS" };
export const dynamic = "force-dynamic";

export default async function ProjectBudgetDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Project budget</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const organizationId = await requireOrgId();
  const [project] = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!project) notFound();

  const rows = await getBudgetVsActual(projectId);

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

  // Sort top 5 by absolute variance for the variance section.
  const topVariance = [...rows]
    .sort((a, b) => Math.abs(b.variancePercent) - Math.abs(a.variancePercent))
    .slice(0, 5);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance/budget">Budget</Link> /{" "}
            <span>{project.name}</span>
          </div>
          <h1>{`${project.name} — budget`}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            All categories with active budget lines for this project. Edit lines
            via the createBudgetLine action; the supersession trigger handles
            version chains automatically.
          </p>
        </div>
        <div className="actions">
          <AddBudgetLineButton
            projects={[{ id: project.id, name: project.name }]}
            categories={categoryOptions}
            defaultProjectId={project.id}
            label="+ Add / edit budget line"
          />
          <Link
            href="/development-os/finance/budget"
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All projects
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Three-state matrix</div>
        {rows.length === 0 ? (
          <EmptyState
            title="No budget lines for this project"
            description="Use the createBudgetLine server action to add the first."
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
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.categoryId}>
                  <TD className="text-sm">
                    <div className="font-mono text-xs text-ink-tertiary">
                      {r.categoryCode}
                    </div>
                    {r.categoryDisplayName}
                  </TD>
                  <TDNum>{formatUsdMinor(BigInt(r.budgetedUsdMinor))}</TDNum>
                  <TDNum>{formatUsdMinor(BigInt(r.committedUsdMinor))}</TDNum>
                  <TDNum>{formatUsdMinor(BigInt(r.actualUsdMinor))}</TDNum>
                  <TDNum>
                    {r.variancePercent > 0 ? "+" : ""}
                    {r.variancePercent.toFixed(1)}%
                  </TDNum>
                  <TD>
                    <HandoffBadge tone={r.isOverBudget ? "danger" : "ok"}>
                      {r.isOverBudget ? "Over" : "OK"}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {topVariance.length > 0 && (
        <div>
          <div className="label mb-2.5">Variance</div>
          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <TH>Budgeted</TH>
                <TH>Actual</TH>
                <TH>Variance</TH>
              </TR>
            </THead>
            <TBody>
              {topVariance.map((r) => (
                <TR key={r.categoryId}>
                  <TD className="text-sm">{r.categoryDisplayName}</TD>
                  <TDNum>{formatUsdMinor(BigInt(r.budgetedUsdMinor))}</TDNum>
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
        </div>
      )}
    </DevelopmentShell>
  );
}

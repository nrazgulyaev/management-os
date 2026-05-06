import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
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
import { getBudgetVsActual } from "@/lib/development/server/budget";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

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
        <PageHeader title="Project budget" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [project] = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) notFound();

  const rows = await getBudgetVsActual(projectId);

  // Sort top 5 by absolute variance for the variance section.
  const topVariance = [...rows]
    .sort((a, b) => Math.abs(b.variancePercent) - Math.abs(a.variancePercent))
    .slice(0, 5);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Budget", href: "/development-os/finance/budget" },
          { label: project.name },
        ]}
        eyebrow={`Project ${project.slug}`}
        title={`${project.name} — budget`}
        description="All categories with active budget lines for this project. Edit lines via the createBudgetLine action; the supersession trigger handles version chains automatically."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/budget">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All projects
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Three-state matrix" title="Budget vs committed vs actual">
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
                    <Badge tone={r.isOverBudget ? "danger" : "success"}>
                      {r.isOverBudget ? "Over" : "OK"}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {topVariance.length > 0 && (
        <Section eyebrow="Variance" title="Top 5 categories by absolute variance">
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
        </Section>
      )}
    </DevelopmentShell>
  );
}

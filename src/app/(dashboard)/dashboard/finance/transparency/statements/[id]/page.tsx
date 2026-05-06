import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { getOwnerStatementById, listStatementLines } from "@/features/finance/services";
import {
  getStatementExplanationSnapshot,
  getStatementReconciliationStatus,
  listStatementReconciliationWarnings,
  listStatementSourceGroupLines,
  listStatementSourceGroups,
} from "@/features/statement-transparency/services";
import { StatementSourceBreakdown } from "@/components/finance/statement-source-breakdown";
import { StatementWarningList } from "@/components/finance/statement-warning-list";
import { StatementExplanationCard } from "@/components/finance/statement-explanation-card";
import { AdminSourceTraceCard } from "@/components/finance/admin-source-trace-card";
import { TransparencyStatusBadge } from "@/components/finance/transparency-status-badge";
import { RebuildStatementButton } from "@/components/finance/transparency-buttons";
import { generateStatementExplanation } from "@/features/finance/explanation";

export const metadata = { title: "Statement transparency · detail" };
export const dynamic = "force-dynamic";

export default async function TransparencyStatementDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const statement = await getOwnerStatementById(id);
  if (!statement) notFound();
  const [groups, groupLines, snapshot, allWarnings, recon, lines] =
    await Promise.all([
      listStatementSourceGroups(id),
      listStatementSourceGroupLines(id),
      getStatementExplanationSnapshot(id),
      listStatementReconciliationWarnings(id),
      getStatementReconciliationStatus(id),
      listStatementLines(id),
    ]);
  const fallbackExplanation = generateStatementExplanation(statement, lines);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Transparency", href: "/dashboard/finance/transparency" },
          {
            label: "Statements",
            href: "/dashboard/finance/transparency/statements",
          },
          { label: statement.statementCode },
        ]}
        title={`${statement.periodLabel} · ${statement.statementCode}`}
        description={`${statement.ownerName} · ${statement.managementModel}`}
        actions={
          <div className="flex items-center gap-2">
            <TransparencyStatusBadge status={recon.status} />
            <RebuildStatementButton statementId={id} />
            <Link
              href={`/owner/statements/${id}`}
              className="h-9 px-4 inline-flex items-center rounded-full border border-line-soft text-xs text-ink-secondary hover:border-line-strong"
            >
              Open owner view
            </Link>
          </div>
        }
      />
      <StatementExplanationCard
        snapshot={snapshot}
        fallbackHeadline={fallbackExplanation.headline}
        fallbackBullets={fallbackExplanation.bullets}
      />
      <Section
        eyebrow="Source groups"
        title="Owner-facing breakdown"
        description="The same breakdown the owner sees on /owner/statements/[id]."
      >
        <StatementSourceBreakdown
          groups={groups}
          groupLines={groupLines}
          audience="internal"
        />
      </Section>
      <AdminSourceTraceCard groupLines={groupLines} />
      <Section
        eyebrow="Warnings"
        title={`${allWarnings.length} total · ${recon.open} open`}
        description="All warnings (open / acknowledged / resolved / dismissed)."
      >
        <StatementWarningList warnings={allWarnings} audience="internal" />
      </Section>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  getOwnerStatementById,
  listStatementLines,
} from "@/features/finance/services";
import { StatementDetail } from "@/components/finance/statement-detail";
import { AIPayoutExplainer } from "@/components/owner/ai-payout-explainer";
import {
  getStatementExplanationSnapshot,
  listLinkedActivityForStatement,
  listStatementReconciliationWarnings,
  listStatementSourceGroupLines,
  listStatementSourceGroups,
} from "@/features/statement-transparency/services";
import { StatementSourceBreakdown } from "@/components/finance/statement-source-breakdown";
import { StatementWarningList } from "@/components/finance/statement-warning-list";
import { StatementExplanationCard } from "@/components/finance/statement-explanation-card";
import { StatementLinkedActivity } from "@/components/finance/statement-linked-activity";
import { generateStatementExplanation } from "@/features/finance/explanation";

export const metadata = { title: "Statement" };
export const dynamic = "force-dynamic";

export default async function OwnerStatementDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const statement = await getOwnerStatementById(id);
  if (!statement) notFound();

  // Owner audience can only see lines flagged owner_visible. RLS restricts
  // access at the DB level; the audience flag is a UI safeguard.
  const lines = await listStatementLines(id, { ownerVisibleOnly: true });
  const [groups, groupLines, warnings, snapshot, linkedActivity] =
    await Promise.all([
      listStatementSourceGroups(id),
      listStatementSourceGroupLines(id),
      listStatementReconciliationWarnings(id, {
        ownerVisibleOnly: true,
        status: "open",
      }),
      getStatementExplanationSnapshot(id),
      listLinkedActivityForStatement(id),
    ]);

  // Fallback explanation when the snapshot is missing.
  const fallbackExplanation = generateStatementExplanation(statement, lines);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        breadcrumbs={[
          { label: "Portfolio", href: "/owner" },
          { label: "Statements", href: "/owner/statements" },
          { label: statement.periodLabel },
        ]}
        title={statement.periodLabel}
        description={`${statement.villaCode ?? statement.projectName ?? "—"} · ${statement.managementModel}`}
        actions={
          <Button asChild variant="secondary">
            <a href={`/owner/statements/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" strokeWidth={1.75} />
              Download PDF
            </a>
          </Button>
        }
      />

      <div className="rounded-md border border-line-soft bg-canvas px-5 py-3 text-[11px] text-ink-secondary leading-relaxed">
        Once issued and approved, this statement is the canonical accounting
        record for this period. Use the Why-this-number section below if a
        line looks unexpected.
      </div>
      <StatementDetail statement={statement} lines={lines} audience="owner" />

      <StatementExplanationCard
        snapshot={snapshot}
        fallbackHeadline={fallbackExplanation.headline}
        fallbackBullets={fallbackExplanation.bullets}
      />

      <StatementSourceBreakdown
        groups={groups.filter((g) => g.ownerVisible)}
        groupLines={groupLines}
        audience="owner"
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-display text-[22px] md:text-[26px] font-medium text-ink">
          Items needing your attention
        </h2>
        <StatementWarningList warnings={warnings} audience="owner" />
      </section>

      <StatementLinkedActivity rows={linkedActivity} />

      <section id="ai-explain" className="scroll-mt-24 flex flex-col gap-4">
        <div>
          <span className="text-label">Investor Assistant</span>
          <h2 className="text-display text-[26px] md:text-[32px] leading-tight font-medium text-ink mt-2">
            Why your numbers moved.
          </h2>
          <p className="text-sm text-ink-secondary mt-2 max-w-2xl leading-relaxed">
            Preview only — the assistant runtime arrives in v7. The deterministic
            explanation in the statement footer above is built from your live
            ledger data.
          </p>
        </div>
        <AIPayoutExplainer />
      </section>

      <p className="text-xs text-ink-tertiary">
        Need a clarification?{" "}
        <Link href="/owner/support" className="underline">
          Open a ticket with the Finance Manager
        </Link>
        .
      </p>
    </div>
  );
}

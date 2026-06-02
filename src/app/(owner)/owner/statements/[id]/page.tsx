import { notFound } from "next/navigation";
import Link from "next/link";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  getOwnerStatementById,
  listStatementLines,
} from "@/features/finance/services";
import { StatementDetail } from "@/components/finance/statement-detail";
import { StatementDisputeButton } from "@/components/owner/statement-dispute-button";
import { StatementAcknowledgeButton } from "@/components/owner/statement-acknowledge-button";
import { MarkStatementViewed } from "@/components/owner/mark-statement-viewed";
import { getStatementDisputeState } from "@/features/owner-portal/get-statement-dispute-state";
import { canAcknowledge, type OwnerStatementState } from "@/features/owner-statements/state-machine";
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

  // Owner-side dispute state (separate from the mgmt OwnerStatementRow).
  const disputeState = await getStatementDisputeState(id);
  const ownerState = disputeState.ownerState as OwnerStatementState;
  const terminalAckLabel =
    ownerState === "acknowledged"
      ? "ACKNOWLEDGED"
      : ownerState === "auto_acknowledged"
        ? "AUTO-ACKED"
        : undefined;

  return (
    <div className="flex flex-col gap-12">
      {/* #2 — mark viewed on open (idempotent; pending → viewed). */}
      <MarkStatementViewed statementId={statement.id} />
      <SectionHeading
        eyebrow={`Portfolio · statements · ${statement.periodLabel}`}
        title={statement.periodLabel}
        subtitle={`${statement.villaCode ?? statement.projectName ?? "—"} · ${statement.managementModel}`}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <StatementAcknowledgeButton
              statementId={statement.id}
              statementCode={statement.statementCode}
              netAmount={Number(statement.netPayoutMinor) / 100}
              currency={statement.currency}
              canAcknowledge={canAcknowledge(ownerState)}
              terminalLabel={terminalAckLabel}
            />
            <StatementDisputeButton
              statementId={statement.id}
              statementCode={statement.statementCode}
              alreadyDisputed={disputeState.alreadyDisputed}
            />
            <Button asChild variant="secondary">
              <a href={`/owner/statements/${id}/pdf`} target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4" strokeWidth={1.75} />
                Download PDF
              </a>
            </Button>
          </div>
        }
      />

      <Card style={{ padding: "12px 20px" }}>
        <p style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5, margin: 0 }}>
          Once issued and approved, this statement is the canonical accounting
          record for this period. Use the Why-this-number section below if a
          line looks unexpected.
        </p>
      </Card>
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

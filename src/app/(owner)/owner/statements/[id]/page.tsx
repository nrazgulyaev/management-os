import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getOwnerStatementById,
  listStatementLines,
} from "@/features/finance/services";
import { getStatementDisputeState } from "@/features/owner-portal/get-statement-dispute-state";
import {
  canAcknowledge,
  AUTO_ACK_DAYS,
  type OwnerStatementState,
} from "@/features/owner-statements/state-machine";
import { buildStatementView, compactMoney } from "@/features/owner-statements/detail-view";
import { NetHero } from "@/components/owner-portal/net-hero";
import { MarkStatementViewed } from "@/components/owner/mark-statement-viewed";
import { OwnerStatementMathTable } from "@/components/owner/owner-statement-math-table";
import { OwnerStatementMobileBreakdown } from "@/components/owner/owner-statement-mobile-breakdown";
import { OwnerStatementActionBar } from "@/components/owner/owner-statement-action-bar";
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
  const [groups, groupLines, warnings, snapshot, linkedActivity] = await Promise.all([
    listStatementSourceGroups(id),
    listStatementSourceGroupLines(id),
    listStatementReconciliationWarnings(id, { ownerVisibleOnly: true, status: "open" }),
    getStatementExplanationSnapshot(id),
    listLinkedActivityForStatement(id),
  ]);

  const disputeState = await getStatementDisputeState(id);
  const ownerState = disputeState.ownerState as OwnerStatementState;
  const terminalAckLabel =
    ownerState === "acknowledged"
      ? "ACKNOWLEDGED"
      : ownerState === "auto_acknowledged"
        ? "AUTO-ACKED"
        : undefined;

  // ---- View model (FC-OWNER-STATEMENTS §3) ----
  const currency = statement.currency;
  const net = statement.netPayoutMinor;
  const view = buildStatementView(lines, currency);
  const netText = `${net < 0n ? "−" : "+"}${compactMoney(net, currency)}`;
  const heroValue = compactMoney(net, currency);
  const villaName = statement.villaCode ?? statement.projectName ?? "—";
  const occ =
    statement.occupancyRate == null
      ? null
      : Math.round(statement.occupancyRate > 1 ? statement.occupancyRate : statement.occupancyRate * 100);
  const metaText = `${lines.length} LINES · ${statement.status.toUpperCase()}`;
  const awaiting = ownerState === "pending" || ownerState === "viewed";

  return (
    <div data-density="narrative" className="flex flex-col">
      {/* #2 — mark viewed on open (idempotent; pending → viewed). */}
      <MarkStatementViewed statementId={statement.id} />

      {/* Narrative header band */}
      <div className="px-7 md:px-9 pt-7 pb-5 border-b border-line-soft bg-cream-warm">
        <div className="font-mono text-[11px] text-ink-tertiary tracking-[0.12em] uppercase mb-2">
          <Link href="/owner/statements" className="text-ink-tertiary no-underline hover:text-ink">
            Statements
          </Link>{" "}
          / {statement.periodLabel}
        </div>
        <h1 className="owner-h1">
          {statement.periodLabel} · <em>{villaName}</em>
        </h1>
        <p className="owner-narr">
          Your {villaName} returned a net payout of{" "}
          <strong className="text-ink font-medium">{compactMoney(net, currency)}</strong> for{" "}
          {statement.periodLabel}
          {occ != null ? ` at ${occ}% occupancy` : ""}.
        </p>
      </div>

      <div className="px-7 md:px-9 py-6 flex flex-col gap-[18px]">
        <NetHero
          periodLabel={`Net to you · ${statement.periodLabel}`}
          valueText={heroValue}
          subText={
            <>
              {occ != null ? `${occ}% occupancy · ` : ""}
              {statement.managementModel} model
            </>
          }
          wireLabel="Status"
          wireWhen={statement.status.charAt(0).toUpperCase() + statement.status.slice(1)}
          wireRef={statement.statementCode}
        />

        {/* How the math worked — desktop table / mobile accordion */}
        <div className="hidden md:block">
          <OwnerStatementMathTable groups={view} netText={netText} metaText={metaText} />
        </div>
        <div className="md:hidden">
          <OwnerStatementMobileBreakdown groups={view} />
        </div>

        {/* YTD / help cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
          <div className="card px-[22px] py-[18px]">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-ink-tertiary mb-2">
              This statement
            </div>
            <div className="text-display text-[18px] text-ink leading-snug">
              Net <strong className="text-accent">{compactMoney(net, currency)}</strong> over{" "}
              {lines.length} reconciled lines · {statement.managementModel} model.
            </div>
          </div>
          <div className="card px-[22px] py-[18px]">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-ink-tertiary mb-2">
              Questions?
            </div>
            <div className="text-sm text-ink-secondary leading-relaxed">
              Use a “why this number?” link above, or{" "}
              <Link href="/owner/support" className="underline">
                open a ticket
              </Link>{" "}
              with the Finance Manager.
            </div>
          </div>
        </div>

        {/* Supplementary owner-value sections (kept below the mockup core) */}
        <StatementExplanationCard
          snapshot={snapshot}
          fallbackHeadline={`Net owner payout for ${statement.periodLabel}`}
          fallbackBullets={[]}
        />
        <StatementSourceBreakdown
          groups={groups.filter((g) => g.ownerVisible)}
          groupLines={groupLines}
          audience="owner"
        />
        {warnings.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-display text-[20px] font-medium text-ink">
              Items needing your attention
            </h2>
            <StatementWarningList warnings={warnings} audience="owner" />
          </section>
        )}
        <StatementLinkedActivity rows={linkedActivity} />
      </div>

      {/* Sticky action bar */}
      <OwnerStatementActionBar
        statementId={statement.id}
        statementCode={statement.statementCode}
        netAmount={Number(net) / 100}
        currency={currency}
        canAcknowledge={canAcknowledge(ownerState)}
        terminalLabel={terminalAckLabel}
        alreadyDisputed={disputeState.alreadyDisputed}
        note={
          awaiting ? (
            <>
              AUTO-ACKNOWLEDGES AFTER <b>{AUTO_ACK_DAYS} DAYS</b> · OR REVIEW NOW
            </>
          ) : undefined
        }
      />
    </div>
  );
}

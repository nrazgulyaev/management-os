import { notFound } from "next/navigation";
import Link from "next/link";
import { getOwnerStatementById, listStatementLines } from "@/features/finance/services";
import { mapPoolAll } from "@/lib/db/map-pool";
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
    await mapPoolAll([
      () => listStatementSourceGroups(id),
      () => listStatementSourceGroupLines(id),
      () => getStatementExplanationSnapshot(id),
      () => listStatementReconciliationWarnings(id),
      () => getStatementReconciliationStatus(id),
      () => listStatementLines(id),
    ] as const, 4);
  const fallbackExplanation = generateStatementExplanation(statement, lines);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/transparency">Transparency</Link> /{" "}
            <Link href="/dashboard/finance/transparency/statements">
              Statements
            </Link>{" "}
            / <span>{statement.statementCode}</span>
          </div>
          <h1>{`${statement.periodLabel} · ${statement.statementCode}`}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${statement.ownerName} · ${statement.managementModel}`}
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <TransparencyStatusBadge status={recon.status} />
            <RebuildStatementButton statementId={id} />
            <Link
              href={`/owner/statements/${id}`}
              className="btn btn-secondary btn-sm"
            >
              Open owner view
            </Link>
          </div>
        </div>
      </div>
      <StatementExplanationCard
        snapshot={snapshot}
        fallbackHeadline={fallbackExplanation.headline}
        fallbackBullets={fallbackExplanation.bullets}
      />
      <div>
        <div className="label mb-2.5">Source groups</div>
        <p className="text-[13px] text-ink-3 mb-3 max-w-[680px]">
          The same breakdown the owner sees on /owner/statements/[id].
        </p>
        <StatementSourceBreakdown
          groups={groups}
          groupLines={groupLines}
          audience="internal"
        />
      </div>
      <AdminSourceTraceCard groupLines={groupLines} />
      <div>
        <div className="label mb-2.5">Warnings</div>
        <p className="text-[13px] text-ink-3 mb-3 max-w-[680px]">
          {`${allWarnings.length} total · ${recon.open} open`} · All warnings
          (open / acknowledged / resolved / dismissed).
        </p>
        <StatementWarningList warnings={allWarnings} audience="internal" />
      </div>
    </div>
  );
}

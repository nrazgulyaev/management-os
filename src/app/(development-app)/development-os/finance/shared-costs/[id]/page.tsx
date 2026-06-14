import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getSharedCostAllocation } from "@/lib/development/server/shared-costs/shared-cost-actions";
import { SharedCostApproveButton } from "@/components/development/finance/shared-cost-approve-button";
import { SharedCostReverseButton } from "@/components/development/finance/shared-cost-reverse-button";

export const metadata: Metadata = {
  title: "Shared cost allocation · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  draft: "info",
  approved: "ok",
  applied: "ok",
  reversed: "warn",
  superseded: "soft",
};

export default async function SharedCostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Shared cost</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getSharedCostAllocation(id);
  if (!data) notFound();
  const { allocation, lines } = data;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance/shared-costs">Shared costs</Link>{" "}
            / <span>{allocation.id.slice(0, 8)}</span>
          </div>
          <h1>Shared cost allocation</h1>
          <div className="label mt-1.5">
            {allocation.allocationMethod} · {allocation.status}
          </div>
          {allocation.notes && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {allocation.notes}
            </p>
          )}
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/shared-costs">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All allocations
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Header</div>
        <Card padding="default">
          <HandoffBadge tone={STATUS_TONE[allocation.status] ?? "soft"}>
            {allocation.status}
          </HandoffBadge>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Source</div>
        <Card padding="default">
          <p className="font-mono text-xs">{allocation.sourceTransactionId}</p>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Splits</div>
        <Table>
          <THead>
            <TR>
              <TH>Project</TH>
              <TH>%</TH>
              <TH>Amount</TH>
              <TH>Currency</TH>
              <TH>Derivative txn</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => (
              <TR key={l.id}>
                <TD className="font-mono text-xs">{l.projectId.slice(0, 8)}</TD>
                <TDNum>{Number(l.percentage).toFixed(2)}%</TDNum>
                <TDNum>{(Number(l.amountMinor) / 100).toLocaleString()}</TDNum>
                <TD className="text-xs">{l.currency}</TD>
                <TD className="font-mono text-xs">
                  {l.derivativeTransactionId
                    ? l.derivativeTransactionId.slice(0, 8)
                    : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="text-[11px] text-ink-tertiary mt-2">
          Sum check: {lines.reduce((s, l) => s + Number(l.percentage), 0).toFixed(2)}% (DB trigger
          enforces exactly 100% at COMMIT time).
        </p>
      </div>

      {allocation.allocationBasis != null && (
        <div>
          <div className="label mb-2.5">Audit</div>
          <pre className="rounded-md border border-line-soft bg-muted/30 p-3 text-xs overflow-auto whitespace-pre-wrap">
            {JSON.stringify(allocation.allocationBasis, null, 2)}
          </pre>
        </div>
      )}

      {allocation.status === "draft" && (
        <div>
          <div className="label mb-2.5">HITL</div>
          <Card padding="default">
            <SharedCostApproveButton allocationId={allocation.id} />
            <p className="text-[11px] text-ink-tertiary mt-2">
              Approve creates derivative dev_transactions on each project&apos;s
              books atomically. The source transaction stays as the canonical
              cash record.
            </p>
          </Card>
        </div>
      )}

      {allocation.status === "applied" && (
        <div>
          <div className="label mb-2.5">HITL</div>
          <Card padding="default">
            <SharedCostReverseButton allocationId={allocation.id} />
            <p className="text-[11px] text-ink-tertiary mt-2">
              Marks the allocation reversed and records the reason. Note: the
              derivative transactions are not auto-deleted — adjust the project
              ledgers manually if needed.
            </p>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "info",
  approved: "success",
  applied: "success",
  reversed: "warning",
  superseded: "neutral",
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
        <PageHeader title="Shared cost" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getSharedCostAllocation(id);
  if (!data) notFound();
  const { allocation, lines } = data;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Shared costs", href: "/development-os/finance/shared-costs" },
          { label: allocation.id.slice(0, 8) },
        ]}
        eyebrow={`${allocation.allocationMethod} · ${allocation.status}`}
        title="Shared cost allocation"
        description={allocation.notes ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/shared-costs">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All allocations
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Header" title="Status">
        <Badge tone={STATUS_TONE[allocation.status] ?? "neutral"}>
          {allocation.status}
        </Badge>
      </Section>

      <Section eyebrow="Source" title="Source transaction">
        <p className="font-mono text-xs">
          {allocation.sourceTransactionId}
        </p>
      </Section>

      <Section
        eyebrow="Splits"
        title={`${lines.length} project allocation${lines.length === 1 ? "" : "s"}`}
      >
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
      </Section>

      {allocation.allocationBasis != null && (
        <Section eyebrow="Audit" title="Allocation basis (snapshot)">
          <pre className="rounded-md border border-line-soft bg-muted/30 p-3 text-xs overflow-auto whitespace-pre-wrap">
            {JSON.stringify(allocation.allocationBasis, null, 2)}
          </pre>
        </Section>
      )}

      {allocation.status === "draft" && (
        <Section eyebrow="HITL" title="Approve allocation">
          <SharedCostApproveButton allocationId={allocation.id} />
          <p className="text-[11px] text-ink-tertiary mt-2">
            Approve creates derivative dev_transactions on each project's books
            atomically. The source transaction stays as the canonical cash record.
          </p>
        </Section>
      )}

      {allocation.status === "applied" && (
        <Section eyebrow="HITL" title="Reverse allocation">
          <SharedCostReverseButton allocationId={allocation.id} />
          <p className="text-[11px] text-ink-tertiary mt-2">
            Marks the allocation reversed and records the reason. Note: the
            derivative transactions are not auto-deleted — adjust the project
            ledgers manually if needed.
          </p>
        </Section>
      )}
    </DevelopmentShell>
  );
}

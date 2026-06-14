import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listSharedCostAllocations } from "@/lib/development/server/shared-costs/shared-cost-actions";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { getTransactions } from "@/lib/development/server/transactions";
import { safeQuery } from "@/lib/development/safe-query";
import { ProposeSharedCostForm } from "./_propose-form";

export const metadata: Metadata = { title: "Shared costs · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  draft: "info",
  approved: "ok",
  applied: "ok",
  reversed: "warn",
  superseded: "soft",
};

export default async function SharedCostsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Shared costs</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [allocations, projectRows, txRows] = await Promise.all([
    safeQuery("listSharedCostAllocations", listSharedCostAllocations(), [], 4000),
    safeQuery("projects", getDevelopmentProjects(), []),
    safeQuery("outflow tx", getTransactions({ direction: "outflow" }, { limit: 100 }), []),
  ]);
  const projectOpts = projectRows
    .filter((p) => p.source !== "mock")
    .map((p) => ({ id: p.realProjectId, name: p.name }));
  const sourceOpts = txRows.map((t) => ({
    id: t.id,
    label: `${t.transactionCode} · ${t.description.slice(0, 40)} · ${(Number(t.amountMinor) / 100).toLocaleString()} ${t.currency}`,
  }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Shared costs</span>
          </div>
          <h1>Shared cost allocations</h1>
          <div className="label mt-1.5">
            {allocations.length} allocation{allocations.length === 1 ? "" : "s"}
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Allocate one transaction (office rent, payroll, marketing) across
            multiple projects. DB trigger enforces percentages sum to exactly
            100%. Approval creates derivative dev_transactions atomically.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <ProposeSharedCostForm projects={projectOpts} sources={sourceOpts} />
            <Button asChild variant="secondary">
              <Link href="/development-os/finance">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {allocations.length === 0 ? (
        <EmptyState
          title="No allocations yet"
          description="Use the proposeSharedCostAllocation server action to create one. The allocation math (sum-to-100, rounding remainder folding) is in lib/development/server/shared-costs/allocation-helpers.ts."
        
          action={
            <Link href="/development-os/finance" className="btn btn-secondary btn-sm">View finance hub</Link>
          }
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
          <Table>
            <THead>
              <TR>
                <TH>Source txn</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH>Approved by</TH>
                <TH>Approved at</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {allocations.map((a) => (
                <TR key={a.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/finance/shared-costs/${a.id}`}
                      className="hover:underline"
                    >
                      {a.sourceTransactionId.slice(0, 8)}
                    </Link>
                  </TD>
                  <TD className="text-xs">{a.allocationMethod}</TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[a.status] ?? "soft"}>
                      {a.status}
                    </HandoffBadge>
                  </TD>
                  <TD className="font-mono text-xs">
                    {a.approvedBy ? a.approvedBy.slice(0, 8) : "—"}
                  </TD>
                  <TD className="text-xs">
                    {a.approvedAt
                      ? new Date(a.approvedAt).toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </TD>
                  <TD className="text-xs">
                    {new Date(a.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}

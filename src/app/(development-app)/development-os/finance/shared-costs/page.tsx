import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listSharedCostAllocations } from "@/lib/development/server/shared-costs/shared-cost-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Shared costs · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "info",
  approved: "success",
  applied: "success",
  reversed: "warning",
  superseded: "neutral",
};

export default async function SharedCostsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Shared costs" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const allocations = await safeQuery(
    "listSharedCostAllocations",
    listSharedCostAllocations(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Shared costs" },
        ]}
        eyebrow={`${allocations.length} allocation${allocations.length === 1 ? "" : "s"}`}
        title="Shared cost allocations"
        description="Allocate one transaction (office rent, payroll, marketing) across multiple projects. DB trigger enforces percentages sum to exactly 100%. Approval creates derivative dev_transactions atomically."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Finance
            </Link>
          </Button>
        }
      />

      {allocations.length === 0 ? (
        <EmptyState
          title="No allocations yet"
          description="Use the proposeSharedCostAllocation server action to create one. The allocation math (sum-to-100, rounding remainder folding) is in lib/development/server/shared-costs/allocation-helpers.ts."
        />
      ) : (
        <Section eyebrow="Catalog" title="All allocations">
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
                    <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>
                      {a.status}
                    </Badge>
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
        </Section>
      )}
    </DevelopmentShell>
  );
}

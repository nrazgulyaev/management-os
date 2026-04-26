import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Plus } from "lucide-react";
import { listOwnerStatements } from "@/features/finance/services";
import { StatementStatusPill } from "@/components/finance/period-pill";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Owner statements" };
export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  const rows = await listOwnerStatements();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Statements" }]}
        title="Owner statements"
        description="Generated from the ledger. Drafts are reproducible — generating again replaces lines but preserves the statement code."
        actions={
          <Button asChild>
            <Link href="/dashboard/finance/statements/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Generate statement
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <Table>
        <THead>
          <TR>
            <TH>Statement</TH>
            <TH>Owner</TH>
            <TH>Period</TH>
            <TH>Model</TH>
            <TH>Status</TH>
            <TH className="text-right">Net payout</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={6} className="text-center py-8 text-ink-tertiary">
                No statements yet.
              </TD>
            </TR>
          ) : (
            rows.map((s) => (
              <TR key={s.id}>
                <TD>
                  <Link
                    href={`/dashboard/finance/statements/${s.id}`}
                    className="font-mono text-xs text-ink hover:text-accent"
                  >
                    {s.statementCode}
                  </Link>
                </TD>
                <TD className="text-ink">{s.ownerName}</TD>
                <TD className="text-ink-secondary text-sm">{s.periodLabel}</TD>
                <TD className="text-ink-secondary text-sm">{s.managementModel}</TD>
                <TD>
                  <StatementStatusPill status={s.status} />
                </TD>
                <TDNum>{formatMoneyMinor(s.netPayoutMinor, s.currency)}</TDNum>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}

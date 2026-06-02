import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import {
  listOwnerStatements,
  listStatementPeriods,
} from "@/features/finance/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listOwners } from "@/features/owners/services";
import { StatementStatusPill } from "@/components/finance/period-pill";
import { StatementAddButton } from "@/components/finance/statement-add-button";
import { formatMoneyMinor } from "@/lib/money";
import { ownerStateMgmtLabel } from "@/features/owner-statements/state-machine";

export const metadata = { title: "Owner statements" };
export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  const [rows, owners, villas, projects, periods] = await Promise.all([
    listOwnerStatements(),
    listOwners(),
    listVillas(),
    listProjects(),
    listStatementPeriods(),
  ]);
  const ownerOpts = owners.map((o) => ({ id: o.id, label: o.displayName }));
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const periodOpts = periods.map((p) => ({ id: p.id, label: p.label }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Statements" }]}
        title="Owner statements"
        description="Generated from the ledger. Drafts are reproducible — generating again replaces lines but preserves the statement code."
        actions={
          <StatementAddButton
            owners={ownerOpts}
            villas={villaOpts}
            projects={projectOpts}
            periods={periodOpts}
          />
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
            <TH>Owner state</TH>
            <TH className="text-right">Net payout</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={7} className="text-center py-8 text-ink-tertiary">
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
                <TD className="text-ink-secondary text-sm">
                  {ownerStateMgmtLabel(s.ownerState)}
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

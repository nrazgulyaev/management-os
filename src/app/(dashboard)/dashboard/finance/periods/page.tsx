import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listStatementPeriods } from "@/features/finance/services";
import { PeriodPill } from "@/components/finance/period-pill";
import { PeriodAddButton } from "@/components/finance/period-add-button";

export const metadata = { title: "Statement periods" };
export const dynamic = "force-dynamic";

export default async function PeriodsPage() {
  const periods = await listStatementPeriods();
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> / <span>Periods</span>
          </div>
          <h1>Statement periods</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Open → closing → closed → locked. Closed and locked periods refuse
            new financial mutations at the database layer.
          </p>
        </div>
        <div className="actions">
          <PeriodAddButton />
        </div>
      </div>
      <DbStatusNotice />
      <Table>
        <THead>
          <TR>
            <TH>Label</TH>
            <TH>Range</TH>
            <TH>Status</TH>
            <TH>Closed</TH>
          </TR>
        </THead>
        <TBody>
          {periods.length === 0 ? (
            <TR>
              <TD colSpan={4} className="text-center py-8 text-ink-tertiary">
                No periods yet.
              </TD>
            </TR>
          ) : (
            periods.map((p) => (
              <TR key={p.id}>
                <TD>
                  <Link className="text-ink hover:text-accent" href={`/dashboard/finance/periods/${p.id}`}>
                    {p.label}
                  </Link>
                </TD>
                <TD className="text-sm text-ink-tertiary tabular-nums">
                  {p.periodStart} → {p.periodEnd}
                </TD>
                <TD>
                  <PeriodPill status={p.status} />
                </TD>
                <TD className="text-xs text-ink-tertiary tabular-nums">
                  {p.closedAt ? new Date(p.closedAt).toLocaleDateString("en-GB") : "—"}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}

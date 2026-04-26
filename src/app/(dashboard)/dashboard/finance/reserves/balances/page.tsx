import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { SourceBadge } from "@/components/ui/source-badge";
import { listReserveBalances } from "@/features/finance/reserve-balances";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Reserve balances" };
export const dynamic = "force-dynamic";

export default async function ReserveBalancesPage() {
  const rows = await listReserveBalances();
  const source = rows[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Reserves", href: "/dashboard/finance/reserves" },
          { label: "Balances" },
        ]}
        title="Reserve balances"
        description="Running totals across every (villa / project / owner / reserve type) bucket. Computed from posted reserve movements."
        actions={<SourceBadge source={source} />}
      />
      <DbStatusNotice />
      <Table>
        <THead>
          <TR>
            <TH>Scope</TH>
            <TH>Reserve</TH>
            <TH>Currency</TH>
            <TH className="text-right">Contributions</TH>
            <TH className="text-right">Releases</TH>
            <TH className="text-right">Adjustments</TH>
            <TH className="text-right">Balance</TH>
            <TH>Last movement</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={8} className="text-center py-8 text-ink-tertiary">
                No reserve movements yet.
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={`${r.villaId ?? "_"}:${r.projectId ?? "_"}:${r.ownerId ?? "_"}:${r.reserveType}`}>
                <TD className="text-sm text-ink-secondary">
                  {r.villaId ? `Villa · ${r.villaId.slice(0, 8)}…` : null}
                  {!r.villaId && r.projectId
                    ? `Project · ${r.projectId.slice(0, 8)}…`
                    : null}
                  {r.ownerId ? ` · Owner · ${r.ownerId.slice(0, 8)}…` : null}
                  {!r.villaId && !r.projectId && !r.ownerId ? "Unscoped" : null}
                </TD>
                <TD>
                  <Badge tone="outline">{r.reserveType}</Badge>
                </TD>
                <TD className="text-xs text-ink-tertiary font-mono tabular-nums">
                  {r.currency}
                </TD>
                <TDNum>{formatMoneyMinor(r.contributionsMinor, r.currency)}</TDNum>
                <TDNum>{formatMoneyMinor(r.releasesMinor, r.currency)}</TDNum>
                <TDNum>{formatMoneyMinor(r.adjustmentsMinor, r.currency)}</TDNum>
                <TDNum className="text-accent">
                  {formatMoneyMinor(r.balanceMinor, r.currency)}
                </TDNum>
                <TD className="text-xs text-ink-tertiary tabular-nums">
                  {r.lastMovementDate ?? "—"}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOpenDisputes } from "@/features/finance/dispute-queries";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Owner disputes" };
export const dynamic = "force-dynamic";

/**
 * FC-OWNER-STATEMENTS §4.4 — Director dispute inbox. Statements an owner has
 * formally disputed land here (owner_threads kind='dispute'); each links to the
 * thread where Mgmt can reply and resolve→reissue. Payout is paused while a
 * statement is disputed.
 */
export default async function OwnerDisputesPage() {
  const rows = await listOpenDisputes();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Owner disputes" },
        ]}
        title="Owner disputes"
        description="Statements an owner formally disputed. Open a thread to reply, then resolve & reissue a corrected statement. Payout stays paused until resolved."
      />
      <DbStatusNotice />
      {rows.length === 0 ? (
        <Card padding="default">
          <p className="text-sm text-ink-tertiary italic m-0">
            No open disputes. When an owner disputes a statement it appears here.
          </p>
        </Card>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Statement</TH>
              <TH>Owner</TH>
              <TH>Period</TH>
              <TH>Reason</TH>
              <TH className="text-right">Net</TH>
              <TH>Opened</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((d) => (
              <TR key={d.threadId}>
                <TD>
                  <Link
                    href={`/dashboard/finance/disputes/${d.threadId}`}
                    className="font-mono text-xs text-ink hover:text-accent"
                  >
                    {d.statementCode}
                  </Link>
                </TD>
                <TD className="text-ink">{d.ownerName}</TD>
                <TD className="text-ink-secondary text-sm">{d.periodLabel}</TD>
                <TD className="text-ink-secondary text-sm">{d.reasonLabel}</TD>
                <TDNum>{formatMoneyMinor(d.netPayoutMinor, d.currency)}</TDNum>
                <TD className="text-ink-secondary text-sm">
                  {new Date(d.openedAt).toLocaleDateString("en-GB")}
                </TD>
                <TD>
                  <Badge tone={d.threadStatus === "open" ? "gold" : "neutral"}>
                    {d.threadStatus}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

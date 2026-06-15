import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <span>Owner disputes</span>
          </div>
          <h1>Owner disputes</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Statements an owner formally disputed. Open a thread to reply, then
            resolve & reissue a corrected statement. Payout stays paused until
            resolved.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      {rows.length === 0 ? (
        <Card padding="default">
          <p className="text-sm text-ink-tertiary italic m-0">
            No open disputes. When an owner disputes a statement it appears here.
          </p>
        </Card>
      ) : (
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Statement</th>
                <th scope="col">Owner</th>
                <th scope="col">Period</th>
                <th scope="col">Reason</th>
                <th scope="col" className="num">Net</th>
                <th scope="col">Opened</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.threadId}>
                  <td>
                    <Link
                      href={`/dashboard/finance/disputes/${d.threadId}`}
                      className="font-mono text-xs text-ink hover:text-accent"
                    >
                      {d.statementCode}
                    </Link>
                  </td>
                  <td className="text-ink">{d.ownerName}</td>
                  <td className="text-ink-secondary text-sm">{d.periodLabel}</td>
                  <td className="text-ink-secondary text-sm">{d.reasonLabel}</td>
                  <td className="num">{formatMoneyMinor(d.netPayoutMinor, d.currency)}</td>
                  <td className="text-ink-secondary text-sm">
                    {new Date(d.openedAt).toLocaleDateString("en-GB")}
                  </td>
                  <td>
                    <HandoffBadge tone={d.threadStatus === "open" ? "gold" : "soft"}>
                      {d.threadStatus}
                    </HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

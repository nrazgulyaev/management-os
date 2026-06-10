import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listQuoteLogs } from "@/features/dynamic-pricing/services";

export const metadata = { title: "Quote logs" };
export const dynamic = "force-dynamic";

export default async function QuoteLogsPage() {
  const rows = await listQuoteLogs({ limit: 200 });
  return (
    <>
      <div className="page-header !mb-0 !pb-[18px]">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/pricing">Dynamic pricing</Link> / <span>Logs</span>
          </div>
          <h1>Quote logs</h1>
          <p className="text-[13.5px] text-ink-3 mt-2 max-w-[720px]">
            Public + admin quote events. IP / user-agent are stored hashed only.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/pricing/quote" className="btn btn-secondary btn-sm">
            Quote tester
          </Link>
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-[18px] mb-2.5">
        <span className="label text-[9.5px]">History</span>
        <span className="font-mono text-[11px] text-ink-4">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
        </span>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Channel</th>
                <th>Range</th>
                <th>Available</th>
                <th>Reason</th>
                <th className="num">Total</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-ink-3 py-6">
                    No quote logs yet.
                  </td>
                </tr>
              )}
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono text-[11px]">{l.createdAt.toISOString()}</td>
                  <td className="text-[12.5px]">{l.channelKey}</td>
                  <td className="font-mono text-[11px]">
                    {l.checkIn} → {l.checkOut} · {l.nights}n
                  </td>
                  <td>
                    <HandoffBadge tone={l.available ? "ok" : "warn"}>
                      {l.available ? "yes" : "no"}
                    </HandoffBadge>
                  </td>
                  <td className="text-[12.5px]">{l.reason ?? "—"}</td>
                  <td className="num font-mono text-[11px]">
                    {(l.totalMinor / 100n).toString()}.
                    {String(l.totalMinor % 100n).padStart(2, "0")} {l.currency}
                  </td>
                  <td className="text-[12.5px]">{l.publicQuote ? "public" : "admin"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

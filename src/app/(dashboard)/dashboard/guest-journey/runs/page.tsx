import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { listGuestJourneyRuns } from "@/features/guest-journey/services";

export const metadata = { title: "Journey runs" };
export const dynamic = "force-dynamic";

export default async function JourneyRunsPage() {
  const runs = await listGuestJourneyRuns({ limit: 200 });
  const executedCount = runs.filter(({ run }) => run.status === "executed").length;
  const failedCount = runs.filter(({ run }) => run.status === "failed").length;
  const skippedCount = runs.filter(({ run }) => run.status === "skipped").length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-journey">Guest journey</Link> /{" "}
            <span>Runs</span>
          </div>
          <h1>Journey run log</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Each row is one (booking, rule) pair. Idempotent — re-runs are
            no-ops on the unique index.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Runs · in view" value={String(runs.length)} />
        <Kpi
          label="Executed"
          value={String(executedCount)}
          tone={executedCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Skipped"
          value={String(skippedCount)}
          tone={skippedCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Failed"
          value={String(failedCount)}
          tone={failedCount > 0 ? "danger" : undefined}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Booking</th>
              <th scope="col">Rule</th>
              <th scope="col">Scheduled for</th>
              <th scope="col">Executed</th>
              <th scope="col">Status</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <TableEmpty colSpan={6}>
                No runs yet — generate suggestions for a booking or run the
                cron.
              </TableEmpty>
            ) : (
              runs.map(({ run, rule, bookingCode }) => (
                <tr key={run.id}>
                  <td className="mono text-[11px] text-ink-3">
                    {bookingCode ?? run.bookingId?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="text-[12px]">
                    {rule?.name ?? "—"}
                    {rule?.ruleKey && (
                      <div className="mono text-[10px] text-ink-4">
                        {rule.ruleKey}
                      </div>
                    )}
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {run.scheduledFor?.toISOString() ?? "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {run.executedAt?.toISOString() ?? "—"}
                  </td>
                  <td>
                    <Badge
                      tone={
                        run.status === "executed"
                          ? "success"
                          : run.status === "failed"
                            ? "danger"
                            : run.status === "skipped"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {run.status}
                    </Badge>
                  </td>
                  <td className="text-[12px] text-ink-4">
                    {run.skipReason ?? run.errorMessage ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

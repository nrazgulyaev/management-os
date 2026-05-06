import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listGuestJourneyRuns } from "@/features/guest-journey/services";

export const metadata = { title: "Journey runs" };
export const dynamic = "force-dynamic";

export default async function JourneyRunsPage() {
  const runs = await listGuestJourneyRuns({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest journey", href: "/dashboard/guest-journey" },
          { label: "Runs" },
        ]}
        title="Journey run log"
        description="Each row is one (booking, rule) pair. Idempotent — re-runs are no-ops on the unique index."
      />
      <Section eyebrow="History" title={`${runs.length} runs`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Scheduled for</th>
                <th className="px-4 py-3">Executed</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-ink-tertiary"
                  >
                    No runs yet — generate suggestions for a booking or run the
                    cron.
                  </td>
                </tr>
              )}
              {runs.map(({ run, rule, bookingCode }) => (
                <tr key={run.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    {bookingCode ?? run.bookingId?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {rule?.name ?? "—"}
                    {rule?.ruleKey && (
                      <div className="text-[10px] font-mono text-ink-tertiary">
                        {rule.ruleKey}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {run.scheduledFor?.toISOString() ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {run.executedAt?.toISOString() ?? "—"}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-xs text-ink-tertiary">
                    {run.skipReason ?? run.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  getJourneyHubStats,
  listGuestJourneyRules,
} from "@/features/guest-journey/services";
import {
  RunDueJourneyButton,
  RunReviewRequestsButton,
} from "@/components/guest-journey/journey-buttons";

export const metadata = { title: "Guest journey" };
export const dynamic = "force-dynamic";

const STAGE_TONE: Record<string, "info" | "gold" | "success" | "neutral"> = {
  pre_arrival: "info",
  arrival_day: "info",
  in_stay: "gold",
  pre_checkout: "neutral",
  checkout_day: "neutral",
  post_stay: "success",
};

export default async function GuestJourneyHub() {
  const [stats, rules] = await Promise.all([
    getJourneyHubStats(),
    listGuestJourneyRules({ limit: 50 }),
  ]);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Guest journey</span>
          </div>
          <h1>Guest journey automation</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            From booking to review, on rails. Trigger-based rules fire across
            pre-arrival → in-stay → checkout → post-stay. Each rule auditable,
            each run replayable.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/guest-journey/runs" className="btn btn-secondary btn-sm">
            Run log →
          </Link>
          <Link href="/dashboard/guest-journey/rules" className="btn btn-accent btn-sm">
            Rules →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Active rules" value={String(stats.activeRules)} sub={`${stats.pausedRules} paused`} />
        <Kpi
          label="Pending runs"
          value={String(stats.pendingRuns)}
          sub="scheduled"
          tone={stats.pendingRuns > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Failed runs"
          value={String(stats.failedRuns)}
          sub={stats.failedRuns > 0 ? "need attention" : "all clean"}
          tone={stats.failedRuns > 0 ? "accent" : undefined}
        />
        <Kpi label="Suggestions" value={String(stats.activeSuggestions)} sub="guest CTAs" tone="gold" />
        <Kpi
          label="Review requests"
          value={String(stats.pendingReviewRequests)}
          sub="pending"
        />
      </div>

      {/* Operate */}
      <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center gap-3 flex-wrap text-xs mt-[18px]">
        <span className="text-ink-tertiary">
          Run ad-hoc (both also wired to cron)
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <RunDueJourneyButton />
          <RunReviewRequestsButton />
        </div>
      </div>

      {/* Rules */}
      <h2 className="display text-[22px] font-normal mt-6 mb-3.5">Rule library</h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Stage</th>
              <th>Trigger</th>
              <th>Channel</th>
              <th>Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-3 italic py-8">
                  No journey rules yet.
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <Badge tone={STAGE_TONE[r.journeyStage] ?? "neutral"}>
                      {r.journeyStage.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {r.triggerAnchor}
                    {r.offsetMinutes ? ` ${r.offsetMinutes > 0 ? "+" : ""}${r.offsetMinutes}m` : ""}
                  </td>
                  <td className="text-[12px] text-ink-3">{r.channel}</td>
                  <td className="text-[12px] text-ink-3">{r.priority}</td>
                  <td>
                    <Badge tone={r.status === "active" ? "success" : "neutral"}>
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
        {[
          { href: "/dashboard/guest-journey/rules", title: "Rules", detail: "Configure / pause / archive" },
          { href: "/dashboard/guest-journey/runs", title: "Run log", detail: "Per-(booking, rule) history" },
          { href: "/dashboard/guest-journey/suggestions", title: "Suggestions", detail: "Materialised guest CTAs" },
          { href: "/dashboard/guest-journey/reviews", title: "Review requests", detail: "Post-stay by channel" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 block hover:border-line-strong transition-colors"
          >
            <div className="text-ink font-medium text-[14px]">{c.title}</div>
            <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
          </Link>
        ))}
      </div>

      <p className="text-[11px] text-ink-4 mt-4 max-w-[720px]">
        Privacy contract: owners <Badge tone="neutral">never</Badge> read raw
        guest_journey_* tables. Owner-visible events are rebuilt nightly from
        owner-safe projections (masked guest names, no email / phone / lock codes).
      </p>
    </>
  );
}

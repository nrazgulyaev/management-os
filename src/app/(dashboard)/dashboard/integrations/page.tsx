import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { FeedStatusPill } from "@/components/integrations/feed-status-pill";
import { SyncAllButton } from "@/components/integrations/sync-all-button";
import { LastRunBadge } from "@/components/jobs/last-run-badge";
import {
  listBookingConflicts,
  listCalendarFeeds,
} from "@/features/integrations/calendar-sync/services";
import { listBookingAutomationRules } from "@/features/booking-automation/services";
import { getLastRunByJobKey } from "@/features/jobs/services";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

function fmtRel(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function IntegrationsHomePage() {
  const [feedsR, conflictsR, rulesR] = await Promise.all([
    safeList("integrations.feeds", () => listCalendarFeeds()),
    safeList("integrations.conflicts", () => listBookingConflicts({ status: "open" })),
    safeList("integrations.rules", () => listBookingAutomationRules()),
  ]);
  const feeds = feedsR.value;
  const conflicts = conflictsR.value;
  const rules = rulesR.value;
  const lastSyncRun = await getLastRunByJobKey("calendar_sync_active_feeds").catch(
    () => null,
  );

  const activeFeeds = feeds.filter((f) => f.status === "active").length;
  const errorFeeds = feeds.filter((f) => f.status === "error").length;
  const activeRules = rules.filter((r) => r.status === "active").length;
  const totalEvents = feeds.reduce((s, f) => s + (f.eventCount ?? 0), 0);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Integrations</span>
          </div>
          <h1>Integrations</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Booking-channel iCal feeds, sync runs, conflict detection and
            automation rules — every channel, every villa, one heartbeat.
          </p>
        </div>
        <div className="actions">
          <SyncAllButton />
          <Link
            href="/dashboard/integrations/calendar-feeds"
            className="btn btn-accent btn-sm"
          >
            + Feed →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Active feeds" value={String(activeFeeds)} sub={`${totalEvents} events`} />
        <Kpi
          label="Open conflicts"
          value={String(conflicts.length)}
          sub={conflicts.length > 0 ? "need resolution" : "none"}
          tone={conflicts.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Automation rules"
          value={String(activeRules)}
          sub={`${rules.length} total`}
          tone={activeRules > 0 ? "success" : undefined}
        />
        <Kpi
          label="Feeds with errors"
          value={String(errorFeeds)}
          sub={errorFeeds > 0 ? "check sync" : "all healthy"}
          tone={errorFeeds > 0 ? "accent" : undefined}
        />
      </div>

      <DbStatusNotice />
      <div className="mt-[18px]">
        <LastRunBadge label="Last automatic calendar sync" run={lastSyncRun} />
      </div>

      {/* Calendar feeds */}
      <div className="flex items-end justify-between mt-6 mb-3.5">
        <h2 className="display text-[22px] font-normal">Calendar feeds</h2>
        <Link
          href="/dashboard/integrations/calendar-feeds"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All feeds →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Feed</th>
              <th scope="col">Villa</th>
              <th scope="col">Source</th>
              <th scope="col">Last sync</th>
              <th scope="col" className="num">Events</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {feeds.length === 0 ? (
              <TableEmpty colSpan={6}>No calendar feeds yet. Add one to start importing channel
                  bookings.</TableEmpty>
            ) : (
              feeds.slice(0, 12).map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link
                      href={`/dashboard/integrations/calendar-feeds/${f.id}`}
                      className="hover:text-terra"
                    >
                      {f.feedName}
                    </Link>
                  </td>
                  <td className="mono">{f.villaCode ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">{f.feedType}</td>
                  <td className="mono text-[11px] text-ink-3">{fmtRel(f.lastSyncedAt)}</td>
                  <td className="num">{f.eventCount}</td>
                  <td>
                    <FeedStatusPill status={f.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Conflicts */}
      <div className="flex items-end justify-between mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="conflicts">
          Open conflicts
        </h2>
        <Link
          href="/dashboard/integrations/conflicts"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All conflicts →
        </Link>
      </div>
      {conflicts.length === 0 ? (
        <div className="card p-5 text-[13px] text-ink-3 italic mb-[18px]">
          No open conflicts — overlapping holds vs. direct bookings surface here
          automatically.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-[18px]">
          {conflicts.slice(0, 5).map((c) => (
            <Link
              key={c.id}
              href="/dashboard/integrations/conflicts"
              className="card p-4 block hover:border-line-strong transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="warning">{c.conflictType}</Badge>
                <span className="mono text-[11px] text-ink-3">{c.villaCode ?? "—"}</span>
              </div>
              <div className="text-[13px] text-ink">{c.description}</div>
            </Link>
          ))}
        </div>
      )}

      {/* Automation rules */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="automation">
        Automation rules
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Trigger</th>
              <th scope="col">Creates</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <TableEmpty colSpan={4}>No automation rules configured.</TableEmpty>
            ) : (
              rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.ruleName}</td>
                  <td className="mono text-[11px] text-ink-3">{r.triggerEvent}</td>
                  <td className="text-[12px] text-ink-3">
                    {r.taskCategory} task
                  </td>
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
    </>
  );
}

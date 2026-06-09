import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Card, Kpi, SectionHeading } from "@/components/dashboard/primitives";
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
      <SectionHeading
        eyebrow="Integrations · channel calendar sync"
        title={
          <>
            Feeds &amp; <em>conflicts</em>.
          </>
        }
        subtitle="Booking-channel iCal feeds, sync runs, double-book conflicts, and automation rules — one health surface for every connected channel."
        actions={
          <>
            <SyncAllButton />
            <Link
              href="/dashboard/integrations/calendar-feeds"
              className="btn btn-accent btn-sm"
            >
              + Feed →
            </Link>
          </>
        }
      />

      <div className="dist-kpis">
        <Kpi
          label="Active feeds"
          value={String(activeFeeds)}
          sub={`${totalEvents} events`}
          tone={activeFeeds > 0 ? "success" : undefined}
        />
        <Kpi
          label="Feeds w/ errors"
          value={String(errorFeeds)}
          sub={errorFeeds > 0 ? "check sync" : "all healthy"}
          tone={errorFeeds > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Open conflicts"
          value={String(conflicts.length)}
          sub={conflicts.length > 0 ? "needs resolve" : "none"}
          tone={conflicts.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Automation rules"
          value={String(activeRules)}
          sub={`${rules.length} total`}
        />
      </div>

      <DbStatusNotice />
      <div className="mt-[18px]">
        <LastRunBadge label="Last automatic calendar sync" run={lastSyncRun} />
      </div>

      <div className="dist-2col mt-[18px]">
        {/* Calendar feeds */}
        <Card padding="none" overflowHidden>
          <div className="dist-card-h px-5 pt-[18px]">
            <h3>Calendar feeds</h3>
            <span className="meta">{activeFeeds} active</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Feed</th>
                <th scope="col">Villa</th>
                <th scope="col" className="num">Events</th>
                <th scope="col">Last sync</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {feeds.length === 0 ? (
                <TableEmpty colSpan={5}>No calendar feeds yet. Add one to start importing channel
                    bookings.</TableEmpty>
              ) : (
                feeds.slice(0, 12).map((f) => (
                  <tr key={f.id}>
                    <td className="row-title">
                      <Link
                        href={`/dashboard/integrations/calendar-feeds/${f.id}`}
                        className="hover:text-terra"
                      >
                        {f.feedName}
                      </Link>
                    </td>
                    <td className="mono">{f.villaCode ?? "—"}</td>
                    <td className="num">{f.eventCount}</td>
                    <td className="mono text-[11px] text-ink-3">{fmtRel(f.lastSyncedAt)}</td>
                    <td>
                      <FeedStatusPill status={f.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {/* Open conflicts */}
        <Card padding="default">
          <div className="dist-card-h">
            <h3>Open conflicts</h3>
            <span className="meta">{conflicts.length}</span>
          </div>
          {conflicts.length === 0 ? (
            <p className="text-[13px] text-ink-3 mt-0">
              No open conflicts — overlapping holds vs. direct bookings surface
              here automatically.
            </p>
          ) : (
            <>
              <div className="dist-prov-list mb-2.5">
                {conflicts.slice(0, 4).map((c) => (
                  <div
                    key={c.id}
                    className={
                      "dist-prov " +
                      (c.severity === "critical" ? "danger" : "warn")
                    }
                  >
                    <span className="dist-prov-body">
                      <span className="dist-prov-name">
                        {c.conflictType} · {c.villaCode ?? "—"}
                      </span>
                      <span className="dist-prov-sub">{c.description}</span>
                    </span>
                    <Badge tone={c.severity === "critical" ? "danger" : "warning"}>
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/integrations/conflicts"
                className="btn btn-accent w-full justify-center"
              >
                Resolve conflicts
              </Link>
            </>
          )}
        </Card>
      </div>

      {/* Automation rules */}
      <h2
        className="display text-[22px] font-normal mt-8 mb-3.5"
        id="automation"
      >
        Automation rules
      </h2>
      <Card padding="none" overflowHidden>
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
                  <td className="row-title">{r.ruleName}</td>
                  <td className="mono text-[11px] text-ink-3">{r.triggerEvent}</td>
                  <td className="text-[12px] text-ink-3">{r.taskCategory} task</td>
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
      </Card>
    </>
  );
}

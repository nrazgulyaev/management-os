import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { CalendarRange, AlertTriangle } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { FeedStatusPill } from "@/components/integrations/feed-status-pill";
import { SyncAllButton } from "@/components/integrations/sync-all-button";
import {
  listBookingConflicts,
  listCalendarEvents,
  listCalendarFeeds,
} from "@/features/integrations/calendar-sync/services";
import { listBookingAutomationRules } from "@/features/booking-automation/services";
import { getLastRunByJobKey } from "@/features/jobs/services";
import { LastRunBadge } from "@/components/jobs/last-run-badge";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsHomePage() {
  // 8.C.8 — wrap each query in safeList so a single missing relation /
  // RLS denial doesn't 500 the entire hub page. Empty arrays propagate
  // through to the metric cards as zero counts, matching the
  // unauthenticated-mock fallback semantics other hub pages use.
  const [feedsR, eventsR, conflictsR, rulesR] = await Promise.all([
    safeList("integrations.feeds", () => listCalendarFeeds()),
    safeList("integrations.events", () => listCalendarEvents({ limit: 8 })),
    safeList("integrations.conflicts", () =>
      listBookingConflicts({ status: "open" }),
    ),
    safeList("integrations.rules", () => listBookingAutomationRules()),
  ]);
  const feeds = feedsR.value;
  const events = eventsR.value;
  const conflicts = conflictsR.value;
  const rules = rulesR.value;
  const lastSyncRun = await getLastRunByJobKey(
    "calendar_sync_active_feeds",
  ).catch(() => null);

  const activeFeeds = feeds.filter((f) => f.status === "active").length;
  const errorFeeds = feeds.filter((f) => f.status === "error").length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Integrations" }]}
        title="Integrations"
        description="Booking-channel calendar feeds, sync runs, conflicts, and automation rules."
        actions={<SyncAllButton />}
      />
      <DbStatusNotice />

      <LastRunBadge label="Last automatic calendar sync" run={lastSyncRun} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active feeds" value={String(activeFeeds)} />
        <MetricCard
          label="Feeds with errors"
          value={String(errorFeeds)}
          accent={errorFeeds > 0}
        />
        <MetricCard
          label="Open conflicts"
          value={String(conflicts.length)}
          accent={conflicts.length > 0}
        />
        <MetricCard label="Automation rules" value={String(rules.length)} />
      </div>

      <Section
        eyebrow="Calendar feeds"
        title="Feeds"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/integrations/calendar-feeds">All feeds</Link>
          </Button>
        }
      >
        {feeds.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary flex items-center gap-2">
            <CalendarRange className="w-4 h-4" strokeWidth={1.75} />
            No calendar feeds yet. Add one to start importing channel bookings.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {feeds.slice(0, 8).map((f) => (
                <li key={f.id} className="p-4 flex items-center justify-between gap-3">
                  <Link
                    href={`/dashboard/integrations/calendar-feeds/${f.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-ink font-medium">{f.feedName}</span>
                      <FeedStatusPill status={f.status} />
                      {f.villaCode && (
                        <span className="text-[11px] text-ink-tertiary font-mono">
                          {f.villaCode}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-tertiary mt-0.5">
                      {f.eventCount} events ·{" "}
                      {f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleString() : "never synced"}
                      {f.lastError ? ` · last error: ${f.lastError}` : ""}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        eyebrow="Conflicts"
        title="Open conflicts"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/integrations/conflicts">All conflicts</Link>
          </Button>
        }
      >
        {conflicts.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
            No open conflicts.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {conflicts.slice(0, 5).map((c) => (
                <li key={c.id} className="p-4">
                  <div className="text-sm text-ink">{c.description}</div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {c.villaCode ?? "—"} · {c.conflictType}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section eyebrow="Recent calendar events" title="Latest imports">
        {events.length === 0 ? (
          <p className="text-sm text-ink-tertiary">
            No events yet. Sync a feed to populate events.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft text-sm">
              {events.slice(0, 8).map((e) => (
                <li key={e.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-ink truncate">{e.externalSummary ?? e.externalUid}</div>
                    <div className="text-[11px] text-ink-tertiary mt-0.5">
                      {e.checkIn} → {e.checkOut} · {e.feedName ?? "—"}
                    </div>
                  </div>
                  <span className="text-[11px] text-ink-tertiary">
                    {e.bookingCode ?? "unbooked"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

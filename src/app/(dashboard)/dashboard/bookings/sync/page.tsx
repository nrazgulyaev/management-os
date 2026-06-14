import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { FeedStatusPill } from "@/components/integrations/feed-status-pill";
import { SyncAllButton } from "@/components/integrations/sync-all-button";
import { CalendarFeedAddButton } from "@/components/integrations/feed-add-button";
import { listCalendarFeeds } from "@/features/integrations/calendar-sync/services";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";

export const metadata = { title: "Bookings · Sync" };
export const dynamic = "force-dynamic";

export default async function BookingsSyncPage() {
  const [feeds, villas, channels] = await Promise.all([
    listCalendarFeeds(),
    listVillas(),
    listBookingChannels(),
  ]);
  const villaOpts = villas.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName ?? ""}`,
  }));
  const channelOpts = channels.map((c) => ({ id: c.id, label: c.name }));
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> /{" "}
            <span>Sync</span>
          </div>
          <h1>Booking-channel sync</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Trigger a manual sync across every active feed. Use feed detail
            pages for per-feed control.
          </p>
        </div>
        <div className="actions">
          <div className="flex gap-2">
            <SyncAllButton />
            <CalendarFeedAddButton
              villas={villaOpts}
              channels={channelOpts}
              cancelHref="/dashboard/bookings/sync"
            />
          </div>
        </div>
      </div>
      <DbStatusNotice />
      <div>
        <div className="label mb-2.5">Feed status</div>
        {feeds.length === 0 ? (
          <Card padding="default">
            <p className="text-[13px] text-ink-3 italic m-0">
              No feeds configured.
            </p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <ul className="divide-y divide-line-soft">
              {feeds.map((f) => (
                <li key={f.id} className="p-4 flex items-center justify-between gap-3">
                  <Link href={`/dashboard/integrations/calendar-feeds/${f.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-ink font-medium">{f.feedName}</span>
                      <FeedStatusPill status={f.status} />
                    </div>
                    <div className="text-[11px] text-ink-tertiary mt-0.5">
                      {f.villaCode ?? "—"} · {f.eventCount} events ·{" "}
                      {f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleString() : "never synced"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

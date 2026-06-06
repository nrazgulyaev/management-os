import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { FeedStatusPill } from "@/components/integrations/feed-status-pill";
import { SyncAllButton } from "@/components/integrations/sync-all-button";
import { CalendarFeedAddButton } from "@/components/integrations/feed-add-button";
import { listCalendarFeeds } from "@/features/integrations/calendar-sync/services";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";
import { SettingsRowActions } from "@/components/dashboard/settings/settings-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Calendar feeds" };
export const dynamic = "force-dynamic";

export default async function CalendarFeedsPage() {
  const [feeds, villas, channels] = await Promise.all([
    listCalendarFeeds(),
    listVillas(),
    listBookingChannels(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName ?? ""}` }));
  const channelOpts = channels.map((c) => ({ id: c.id, label: c.name }));
  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/integrations">Integrations</Link> / <span>Calendar feeds</span>
          </div>
          <h1>Calendar feeds</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[700px]">
            iCal/ICS feeds from Airbnb, Booking.com, Vrbo, and any external calendar —
            each maps a villa to a booking channel.
          </p>
        </div>
        <div className="actions">
          <SyncAllButton />
          <CalendarFeedAddButton
            villas={villaOpts}
            channels={channelOpts}
            cancelHref="/dashboard/integrations/calendar-feeds"
          />
        </div>
      </div>

      <div className="flex flex-col gap-6 mt-[18px]">
        <DbStatusNotice />
      {feeds.length === 0 ? (
        <NoItemsYet
          entityLabel="calendar feeds"
          description="Add an iCal/ICS feed from Airbnb, Booking.com, Vrbo, or any external calendar to sync bookings into the platform."
          addHref="/dashboard/integrations/calendar-feeds/new"
          addLabel="Add feed"
        />
      ) : (
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {feeds.map((f) => (
              <li key={f.id} className="p-4 flex items-start justify-between gap-3">
                <Link
                  href={`/dashboard/integrations/calendar-feeds/${f.id}`}
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-ink font-medium">{f.feedName}</span>
                    <FeedStatusPill status={f.status} />
                    {f.channelName && <span className="text-[11px] text-ink-tertiary">{f.channelName}</span>}
                  </div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {f.villaCode ?? "—"}
                    {f.projectName ? ` · ${f.projectName}` : ""} · {f.eventCount} events ·{" "}
                    {f.lastSyncedAt ? `last sync ${new Date(f.lastSyncedAt).toLocaleString()}` : "never synced"}
                  </div>
                  {f.lastError && (
                    <div className="text-[11px] text-danger mt-1">last error: {f.lastError}</div>
                  )}
                </Link>
                <SettingsRowActions
                  kind="calendar_feed"
                  row={{
                    id: f.id,
                    displayName: f.feedName,
                    detailHref: `/dashboard/integrations/calendar-feeds/${f.id}`,
                    values: {
                      villaId: f.villaId,
                      projectId: f.projectId ?? "",
                      bookingChannelId: f.bookingChannelId ?? "",
                      feedName: f.feedName,
                      feedUrl: f.feedUrl,
                      feedType: f.feedType,
                      syncIntervalMinutes: f.syncIntervalMinutes,
                    },
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </>
  );
}

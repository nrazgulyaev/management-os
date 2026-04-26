import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { FeedStatusPill } from "@/components/integrations/feed-status-pill";
import { SyncAllButton } from "@/components/integrations/sync-all-button";
import { listCalendarFeeds } from "@/features/integrations/calendar-sync/services";

export const metadata = { title: "Calendar feeds" };
export const dynamic = "force-dynamic";

export default async function CalendarFeedsPage() {
  const feeds = await listCalendarFeeds();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Integrations", href: "/dashboard/integrations" },
          { label: "Calendar feeds" },
        ]}
        title="Calendar feeds"
        description="iCal/ICS feeds from Airbnb, Booking.com, Vrbo, and any external calendar."
        actions={
          <div className="flex items-center gap-2">
            <SyncAllButton />
            <Button asChild>
              <Link href="/dashboard/integrations/calendar-feeds/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Add feed
              </Link>
            </Button>
          </div>
        }
      />
      <DbStatusNotice />
      {feeds.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No feeds yet — add one to start syncing channel bookings.
        </p>
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

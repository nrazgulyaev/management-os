import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { FeedStatusPill } from "@/components/integrations/feed-status-pill";
import { SyncAllButton } from "@/components/integrations/sync-all-button";
import { listCalendarFeeds } from "@/features/integrations/calendar-sync/services";

export const metadata = { title: "Bookings · Sync" };
export const dynamic = "force-dynamic";

export default async function BookingsSyncPage() {
  const feeds = await listCalendarFeeds();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Sync" },
        ]}
        title="Booking-channel sync"
        description="Trigger a manual sync across every active feed. Use feed detail pages for per-feed control."
        actions={
          <div className="flex gap-2">
            <SyncAllButton />
            <Button asChild variant="secondary">
              <Link href="/dashboard/integrations/calendar-feeds/new">Add feed</Link>
            </Button>
          </div>
        }
      />
      <DbStatusNotice />
      <Section eyebrow="Feed status" title="Active feeds">
        {feeds.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No feeds configured.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
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
          </div>
        )}
      </Section>
    </div>
  );
}

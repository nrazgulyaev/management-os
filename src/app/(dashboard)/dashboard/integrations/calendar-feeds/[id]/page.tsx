import Link from "next/link";
import { notFound } from "next/navigation";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FeedStatusPill, CalendarConflictPill } from "@/components/integrations/feed-status-pill";
import { FeedActions } from "@/components/integrations/feed-actions";
import { EventActions } from "@/components/integrations/event-actions";
import {
  getCalendarFeedById,
  listCalendarEvents,
} from "@/features/integrations/calendar-sync/services";

export const metadata = { title: "Calendar feed" };
export const dynamic = "force-dynamic";

export default async function CalendarFeedDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const feed = await getCalendarFeedById(id);
  if (!feed) notFound();
  const events = await listCalendarEvents({ feedId: id, limit: 200 });

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/integrations">Integrations</Link> /{" "}
            <Link href="/dashboard/integrations/calendar-feeds">
              Calendar feeds
            </Link>{" "}
            / <span>{feed.feedName}</span>
          </div>
          <h1>{feed.feedName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {feed.feedType.replace(/_/g, " ")}
          </p>
        </div>
        <div className="actions">
          <FeedActions id={feed.id} status={feed.status} />
        </div>
      </div>
      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Status" value={<FeedStatusPill status={feed.status} />} />
        <Kpi label="Villa" value={feed.villaCode ?? "—"} />
        <Kpi label="Project" value={feed.projectName ?? "—"} />
        <Kpi label="Channel" value={feed.channelName ?? "—"} />
        <Kpi label="Events" value={String(feed.eventCount)} />
        <Kpi
          label="Sync interval"
          value={`${feed.syncIntervalMinutes} min`}
        />
        <Kpi
          label="Last sync"
          value={feed.lastSyncedAt ? new Date(feed.lastSyncedAt).toLocaleString() : "—"}
        />
        <Kpi
          label="Last success"
          value={feed.lastSuccessAt ? new Date(feed.lastSuccessAt).toLocaleString() : "—"}
        />
      </div>

      {feed.lastError && (
        <div>
          <div className="label mb-2.5">Error</div>
          <Card padding="default">
            <div className="text-sm text-ink whitespace-pre-line">
              {feed.lastError}
            </div>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Feed URL</div>
        <Card padding="default">
          <div className="font-mono text-[11px] text-ink-secondary break-all">
            {feed.feedUrl}
          </div>
          <p className="text-[11px] text-ink-tertiary mt-2">
            Feed URLs may carry vendor secrets — visible only to internal staff.
          </p>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Imported events</div>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No events yet. Click &quot;Sync now&quot; to fetch.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Summary</TH>
                <TH>Check-in → check-out</TH>
                <TH>Status</TH>
                <TH>Conflict</TH>
                <TH>Booking</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {events.map((e) => (
                <TR key={e.id}>
                  <TD className="text-sm">
                    <div className="text-ink truncate max-w-[260px]">
                      {e.externalSummary ?? <span className="text-ink-tertiary">—</span>}
                    </div>
                    <div className="text-[10px] text-ink-tertiary font-mono truncate max-w-[260px]">
                      {e.externalUid}
                    </div>
                  </TD>
                  <TD className="font-mono tabular-nums text-xs">
                    {e.checkIn} → {e.checkOut}
                  </TD>
                  <TD>
                    <HandoffBadge tone={e.status === "active" ? "info" : "soft"}>
                      {e.status}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    <CalendarConflictPill status={e.conflictStatus} />
                  </TD>
                  <TD className="text-xs">
                    {e.bookingCode ? (
                      <span className="font-mono">{e.bookingCode}</span>
                    ) : (
                      <span className="text-ink-tertiary">unbooked</span>
                    )}
                  </TD>
                  <TD>
                    <EventActions id={e.id} hasBooking={Boolean(e.bookingId)} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

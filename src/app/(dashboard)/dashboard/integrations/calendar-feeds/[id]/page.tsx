import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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
      <PageHeader
        breadcrumbs={[
          { label: "Integrations", href: "/dashboard/integrations" },
          { label: "Calendar feeds", href: "/dashboard/integrations/calendar-feeds" },
          { label: feed.feedName },
        ]}
        title={feed.feedName}
        description={feed.feedType.replace(/_/g, " ")}
        actions={<FeedActions id={feed.id} status={feed.status} />}
      />
      <DbStatusNotice />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Status" value={<FeedStatusPill status={feed.status} />} />
        <Stat label="Villa" value={feed.villaCode ?? "—"} />
        <Stat label="Project" value={feed.projectName ?? "—"} />
        <Stat label="Channel" value={feed.channelName ?? "—"} />
        <Stat label="Events" value={String(feed.eventCount)} />
        <Stat
          label="Sync interval"
          value={`${feed.syncIntervalMinutes} min`}
        />
        <Stat
          label="Last sync"
          value={feed.lastSyncedAt ? new Date(feed.lastSyncedAt).toLocaleString() : "—"}
        />
        <Stat
          label="Last success"
          value={feed.lastSuccessAt ? new Date(feed.lastSuccessAt).toLocaleString() : "—"}
        />
      </div>

      {feed.lastError && (
        <Section eyebrow="Error" title="Most recent sync error">
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-3 text-sm text-ink whitespace-pre-line">
            {feed.lastError}
          </div>
        </Section>
      )}

      <Section eyebrow="Feed URL" title="Where data is fetched from">
        <div className="rounded-md border border-line-soft bg-muted/30 p-3 font-mono text-[11px] text-ink-secondary break-all">
          {feed.feedUrl}
        </div>
        <p className="text-[11px] text-ink-tertiary mt-2">
          Feed URLs may carry vendor secrets — visible only to internal staff.
        </p>
      </Section>

      <Section eyebrow="Imported events" title={`${events.length} event${events.length === 1 ? "" : "s"}`}>
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
                    <Badge tone={e.status === "active" ? "info" : "neutral"}>
                      {e.status}
                    </Badge>
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
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}

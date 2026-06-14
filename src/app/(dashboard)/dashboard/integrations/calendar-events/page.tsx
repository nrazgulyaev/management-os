import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CalendarConflictPill } from "@/components/integrations/feed-status-pill";
import { EventActions } from "@/components/integrations/event-actions";
import { listCalendarEvents } from "@/features/integrations/calendar-sync/services";

export const metadata = { title: "Calendar events" };
export const dynamic = "force-dynamic";

export default async function CalendarEventsPage() {
  const events = await listCalendarEvents({ limit: 200 });
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/integrations">Integrations</Link> /{" "}
            <span>Calendar events</span>
          </div>
          <h1>Calendar events</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Every VEVENT we&apos;ve imported, across every feed.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      {events.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No events yet.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Feed</TH>
              <TH>Summary</TH>
              <TH>Dates</TH>
              <TH>Status</TH>
              <TH>Conflict</TH>
              <TH>Booking</TH>
              <TH>Action</TH>
            </TR>
          </THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id}>
                <TD className="text-xs">{e.feedName ?? "—"}</TD>
                <TD className="text-sm">
                  <div className="text-ink max-w-[280px] truncate">
                    {e.externalSummary ?? <span className="text-ink-tertiary">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-tertiary font-mono truncate max-w-[280px]">
                    {e.externalUid}
                  </div>
                </TD>
                <TD className="font-mono tabular-nums text-xs">
                  {e.checkIn} → {e.checkOut}
                </TD>
                <TD>
                  <HandoffBadge tone={e.status === "active" ? "info" : "soft"}>{e.status}</HandoffBadge>
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
  );
}

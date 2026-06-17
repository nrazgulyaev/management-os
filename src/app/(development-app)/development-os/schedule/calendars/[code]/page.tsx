import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getCalendarByCode,
  listHolidays,
} from "@/lib/development/server/calendar/calendar-queries";
import { CalendarControls } from "./_calendar-controls";

export const metadata: Metadata = { title: "Calendar · Schedule" };
export const dynamic = "force-dynamic";

export default async function CalendarDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cal = await getCalendarByCode(code);
  if (!cal) notFound();
  const holidays = await listHolidays(cal.id);
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Schedule</span> /{" "}
            <Link href="/development-os/schedule/calendars">Calendars</Link> /{" "}
            <span>{cal.calendarCode}</span>
          </div>
          <h1>{cal.name}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`Working days [${(cal.workingDaysOfWeek ?? []).join(",")}] · ${cal.workingHoursPerDay}h/day`}
          </p>
        </div>
        <div className="actions flex flex-wrap items-center gap-2">
          <CalendarControls
            calendar={{
              id: cal.id,
              name: cal.name,
              workingDaysOfWeek: cal.workingDaysOfWeek ?? [],
              workingHoursPerDay: String(cal.workingHoursPerDay),
              description: cal.description,
              isDefault: cal.isDefault,
              notes: cal.notes,
            }}
          />
          <Link
            href="/development-os/schedule/calendars"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Configuration</div>
        <Card padding="default">
          <div className="flex flex-wrap gap-2">
            <HandoffBadge tone="soft">{cal.scope}</HandoffBadge>
            <HandoffBadge tone="soft">
              {cal.regionCode ?? cal.countryCode}
            </HandoffBadge>
            {cal.isDefault && <HandoffBadge tone="ok">default</HandoffBadge>}
          </div>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">{`${holidays.length} holiday(s) / non-working days`}</div>
        {holidays.length === 0 ? (
          <EmptyState title="No holidays" description="Add holidays to track non-working days." />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Recurring</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td className="mono text-xs">{h.holidayDate}</td>
                    <td className="row-title">{h.holidayName}</td>
                    <td className="text-xs">{h.holidayType}</td>
                    <td className="text-xs">
                      {h.isRecurring ? h.recurrencePattern ?? "yes" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}

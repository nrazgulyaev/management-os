import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getCalendarByCode,
  listHolidays,
} from "@/lib/development/server/calendar/calendar-queries";

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
      <PageHeader
        title={cal.name}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule" },
          { label: "Calendars", href: "/development-os/schedule/calendars" },
          { label: cal.calendarCode },
        ]}
        description={`Working days [${(cal.workingDaysOfWeek ?? []).join(",")}] · ${cal.workingHoursPerDay}h/day`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/schedule/calendars">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Configuration">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{cal.scope}</Badge>
          <Badge tone="neutral">
            {cal.regionCode ?? cal.countryCode}
          </Badge>
          {cal.isDefault && <Badge tone="success">default</Badge>}
        </div>
      </Section>
      <Section title={`${holidays.length} holiday(s) / non-working days`}>
        {holidays.length === 0 ? (
          <EmptyState title="No holidays" description="Add holidays to track non-working days." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Date</th>
                <th>Name</th>
                <th>Type</th>
                <th>Recurring</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-b border-line-soft">
                  <td className="py-2 font-mono text-xs">{h.holidayDate}</td>
                  <td>{h.holidayName}</td>
                  <td className="text-xs">{h.holidayType}</td>
                  <td className="text-xs">
                    {h.isRecurring ? h.recurrencePattern ?? "yes" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

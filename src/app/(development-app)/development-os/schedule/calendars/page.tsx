import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listCalendars } from "@/lib/development/server/calendar/calendar-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Working calendars · Schedule" };
export const dynamic = "force-dynamic";

export default async function CalendarsPage() {
  const rows = await safeQuery("calendars", listCalendars(), []);
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Schedule</span> /{" "}
            <span>Calendars</span>
          </div>
          <h1>Working calendars</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Working week + holidays per project / vendor / company. Pre-seeded
            with COMPANY_DEFAULT and BALI_STANDARD.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/schedule/calendars/new"
            className="btn btn-accent btn-sm"
          >
            New calendar
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`${rows.length} calendar(s)`}</div>
        {rows.length === 0 ? (
          <EmptyState title="No calendars" description="Run migrations to seed defaults." />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Working days</th>
                  <th scope="col">Hours/day</th>
                  <th scope="col">Region</th>
                  <th scope="col">Default</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono text-xs">
                      <Link
                        href={`/development-os/schedule/calendars/${c.calendarCode}`}
                        className="hover:underline"
                      >
                        {c.calendarCode}
                      </Link>
                    </td>
                    <td className="row-title">{c.name}</td>
                    <td className="text-xs">{c.scope}</td>
                    <td className="mono text-xs">
                      [{(c.workingDaysOfWeek ?? []).join(",")}]
                    </td>
                    <td className="num mono">{c.workingHoursPerDay}</td>
                    <td className="text-xs">{c.regionCode ?? c.countryCode}</td>
                    <td>
                      {c.isDefault && <HandoffBadge tone="ok">default</HandoffBadge>}
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

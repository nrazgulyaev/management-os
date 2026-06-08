import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listCalendars } from "@/lib/development/server/calendar/calendar-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Working calendars · Schedule" };
export const dynamic = "force-dynamic";

export default async function CalendarsPage() {
  const rows = await safeQuery("calendars", listCalendars(), []);
  return (
    <DevelopmentShell>
      <PageHeader
        title="Working calendars"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule" },
          { label: "Calendars" },
        ]}
        description="Working week + holidays per project / vendor / company. Pre-seeded with COMPANY_DEFAULT and BALI_STANDARD."
        actions={
          <Button asChild>
            <Link href="/development-os/schedule/calendars/new">New calendar</Link>
          </Button>
        }
      />
      <Section title={`${rows.length} calendar(s)`}>
        {rows.length === 0 ? (
          <EmptyState title="No calendars" description="Run migrations to seed defaults." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Name</th>
                <th>Scope</th>
                <th>Working days</th>
                <th>Hours/day</th>
                <th>Region</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2 font-mono text-xs">
                    <Link
                      href={`/development-os/schedule/calendars/${c.calendarCode}`}
                      className="hover:underline"
                    >
                      {c.calendarCode}
                    </Link>
                  </td>
                  <td>{c.name}</td>
                  <td className="text-xs">{c.scope}</td>
                  <td className="font-mono text-xs">
                    [{(c.workingDaysOfWeek ?? []).join(",")}]
                  </td>
                  <td className="font-mono tabular-nums">{c.workingHoursPerDay}</td>
                  <td className="text-xs">{c.regionCode ?? c.countryCode}</td>
                  <td>
                    {c.isDefault && <Badge tone="success">default</Badge>}
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

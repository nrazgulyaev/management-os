import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New calendar · Schedule" };
export const dynamic = "force-dynamic";

export default function NewCalendarPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        title="New calendar"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule" },
          { label: "Calendars", href: "/development-os/schedule/calendars" },
          { label: "New" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/schedule/calendars">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Create calendar">
        <p className="text-sm text-ink-secondary leading-relaxed">
          Use the <code>createCalendar</code> server action. Required:{" "}
          <code>calendarCode</code> (UPPER_SNAKE_CASE), <code>name</code>,{" "}
          <code>scope</code>, <code>workingDaysOfWeek</code> (array of 0-6).
        </p>
      </Section>
    </DevelopmentShell>
  );
}

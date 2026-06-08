import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { getVendors } from "@/lib/development/server/vendors";
import { safeQuery } from "@/lib/development/safe-query";
import { CalendarForm } from "./_calendar-form";

export const metadata: Metadata = { title: "New calendar · Schedule" };
export const dynamic = "force-dynamic";

export default async function NewCalendarPage() {
  const [projectRows, vendorRows] = await Promise.all([
    safeQuery("projects", getDevelopmentProjects(), []),
    safeQuery("vendors", getVendors({ status: "active" }), []),
  ]);
  // Only real DB projects carry a usable FK id; mock rows would FK-fail.
  const projects = projectRows
    .filter((p) => p.source !== "mock")
    .map((p) => ({ id: p.realProjectId, name: p.name }));
  const vendors = vendorRows.map((v) => ({
    id: v.id,
    label: `${v.legalName} · ${v.vendorCode}`,
  }));

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
        <CalendarForm projects={projects} vendors={vendors} />
      </Section>
    </DevelopmentShell>
  );
}

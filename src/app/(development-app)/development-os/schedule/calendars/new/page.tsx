import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Schedule</span> /{" "}
            <Link href="/development-os/schedule/calendars">Calendars</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New calendar</h1>
        </div>
        <div className="actions">
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
        <div className="label mb-2.5">Create calendar</div>
        <Card padding="default">
          <CalendarForm projects={projects} vendors={vendors} />
        </Card>
      </div>
    </DevelopmentShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "Log productivity · Schedule" };
export const dynamic = "force-dynamic";

export default function NewProductivityLogPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        title="Log productivity"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Productivity", href: "/development-os/productivity" },
          { label: "Log entry" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/productivity">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Manual entry">
        <p className="text-sm text-ink-secondary leading-relaxed">
          Use the <code>recordProductivityLog</code> server action. Required:{" "}
          <code>projectId</code>, <code>logDate</code>, <code>actualHours</code>,{" "}
          <code>dataSource</code>, <code>recordedBy</code>.
        </p>
        <p className="text-sm text-ink-secondary leading-relaxed mt-2">
          Productivity rate is computed automatically as a GENERATED column
          (<code>quantity_completed / actual_hours</code>) when both
          <code>quantity_completed</code> and a positive <code>actual_hours</code> are present.
        </p>
      </Section>
    </DevelopmentShell>
  );
}

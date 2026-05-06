import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New lead source · Marketing" };
export const dynamic = "force-dynamic";

export default function NewLeadSourcePage() {
  return (
    <DevelopmentShell>
      <PageHeader
        title="New lead source"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Lead sources", href: "/development-os/marketing/lead-sources" },
          { label: "New" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/lead-sources">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Create form">
        <p className="text-sm text-ink-secondary leading-relaxed">
          The 14 default sources are seeded by migration <code>0063</code>.
          Adding a new custom channel uses the{" "}
          <code>createLeadSource</code> server action — wire from your admin
          form when needed.
        </p>
      </Section>
    </DevelopmentShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { QualityStandardForm } from "@/components/development/quality-standards/quality-standard-form";

export const metadata: Metadata = {
  title: "New quality standard · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewQualityStandardPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Quality standards", href: "/development-os/quality-standards" },
          { label: "New" },
        ]}
        title="New quality standard"
        description="Acceptance-criteria template. Once created, QA inspectors can pin inspections against this standard for traceable rework history."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/quality-standards">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Standards
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Standard details">
        <QualityStandardForm />
      </Section>
    </DevelopmentShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { SpecificationForm } from "@/components/development/specifications/specification-form";

export const metadata: Metadata = {
  title: "New specification · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewSpecificationPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Specifications", href: "/development-os/specifications" },
          { label: "New" },
        ]}
        title="New specification"
        description="Add a material/finish specification to the library. Once approved, BOQ items can reference it for material selection."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/specifications">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Specs
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Specification details">
        <SpecificationForm />
      </Section>
    </DevelopmentShell>
  );
}

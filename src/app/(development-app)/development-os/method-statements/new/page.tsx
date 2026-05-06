import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { MethodStatementForm } from "@/components/development/method-statements/method-statement-form";

export const metadata: Metadata = {
  title: "New method statement · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewMethodStatementPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Method statements", href: "/development-os/method-statements" },
          { label: "New" },
        ]}
        title="New method statement / SOP"
        description="Step-by-step procedure for site staff. Add steps with optional duration estimates. Tools, materials, PPE, hazards can be edited after creation."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/method-statements">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              SOPs
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Procedure details">
        <MethodStatementForm />
      </Section>
    </DevelopmentShell>
  );
}

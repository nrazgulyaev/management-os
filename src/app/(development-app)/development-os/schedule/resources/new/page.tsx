import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New resource pool · Schedule" };
export const dynamic = "force-dynamic";

export default function NewResourcePoolPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        title="New resource pool"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule" },
          { label: "Resources", href: "/development-os/schedule/resources" },
          { label: "New" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/schedule/resources">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Create resource pool">
        <p className="text-sm text-ink-secondary leading-relaxed">
          Use the <code>createResourcePool</code> server action. Required:{" "}
          <code>resourceCode</code>, <code>displayName</code>,{" "}
          <code>resourceType</code>.
        </p>
      </Section>
    </DevelopmentShell>
  );
}

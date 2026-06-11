import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { NewProjectClient } from "./_new-project-client";

export const metadata: Metadata = {
  title: "New project · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * Create-project surface for the Command center "New project +" CTA.
 * Previously the link resolved to /development-os/projects/new which the
 * [slug] route swallowed into a notFound(). A static `new` segment wins
 * over the dynamic `[slug]`, so the CTA now lands here and opens the
 * working <NewProjectDrawer> (backed by `createDevelopmentProject`).
 */
export default function NewProjectPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: "New" },
        ]}
        title="New project"
        description="Stage 2.1 minimal create — seeds the projects row, development meta, and a land-sourcing phase scoped to your organization. The full setup wizard ships in 2.2."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/projects">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Projects
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Project details">
        <NewProjectClient />
      </Section>
    </DevelopmentShell>
  );
}

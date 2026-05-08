import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { BoqForm } from "@/components/development/boq/boq-form";

export const metadata: Metadata = { title: "New BOQ · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewBoqPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New BOQ" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects);

  if (projectRows.length === 0) {
    // 8.A.6 — without at least one project the form's hidden projectId
    // ends up empty and createBoqDocument's Zod schema rejects with a
    // generic 500. Surface a clear empty state with a CTA instead.
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "BOQ", href: "/development-os/boq" },
            { label: "New" },
          ]}
          title="New BOQ document"
        />
        <EmptyState
          title="No projects yet"
          description="Create a project before drafting a BOQ — every BOQ document is scoped to one project."
          action={
            <Button asChild>
              <Link href="/development-os/projects">Create a project</Link>
            </Button>
          }
        />
      </DevelopmentShell>
    );
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "BOQ", href: "/development-os/boq" },
          { label: "New" },
        ]}
        title="New BOQ document"
        description="Create the BOQ shell. Sections + items can be added afterwards via the API or via CSV import."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/boq">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              BOQ
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Document details">
        <BoqForm projects={projectRows} />
      </Section>
    </DevelopmentShell>
  );
}

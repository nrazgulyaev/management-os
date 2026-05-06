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
import { DrawingForm } from "@/components/development/drawings/drawing-form";

export const metadata: Metadata = { title: "New drawing · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewDrawingPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New drawing" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Drawings", href: "/development-os/drawings" },
          { label: "New" },
        ]}
        title="New drawing"
        description="Drawing metadata only. After creation, add revisions to attach files (uploaded via the existing documents pipeline)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/drawings">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Drawings
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Drawing details">
        <DrawingForm projects={projectRows} />
      </Section>
    </DevelopmentShell>
  );
}

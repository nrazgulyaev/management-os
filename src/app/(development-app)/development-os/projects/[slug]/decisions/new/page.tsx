import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { DecisionForm } from "@/components/development/decisions/decision-form";

export const metadata: Metadata = { title: "New decision · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewDecisionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New decision" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Decisions", href: `/development-os/projects/${slug}/decisions` },
          { label: "New" },
        ]}
        title="Log new decision"
        description="Capture the decision, the rationale, and the context. Future-you (and the next PM) will thank you."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/decisions`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Decisions
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Decision details">
        <DecisionForm
          projectId={project.realProjectId}
          projectSlug={slug}
        />
      </Section>
    </DevelopmentShell>
  );
}

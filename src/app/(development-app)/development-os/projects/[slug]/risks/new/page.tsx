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
import { RiskForm } from "@/components/development/risks/risk-form";

export const metadata: Metadata = { title: "New risk · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewRiskPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New risk" />
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
          { label: "Risks", href: `/development-os/projects/${slug}/risks` },
          { label: "New" },
        ]}
        title="Log new risk"
        description="Risk score is auto-computed (P × I, 1-25 scale). Scores ≥ 15 trigger weekly elevation alert."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/risks`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Risks
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Risk details">
        <RiskForm
          projectId={project.realProjectId}
          projectSlug={slug}
        />
      </Section>
    </DevelopmentShell>
  );
}

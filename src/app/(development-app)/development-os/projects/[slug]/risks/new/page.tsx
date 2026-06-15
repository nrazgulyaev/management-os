import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>New risk</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/risks`}>Risks</Link> /{" "}
            <span>New</span>
          </div>
          <h1>Log new risk</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Risk score is auto-computed (P × I, 1-25 scale). Scores ≥ 15 trigger
            weekly elevation alert.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/risks`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Risks
            </Link>
          </Button>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <RiskForm
            projectId={project.realProjectId}
            projectSlug={slug}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}

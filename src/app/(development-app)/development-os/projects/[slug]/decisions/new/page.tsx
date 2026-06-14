import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>New decision</h1>
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
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link>{" "}
            /{" "}
            <Link href={`/development-os/projects/${slug}/decisions`}>
              Decisions
            </Link>{" "}
            / <span>New</span>
          </div>
          <h1>Log new decision</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Capture the decision, the rationale, and the context. Future-you (and
            the next PM) will thank you.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/decisions`}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Decisions
          </Link>
        </div>
      </div>
      <div className="mt-[18px]">
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <DecisionForm
            projectId={project.realProjectId}
            projectSlug={slug}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}

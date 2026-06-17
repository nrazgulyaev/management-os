import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { getProjectDecisionByCode } from "@/lib/development/server/decisions/decision-queries";
import { DecisionForm } from "@/components/development/decisions/decision-form";

export const metadata: Metadata = { title: "New decision · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewDecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ supersedes?: string }>;
}) {
  const { slug } = await params;
  const { supersedes } = await searchParams;
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

  // Optional supersede target — resolve the decision code to its id (org-scoped)
  // so the new decision can replace it atomically. Only active decisions can be
  // superseded; the server re-validates.
  const supersedeTarget = supersedes
    ? await getProjectDecisionByCode(decodeURIComponent(supersedes))
    : null;
  const supersedesId =
    supersedeTarget && supersedeTarget.status === "active"
      ? supersedeTarget.id
      : undefined;

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
          <h1>{supersedesId ? "Supersede decision" : "Log new decision"}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {supersedesId ? (
              <>
                This decision replaces{" "}
                <span className="mono">{decodeURIComponent(supersedes ?? "")}</span>{" "}
                — the old one is marked superseded and linked, atomically.
              </>
            ) : (
              <>
                Capture the decision, the rationale, and the context. Future-you
                (and the next PM) will thank you.
              </>
            )}
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
            supersedesId={supersedesId}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { getPublishedBoqForProject } from "@/lib/development/server/boq/boq-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { BoqWorkspace } from "./_boq-client";
import type { WpNode } from "@/components/boq/wp-tree";
import type { BoqTableLine } from "@/components/boq/boq-table";

/**
 * BOQ table for a project — reads the latest PUBLISHED boq_revision
 * (boq_documents that have left draft) + its lines for the project,
 * org-scoped, joined to the rolled-up posted actuals. Honest empty
 * state when nothing is published yet.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  return { title: detail ? `${detail.project.name} · BOQ` : "BOQ" };
}

export default async function ProjectBoqPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail) notFound();

  const db = getDb();
  const published =
    db && detail.source === "db"
      ? await safeQuery(
          "getPublishedBoqForProject",
          getPublishedBoqForProject(detail.project.realProjectId),
          null,
          4000,
        )
      : null;

  const header = (
    <div className="page-header">
      <div className="left">
        <div className="crumb">
          <Link href="/development-os">Development OS</Link> /{" "}
          <Link href="/development-os/projects">Projects</Link> /{" "}
          <Link href={`/development-os/projects/${slug}`}>
            {detail.project.name}
          </Link>{" "}
          / <span>BOQ</span>
        </div>
        <h1>Bill of quantities</h1>
        <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
          Virtualized table of the published revision. Click a section on the
          left to filter; click a row for line detail + actuals history.
        </p>
      </div>
      <div className="actions">
        {published && (
          <HandoffBadge tone="ok">
            {published.document.boqCode} · {published.document.versionLabel}
          </HandoffBadge>
        )}
        <Link
          href={`/development-os/projects/${slug}`}
          className="btn btn-secondary"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back to project
        </Link>
      </div>
    </div>
  );

  if (!published) {
    return (
      <DevelopmentShell>
        {header}
        <EmptyState
          title="No published BOQ revision"
          description="Once the QS approves (or tenders/awards) a BOQ document for this project, its lines appear here. Draft documents are not shown."
        />
      </DevelopmentShell>
    );
  }

  const nodes: WpNode[] = published.sections.map((s) => ({
    code: s.code,
    label: s.name,
    lineCount: s.lineCount,
    depth: 0,
  }));

  const lines: BoqTableLine[] = published.lines.map((l) => ({
    id: l.id,
    code: l.code,
    description: l.description,
    wpCode: l.sectionCode,
    unit: l.unit,
    qtyPlanned: l.qtyPlanned,
    ratePlanned: l.ratePlanned,
    qtyActual: l.qtyActual,
    rateActual: l.rateActual,
    href: `/development-os/projects/${slug}/boq/${l.id}`,
  }));

  return (
    <DevelopmentShell>
      {header}
      {lines.length === 0 ? (
        <EmptyState
          title="Published revision has no lines"
          description="This BOQ document is published but contains no priced items yet."
        />
      ) : (
        <BoqWorkspace nodes={nodes} lines={lines} />
      )}
    </DevelopmentShell>
  );
}

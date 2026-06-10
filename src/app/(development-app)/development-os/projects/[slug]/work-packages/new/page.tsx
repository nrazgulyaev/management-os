import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listWorkPackages } from "@/lib/development/server/work-packages/work-package-queries";
import { villas } from "@/lib/db/schema/projects";
import { devCostCategories } from "@/lib/db/schema/dev-finance";
import { WorkPackageForm } from "@/components/development/work-packages/work-package-form";

export const metadata: Metadata = {
  title: "Cut a work zone · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * Auto-suggest the next zone code for this project: take the existing code
 * with the highest trailing number, increment, keep prefix + zero-padding
 * ("WP-04" → "WP-05", "WP-ETV-001" → "WP-ETV-002"). First zone of a project
 * gets "WP-01". The field stays editable — package_code is globally unique,
 * so a collision with another project's code surfaces as a create error.
 */
function suggestNextCode(codes: string[]): string {
  let best: { prefix: string; num: number; width: number } | null = null;
  for (const code of codes) {
    const m = /^(.*?)(\d+)$/.exec(code.trim());
    if (!m) continue;
    const num = Number.parseInt(m[2], 10);
    if (!best || num > best.num) {
      best = { prefix: m[1], num, width: m[2].length };
    }
  }
  if (!best) return "WP-01";
  return `${best.prefix}${String(best.num + 1).padStart(best.width, "0")}`;
}

export default async function NewWorkPackagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Dev OS</Link>
              <span>/</span>
              <span>Cut a work zone</span>
            </div>
            <h1>Cut a work zone</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  const [villaRows, parents, categories] = await Promise.all([
    db
      .select({ id: villas.id, unitCode: villas.unitCode })
      .from(villas)
      .where(eq(villas.projectId, project.realProjectId)),
    listWorkPackages({ projectId: project.realProjectId }),
    db
      .select({
        id: devCostCategories.id,
        displayName: devCostCategories.displayName,
      })
      .from(devCostCategories),
  ]);

  const suggestedCode = suggestNextCode(parents.map((p) => p.packageCode));

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Dev OS</Link>
            <span>/</span>
            <Link href="/development-os/projects">Projects</Link>
            <span>/</span>
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link>
            <span>/</span>
            <Link href={`/development-os/projects/${slug}/work-packages`}>
              Work zones
            </Link>
            <span>/</span>
            <span>New</span>
          </div>
          <h1>Cut a work zone</h1>
          <div className="page-header-meta">
            <span>NEXT CODE {suggestedCode}</span>
            <span>·</span>
            <span>{parents.length} EXISTING</span>
          </div>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/work-packages`}
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Zone console
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        A work package the crew owns end-to-end: scope (villas, zones), budget
        categories, planned dates. The zone code is pre-filled with the next
        free number for this project — editable.
      </p>

      <Card padding="default">
        <WorkPackageForm
          projectId={project.realProjectId}
          projectSlug={slug}
          suggestedCode={suggestedCode}
          villas={villaRows}
          parentOptions={parents.map((p) => ({
            id: p.id,
            packageCode: p.packageCode,
            name: p.name,
          }))}
          budgetCategories={categories}
        />
      </Card>
    </DevelopmentShell>
  );
}

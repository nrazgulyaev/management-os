import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listWorkPackages } from "@/lib/development/server/work-packages/work-package-queries";
import { villas } from "@/lib/db/schema/projects";
import { devCostCategories } from "@/lib/db/schema/dev-finance";
import { WorkPackageForm } from "@/components/development/work-packages/work-package-form";

export const metadata: Metadata = {
  title: "New work package · Development OS",
};
export const dynamic = "force-dynamic";

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
        <PageHeader title="New work package" />
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

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          {
            label: "Work packages",
            href: `/development-os/projects/${slug}/work-packages`,
          },
          { label: "New" },
        ]}
        title="New work package"
        description="Define scope (villas, zones), budget categories, planned dates, and responsibility."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/work-packages`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Packages
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Package details">
        <WorkPackageForm
          projectId={project.realProjectId}
          projectSlug={slug}
          villas={villaRows}
          parentOptions={parents.map((p) => ({
            id: p.id,
            packageCode: p.packageCode,
            name: p.name,
          }))}
          budgetCategories={categories}
        />
      </Section>
    </DevelopmentShell>
  );
}

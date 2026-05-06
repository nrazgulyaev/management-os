import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listWorkPackages } from "@/lib/development/server/work-packages/work-package-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Work packages · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  planned: "neutral",
  ready_to_start: "info",
  in_progress: "info",
  completed: "success",
  on_hold: "warning",
  cancelled: "neutral",
};

export default async function ProjectWorkPackagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Work packages" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const packages = await safeQuery(
    "listWorkPackages",
    listWorkPackages({ projectId: project.realProjectId }),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Work packages" },
        ]}
        eyebrow={`${packages.length} package${packages.length === 1 ? "" : "s"}`}
        title="Work packages"
        description="Hierarchical work packages per project. Multi-villa scope. Linked to budget categories, purchase requests, invoices, QA/QC issues, inventory movements via FK constraints (defense-in-depth)."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/development-os/projects/${slug}/work-packages/new`}>
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New package
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Project
              </Link>
            </Button>
          </div>
        }
      />

      {packages.length === 0 ? (
        <EmptyState
          title="No work packages yet"
          description="Use 'New package' to add the first."
        />
      ) : (
        <Section eyebrow="Catalog" title="All packages">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Progress</TH>
                <TH>Planned start</TH>
                <TH>Planned finish</TH>
                <TH>Villas</TH>
              </TR>
            </THead>
            <TBody>
              {packages.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/projects/${slug}/work-packages/${p.packageCode}`}
                      className="hover:underline"
                    >
                      {p.packageCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{p.name}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                      {p.status}
                    </Badge>
                  </TD>
                  <TDNum>{Number(p.progressPercentage).toFixed(0)}%</TDNum>
                  <TD className="text-xs">{p.plannedStart ?? "—"}</TD>
                  <TD className="text-xs">{p.plannedFinish ?? "—"}</TD>
                  <TDNum>{p.villaIds.length}</TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}

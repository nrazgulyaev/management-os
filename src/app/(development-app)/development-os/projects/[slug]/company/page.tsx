import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listCompanyStructures } from "@/lib/development/server/company-structure/company-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Company structure · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  planned: "neutral",
  in_progress: "info",
  registered: "success",
  dissolved: "warning",
  on_hold: "warning",
};

export default async function ProjectCompanyStructuresPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Company structure" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const structures = await safeQuery(
    "listCompanyStructures",
    listCompanyStructures({ projectId: project.realProjectId }),
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
          { label: "Company structure" },
        ]}
        eyebrow={`${structures.length} structure${structures.length === 1 ? "" : "s"}`}
        title="SPV / company structure"
        description="Per-project company structures (SPV / JV / partnership). Only one is active at a time. Shareholder ownership %s sum to exactly 100% per structure (DB trigger)."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Project
            </Link>
          </Button>
        }
      />

      {structures.length === 0 ? (
        <EmptyState
          title="No company structure recorded"
          description="Use createCompanyStructure to register the SPV / JV / partnership for this project."
        />
      ) : (
        <Section eyebrow="Catalog" title="All structures (active + historical)">
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Type</TH>
                <TH>Company</TH>
                <TH>Country</TH>
                <TH>Status</TH>
                <TH>Effective from</TH>
                <TH>Active</TH>
              </TR>
            </THead>
            <TBody>
              {structures.map((s) => (
                <TR key={s.id}>
                  <TD className="text-sm">
                    <Link
                      href={`/development-os/projects/${slug}/company/${s.id}`}
                      className="hover:underline"
                    >
                      {s.structureLabel}
                    </Link>
                  </TD>
                  <TD className="text-xs">{s.structureType}</TD>
                  <TD className="text-xs">{s.companyName ?? "—"}</TD>
                  <TD className="text-xs">{s.country ?? "—"}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[s.registrationStatus] ?? "neutral"}>
                      {s.registrationStatus}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{s.effectiveFrom}</TD>
                  <TD>
                    {s.isActive ? (
                      <Badge tone="success">active</Badge>
                    ) : (
                      <Badge tone="neutral">historical</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}

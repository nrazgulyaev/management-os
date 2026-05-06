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
import { listPermitsByProject } from "@/lib/development/server/permits/permit-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Permits · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  planned: "neutral",
  preparing: "info",
  submitted: "info",
  under_review: "info",
  approved: "success",
  rejected: "danger",
  expired: "warning",
  renewed: "success",
  cancelled: "neutral",
};

export default async function ProjectPermitsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Permits" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const permits = await safeQuery(
    "listPermitsByProject",
    listPermitsByProject(project.realProjectId),
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
          { label: "Permits" },
        ]}
        eyebrow={`${permits.length} permit${permits.length === 1 ? "" : "s"}`}
        title="Permits lifecycle"
        description="PBG, SLF, building license, etc. Each permit tracks status (planned → submitted → under review → approved/rejected → expired/renewed), cost, and attached documents."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Project
            </Link>
          </Button>
        }
      />

      {permits.length === 0 ? (
        <EmptyState
          title="No permits yet"
          description="Use the createPermit server action to add a permit. Detail/create form UI is a planned UI polish follow-on."
        />
      ) : (
        <Section eyebrow="Catalog" title="All permits">
          <Table>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Label</TH>
                <TH>Status</TH>
                <TH>Number</TH>
                <TH>Authority</TH>
                <TH>Submitted</TH>
                <TH>Received</TH>
                <TH>Expires</TH>
              </TR>
            </THead>
            <TBody>
              {permits.map((p) => (
                <TR key={p.id}>
                  <TD className="text-xs">{p.permitType}</TD>
                  <TD className="text-sm">
                    <Link
                      href={`/development-os/projects/${slug}/permits/${p.id}`}
                      className="hover:underline"
                    >
                      {p.permitLabel}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                      {p.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs font-mono">{p.permitNumber ?? "—"}</TD>
                  <TD className="text-xs">{p.issuingAuthority ?? "—"}</TD>
                  <TD className="text-xs">{p.submittedAt ?? "—"}</TD>
                  <TD className="text-xs">{p.receivedAt ?? "—"}</TD>
                  <TD className="text-xs">{p.expiresAt ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailPageHero } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { StatusPill, type VillaStatus } from "@/components/ui/status-pill";
import { ArchiveButton } from "@/components/admin/archive-button";
import { Pencil } from "lucide-react";
import { getProjectBySlug } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { archiveProjectAction, unarchiveProjectAction } from "@/features/projects/actions";

export const metadata = { title: "Project" };
export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const villas = project.source === "db"
    ? await listVillas({ projectId: project.id })
    : await listVillas();

  return (
    <div className="flex flex-col gap-10">
      <DetailPageHero
        breadcrumbs={[
          { label: "Portfolio", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name },
        ]}
        eyebrow={project.location}
        title={project.name}
        description={project.description ?? project.concept ?? undefined}
        statusRow={
          <>
            <SourceBadge source={project.source} />
            <Badge tone="success">{project.status.replace("_", " ")}</Badge>
            <Badge tone="outline">{project.managementStatus}</Badge>
          </>
        }
        actions={
          <>
            {project.source === "db" && (
              <ArchiveButton
                id={project.id}
                action={
                  project.status === "archived" ? unarchiveProjectAction : archiveProjectAction
                }
                archived={project.status === "archived"}
              />
            )}
            <Button variant="secondary" asChild>
              <Link href={`/dashboard/projects/${project.slug}/edit`}>
                <Pencil className="w-4 h-4" strokeWidth={1.75} />
                Edit
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/dashboard/villas/new?project=${project.id}`}>Add villa</Link>
            </Button>
          </>
        }
        summaryStrip={[
          {
            label: "Total villas",
            value: project.totalVillas?.toString() ?? "—",
          },
          {
            label: "Active villas",
            value: villas.length.toString(),
          },
          { label: "Location", value: project.location },
          {
            label: "Slug",
            value: <span className="font-mono text-base">{project.slug}</span>,
          },
        ]}
      />

      <Section
        eyebrow="Villas"
        title="Villas in this project"
        description="Live status pulled from the operations layer."
      >
        <Table>
          <THead>
            <TR>
              <TH>Unit</TH>
              <TH>Name</TH>
              <TH>Bedrooms</TH>
              <TH>Model</TH>
              <TH>Status</TH>
              <TH className="text-right">Nightly · USD</TH>
            </TR>
          </THead>
          <TBody>
            {villas.length === 0 ? (
              <TR>
                <TD colSpan={6} className="text-ink-tertiary text-center py-8">
                  No villas yet.
                </TD>
              </TR>
            ) : (
              villas.map((v) => (
                <TR key={v.id}>
                  <TD className="font-mono text-xs text-ink">{v.unitCode}</TD>
                  <TD className="text-ink">{v.name ?? "—"}</TD>
                  <TDNum>{v.bedrooms}</TDNum>
                  <TD>
                    <Badge tone="outline">{v.managementModel}</Badge>
                  </TD>
                  <TD>
                    <StatusPill status={v.status as VillaStatus} />
                  </TD>
                  <TDNum>
                    {v.currentNightlyRateUsd !== null
                      ? `$${v.currentNightlyRateUsd.toLocaleString()}`
                      : "—"}
                  </TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Section>
    </div>
  );
}


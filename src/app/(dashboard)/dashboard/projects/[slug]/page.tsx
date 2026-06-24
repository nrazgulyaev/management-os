import { notFound } from "next/navigation";
import Link from "next/link";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { StatusPill, type VillaStatus } from "@/components/ui/status-pill";
import { ArchiveButton } from "@/components/admin/archive-button";
import { Pencil } from "lucide-react";
import { getProjectBySlug } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { listOwnershipShares } from "@/features/owners/services";
import { listReserveBalances } from "@/features/finance/reserve-balances";
import { archiveProjectAction, unarchiveProjectAction } from "@/features/projects/actions";
import { formatMoneyMinor } from "@/lib/money";

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

  // Owners + reserve ledger for this project. Both services are org-scoped
  // (requireOrgId inside) and return rows tagged with projectId / villaId; we
  // narrow to entries that belong to THIS project — either anchored directly
  // on the project, or on one of its villas.
  const villaIds = new Set(villas.map((v) => v.id));
  const belongsToProject = (row: { projectId: string | null; villaId: string | null }) =>
    row.projectId === project.id || (!!row.villaId && villaIds.has(row.villaId));

  const [allShares, allReserves] =
    project.source === "db"
      ? await Promise.all([listOwnershipShares(), listReserveBalances()])
      : [[], []];

  const shares = allShares.filter(belongsToProject);
  const reserves = allReserves.filter(belongsToProject);
  const villaCodeById = new Map(villas.map((v) => [v.id, v.unitCode]));

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow={`Portfolio · projects · ${project.location}`}
        title={project.name}
        subtitle={project.description ?? project.concept ?? undefined}
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
      />

      <Card style={{ padding: 20 }}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <SourceBadge source={project.source} />
          <Badge tone="success">{project.status.replace("_", " ")}</Badge>
          <Badge tone="outline">{project.managementStatus}</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <SummaryCell label="Total villas" value={project.totalVillas?.toString() ?? "—"} />
          <SummaryCell label="Active villas" value={villas.length.toString()} />
          <SummaryCell label="Location" value={project.location} />
          <SummaryCell label="Slug" value={project.slug} mono />
        </div>
      </Card>

      <section>
        <div className="label">Villas</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
          Villas in this project
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
          Live status pulled from the operations layer.
        </p>
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
      </section>

      <section>
        <div className="label">Owners</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
          Ownership in this project
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
          Active and scheduled shares tied to this project or its villas.
        </p>
        <Table>
          <THead>
            <TR>
              <TH>Owner</TH>
              <TH>Scope</TH>
              <TH>Model</TH>
              <TH>Status</TH>
              <TH className="text-right">Share</TH>
            </TR>
          </THead>
          <TBody>
            {shares.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                  No ownership shares recorded yet.
                </TD>
              </TR>
            ) : (
              shares.map((s) => (
                <TR key={s.id}>
                  <TD className="text-ink">{s.ownerName}</TD>
                  <TD className="text-ink-secondary">
                    {s.villaId
                      ? villaCodeById.get(s.villaId) ?? s.villaCode ?? "Villa"
                      : "Whole project"}
                  </TD>
                  <TD>
                    <Badge tone="outline">{s.model}</Badge>
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        s.status === "active"
                          ? "success"
                          : s.status === "scheduled"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {s.status}
                    </Badge>
                  </TD>
                  <TDNum>{s.sharePercent}%</TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>

      <section>
        <div className="label">Reserve ledger</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>
          Reserve balances
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
          Posted reserve movements aggregated for this project and its villas.{" "}
          <Link href="/dashboard/finance/reserves" className="underline">
            Open the reserve ledger →
          </Link>
        </p>
        <Table>
          <THead>
            <TR>
              <TH>Scope</TH>
              <TH>Reserve type</TH>
              <TH className="text-right">Contributions</TH>
              <TH className="text-right">Releases</TH>
              <TH className="text-right">Balance</TH>
            </TR>
          </THead>
          <TBody>
            {reserves.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-ink-tertiary text-center py-8">
                  No posted reserve movements yet.
                </TD>
              </TR>
            ) : (
              reserves.map((r, i) => (
                <TR key={`${r.villaId ?? r.projectId}-${r.reserveType}-${r.currency}-${i}`}>
                  <TD className="text-ink-secondary">
                    {r.villaId
                      ? villaCodeById.get(r.villaId) ?? "Villa"
                      : "Whole project"}
                  </TD>
                  <TD className="text-ink capitalize">{r.reserveType.replace(/_/g, " ")}</TD>
                  <TDNum>{formatMoneyMinor(r.contributionsMinor, r.currency)}</TDNum>
                  <TDNum>{formatMoneyMinor(r.releasesMinor, r.currency)}</TDNum>
                  <TDNum>{formatMoneyMinor(r.balanceMinor, r.currency)}</TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}

function SummaryCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className={`text-base text-ink mt-1 ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}


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
import { safeQuery } from "@/lib/development/safe-query";
import { listProjectRfis } from "@/lib/development/server/rfis/rfi-queries";
import { RfiComposeLauncher } from "@/components/development/rfis/rfi-compose-launcher";
import { RFI_DISCIPLINES, type RfiStatus } from "@/features/development/rfi/rfi-routing";

export const metadata: Metadata = { title: "RFIs · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<RfiStatus, "warning" | "info" | "success"> = {
  open: "warning",
  answered: "info",
  closed: "success",
};

const PRIORITY_TONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
];

function buildHref(
  slug: string,
  current: { discipline: string; status: string },
  patch: Partial<{ discipline: string; status: string }>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.discipline && next.discipline !== "all") params.set("discipline", next.discipline);
  if (next.status && next.status !== "all") params.set("status", next.status);
  const qs = params.toString();
  return `/development-os/projects/${slug}/rfis${qs ? `?${qs}` : ""}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

export default async function ProjectRfisPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ discipline?: string; status?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const discipline = sp.discipline ?? "all";
  const status = sp.status ?? "all";

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="RFIs" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  const rfis = await safeQuery(
    "listProjectRfis",
    listProjectRfis({
      projectId: project.realProjectId,
      discipline: discipline === "all" ? undefined : discipline,
      status: status === "all" ? undefined : status,
    }),
    [],
    4000,
  );

  const openCount = rfis.filter((r) => r.status === "open").length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "RFIs" },
        ]}
        eyebrow={`${openCount} open · ${rfis.length} shown`}
        title="RFI inbox"
        description="Requests for information routed by discipline to the project-team contact who owns the answer. Compose runs the rfi-router; respond + resolve drive the open → answered → closed lifecycle."
        actions={
          <div className="flex items-center gap-2">
            <RfiComposeLauncher
              projectId={project.realProjectId}
              projectCode={project.slug}
              projectSlug={slug}
            />
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Project
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 -mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary mr-1">
            Status
          </span>
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={buildHref(slug, { discipline, status }, { status: f.value })}
            >
              <Badge tone={status === f.value ? "accent" : "outline"}>{f.label}</Badge>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary mr-1">
            Discipline
          </span>
          <Link href={buildHref(slug, { discipline, status }, { discipline: "all" })}>
            <Badge tone={discipline === "all" ? "accent" : "outline"}>All</Badge>
          </Link>
          {RFI_DISCIPLINES.map((d) => (
            <Link
              key={d}
              href={buildHref(slug, { discipline, status }, { discipline: d })}
            >
              <Badge tone={discipline === d ? "accent" : "outline"}>{d}</Badge>
            </Link>
          ))}
        </div>
      </div>

      {rfis.length === 0 ? (
        <EmptyState
          title="No RFIs match"
          description="Compose an RFI — the rfi-router picks the discipline contact from the project roster, or leaves it for the PM to assign."
        />
      ) : (
        <Section eyebrow="Inbox" title="RFIs (newest first)">
          <Table>
            <THead>
              <TR>
                <TH>Ref</TH>
                <TH>Question</TH>
                <TH>Discipline</TH>
                <TH>Routed to</TH>
                <TH>Priority</TH>
                <TH>Status</TH>
                <TH>Opened</TH>
              </TR>
            </THead>
            <TBody>
              {rfis.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/projects/${slug}/rfis/${r.id}`}
                      className="hover:underline"
                    >
                      {r.ref}
                    </Link>
                  </TD>
                  <TD className="text-sm max-w-md truncate">{r.question}</TD>
                  <TD className="text-xs">{r.discipline}</TD>
                  <TD className="text-xs">
                    {r.routedToName ?? (
                      <span className="text-ink-tertiary">Unrouted</span>
                    )}
                    {r.routedByAgent && (
                      <span className="ml-1 text-[10px] text-accent">· agent</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={PRIORITY_TONE[r.priority] ?? "neutral"}>
                      {r.priority}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </TD>
                  <TD className="text-xs">{fmtDate(r.openedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}

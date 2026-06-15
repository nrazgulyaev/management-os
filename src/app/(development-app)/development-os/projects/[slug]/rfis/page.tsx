import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
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

const STATUS_TONE: Record<RfiStatus, "warn" | "info" | "ok"> = {
  open: "warn",
  answered: "info",
  closed: "ok",
};

const PRIORITY_TONE: Record<string, "soft" | "info" | "warn" | "danger"> = {
  low: "soft",
  medium: "info",
  high: "warn",
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
        <div className="page-header">
          <div className="left">
            <h1>RFIs</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <span>RFIs</span>
          </div>
          <h1>RFI inbox</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Requests for information routed by discipline to the project-team
            contact who owns the answer. Compose runs the rfi-router; respond +
            resolve drive the open → answered → closed lifecycle.
          </p>
        </div>
        <div className="actions">
          <RfiComposeLauncher
            projectId={project.realProjectId}
            projectCode={project.slug}
            projectSlug={slug}
          />
          <Link
            href={`/development-os/projects/${slug}`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Project
          </Link>
        </div>
      </div>

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
              <HandoffBadge tone={status === f.value ? "info" : "soft"}>{f.label}</HandoffBadge>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary mr-1">
            Discipline
          </span>
          <Link href={buildHref(slug, { discipline, status }, { discipline: "all" })}>
            <HandoffBadge tone={discipline === "all" ? "info" : "soft"}>All</HandoffBadge>
          </Link>
          {RFI_DISCIPLINES.map((d) => (
            <Link
              key={d}
              href={buildHref(slug, { discipline, status }, { discipline: d })}
            >
              <HandoffBadge tone={discipline === d ? "info" : "soft"}>{d}</HandoffBadge>
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
        <div>
          <div className="label mb-2.5">Inbox</div>
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
                    <HandoffBadge tone={PRIORITY_TONE[r.priority] ?? "soft"}>
                      {r.priority}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[r.status]}>{r.status}</HandoffBadge>
                  </TD>
                  <TD className="text-xs">{fmtDate(r.openedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}

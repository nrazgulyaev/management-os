import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { getRfiById } from "@/lib/development/server/rfis/rfi-queries";
import { RfiRespondPanel } from "@/components/development/rfis/rfi-respond-panel";
import type { RfiStatus } from "@/features/development/rfi/rfi-routing";

export const metadata: Metadata = { title: "RFI · Development OS" };
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

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function RfiDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>RFI</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();

  const rfi = await getRfiById(id);
  // Guard cross-project access: the RFI must belong to the slug's project.
  if (!rfi || rfi.projectId !== detail.project.realProjectId) notFound();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{detail.project.name}</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/rfis`}>RFIs</Link> /{" "}
            <span>{rfi.ref}</span>
          </div>
          <h1>{rfi.ref}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">{rfi.question}</p>
        </div>
        <div className="actions">
          <HandoffBadge tone={STATUS_TONE[rfi.status]}>{rfi.status}</HandoffBadge>
          <Link
            href={`/development-os/projects/${slug}/rfis`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Inbox
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Routing</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field label="Discipline" value={rfi.discipline} />
            <Field
              label="Priority"
              value={
                (
                  <HandoffBadge tone={PRIORITY_TONE[rfi.priority] ?? "soft"}>
                    {rfi.priority}
                  </HandoffBadge>
                )
              }
            />
            <Field
              label="Routed to"
              value={rfi.routedToName ?? "Unrouted — PM to assign"}
            />
            <Field
              label="Routed by"
              value={rfi.routedByAgent ? "rfi-router agent" : "—"}
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Lifecycle</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="Opened" value={fmt(rfi.openedAt)} />
            <Field label="Answered" value={fmt(rfi.respondedAt)} />
            <Field label="Resolved" value={fmt(rfi.resolvedAt)} />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Response</div>
        <Card padding="default">
          <RfiRespondPanel
            rfiId={rfi.id}
            projectSlug={slug}
            status={rfi.status}
            existingResponse={rfi.responseText}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

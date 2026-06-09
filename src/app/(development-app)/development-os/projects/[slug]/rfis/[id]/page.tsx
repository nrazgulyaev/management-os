import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { getRfiById } from "@/lib/development/server/rfis/rfi-queries";
import { RfiRespondPanel } from "@/components/development/rfis/rfi-respond-panel";
import type { RfiStatus } from "@/features/development/rfi/rfi-routing";

export const metadata: Metadata = { title: "RFI · Development OS" };
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
        <PageHeader title="RFI" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: detail.project.name, href: `/development-os/projects/${slug}` },
          { label: "RFIs", href: `/development-os/projects/${slug}/rfis` },
          { label: rfi.ref },
        ]}
        eyebrow={`${rfi.discipline} · ${rfi.status}`}
        title={rfi.ref}
        description={rfi.question}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[rfi.status]}>{rfi.status}</Badge>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}/rfis`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Inbox
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Routing" title="Discipline + ownership">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Discipline" value={rfi.discipline} />
          <Field
            label="Priority"
            value={
              (
                <Badge tone={PRIORITY_TONE[rfi.priority] ?? "neutral"}>
                  {rfi.priority}
                </Badge>
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
      </Section>

      <Section eyebrow="Lifecycle" title="Timeline">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Opened" value={fmt(rfi.openedAt)} />
          <Field label="Answered" value={fmt(rfi.respondedAt)} />
          <Field label="Resolved" value={fmt(rfi.resolvedAt)} />
        </div>
      </Section>

      <Section eyebrow="Response" title="Answer + resolve">
        <RfiRespondPanel
          rfiId={rfi.id}
          projectSlug={slug}
          status={rfi.status}
          existingResponse={rfi.responseText}
        />
      </Section>
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

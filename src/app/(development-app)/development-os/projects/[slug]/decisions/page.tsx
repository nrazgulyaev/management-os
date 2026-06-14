import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listProjectDecisions } from "@/lib/development/server/decisions/decision-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Decisions · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  draft: "soft",
  active: "ok",
  superseded: "soft",
  reversed: "warn",
};

export default async function ProjectDecisionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Decisions</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const decisions = await safeQuery(
    "listProjectDecisions",
    listProjectDecisions({ projectId: project.realProjectId }),
    [],
    4000,
  );

  const active = decisions.filter((d) => d.status === "active").length;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <span>Decisions</span>
          </div>
          <h1>Decision Log</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Important project decisions captured for institutional memory.
            Supersede flow preserves audit trail — old decisions stay readable
            but marked &apos;superseded&apos;.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/decisions/new`}
            className="btn btn-accent btn-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            New decision
          </Link>
          <Link
            href={`/development-os/projects/${slug}`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Project
          </Link>
        </div>
      </div>

      {decisions.length === 0 ? (
        <EmptyState
          title="No decisions logged yet"
          description="Capture an important decision so it lives beyond a Slack thread."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Log</div>
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Date</TH>
              </TR>
            </THead>
            <TBody>
              {decisions.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/projects/${slug}/decisions/${d.decisionCode}`}
                      className="hover:underline"
                    >
                      {d.decisionCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{d.title}</TD>
                  <TD className="text-xs">{d.category ?? "—"}</TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[d.status] ?? "soft"}>
                      {d.status}
                    </HandoffBadge>
                  </TD>
                  <TD className="text-xs">{d.decisionDate}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}

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
import { listPermitsByProject } from "@/lib/development/server/permits/permit-actions";
import { safeQuery } from "@/lib/development/safe-query";
import { NewPermit } from "./_new-permit";

export const metadata: Metadata = { title: "Permits · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  planned: "soft",
  preparing: "info",
  submitted: "info",
  under_review: "info",
  approved: "ok",
  rejected: "danger",
  expired: "warn",
  renewed: "ok",
  cancelled: "soft",
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
        <div className="page-header">
          <div className="left">
            <h1>Permits</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <span>Permits</span>
          </div>
          <h1>Permits lifecycle</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            PBG, SLF, building license, etc. Each permit tracks status (planned
            → submitted → under review → approved/rejected → expired/renewed),
            cost, and attached documents.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Project
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <NewPermit projectId={project.realProjectId} slug={slug} />
      </div>

      {permits.length === 0 ? (
        <EmptyState
          title="No permits yet"
          description="Add the first permit with the New permit button above — PBG, SLF, building license, and so on."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
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
                    <HandoffBadge tone={STATUS_TONE[p.status] ?? "soft"}>
                      {p.status}
                    </HandoffBadge>
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
        </div>
      )}
    </DevelopmentShell>
  );
}

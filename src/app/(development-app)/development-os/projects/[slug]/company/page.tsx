import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listCompanyStructures } from "@/lib/development/server/company-structure/company-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { NewStructure } from "./_new-structure";

export const metadata: Metadata = { title: "Company structure · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  planned: "soft",
  in_progress: "info",
  registered: "ok",
  dissolved: "warn",
  on_hold: "warn",
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
        <div className="page-header">
          <div className="left">
            <h1>Company structure</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link>{" "}
            / <span>Company structure</span>
          </div>
          <h1>SPV / company structure</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-project company structures (SPV / JV / partnership). Only one is
            active at a time. Shareholder ownership %s sum to exactly 100% per
            structure (DB trigger).
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}`}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Project
          </Link>
        </div>
      </div>

      <div className="mt-[18px]">
        <NewStructure projectId={project.realProjectId} slug={slug} />
      </div>

      {structures.length === 0 ? (
        <EmptyState
          title="No company structure recorded"
          description="Register the SPV / JV / partnership for this project with the New structure button above."
        />
      ) : (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Catalog</div>
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
                    <HandoffBadge tone={STATUS_TONE[s.registrationStatus] ?? "soft"}>
                      {s.registrationStatus}
                    </HandoffBadge>
                  </TD>
                  <TD className="text-xs">{s.effectiveFrom}</TD>
                  <TD>
                    {s.isActive ? (
                      <HandoffBadge tone="ok">active</HandoffBadge>
                    ) : (
                      <HandoffBadge tone="soft">historical</HandoffBadge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getSiteZones } from "@/lib/development/server/site-reports";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { ZONE_TYPE_LABEL, type ZoneType } from "@/lib/development/constants/site-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { CreateZoneForm } from "./_zone-controls";

export const metadata: Metadata = { title: "Site zones · Development OS" };
export const dynamic = "force-dynamic";

/**
 * Site zones management. Zones are the step-1 prerequisite of the daily
 * site report (you cannot report per-zone activity, nor record material
 * consumption, against a zone that doesn't exist). The operator picks a
 * project, sees the existing zone breakdown, and creates new zones via the
 * org-scoped createSiteZone action (wired through _actions.ts).
 */
export default async function SiteZonesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/site-reports">Site reports</Link> /{" "}
              <span>Zones</span>
            </div>
            <h1>Site zones</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const projects = await safeQuery(
    "getDevelopmentProjects",
    getDevelopmentProjects(),
    [],
    4000,
  );
  const selectedProjectId = sp.projectId ?? projects[0]?.id ?? null;
  const zones = selectedProjectId
    ? await safeQuery(
        "getSiteZones",
        getSiteZones(selectedProjectId),
        [],
        4000,
      )
    : [];

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/site-reports">Site reports</Link> /{" "}
            <span>Zones</span>
          </div>
          <h1>Site zones</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Define the project&rsquo;s work-area breakdown (foundation,
            structure, MEP, finishing&hellip;). Zones gate the daily site
            report&rsquo;s per-zone activity capture and the material
            consumption ledger.
          </p>
          <div className="label mt-2">{zones.length} zones</div>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <CreateZoneForm projectId={selectedProjectId} />
            <Button asChild variant="secondary">
              <Link href="/development-os/site-reports">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Site reports
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects"
          description="Create a development project before defining its zones."
        />
      ) : (
        <>
          <form method="get" className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-ink-secondary">
              Project
              <select
                name="projectId"
                defaultValue={selectedProjectId ?? ""}
                className="rounded border border-line-soft bg-surface px-2 py-1 text-sm min-w-[260px]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50"
            >
              View
            </button>
          </form>

          <div>
            <div className="label mb-2.5">Zones</div>
            {zones.length === 0 ? (
              <EmptyState
                title="No zones for this project"
                description="Create the project's first zone — its structure / finishing / MEP / etc breakdown — with the Create zone button above."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Name</TH>
                    <TH>Type</TH>
                    <TH>Expected start</TH>
                    <TH>Expected completion</TH>
                    <TH>Order</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {zones.map((z) => (
                    <TR key={z.id}>
                      <TD className="font-mono text-xs">{z.zoneCode}</TD>
                      <TD className="text-sm">{z.zoneName}</TD>
                      <TD className="text-xs">
                        <HandoffBadge tone="soft">
                          {ZONE_TYPE_LABEL[z.zoneType as ZoneType] ?? z.zoneType}
                        </HandoffBadge>
                      </TD>
                      <TD className="text-xs text-ink-secondary">
                        {z.expectedStartDate ?? "—"}
                      </TD>
                      <TD className="text-xs text-ink-secondary">
                        {z.expectedCompletionDate ?? "—"}
                      </TD>
                      <TDNum>{z.displayOrder}</TDNum>
                      <TD className="text-xs">
                        {z.isActive ? (
                          <HandoffBadge tone="ok">Active</HandoffBadge>
                        ) : (
                          <HandoffBadge tone="soft">Inactive</HandoffBadge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}

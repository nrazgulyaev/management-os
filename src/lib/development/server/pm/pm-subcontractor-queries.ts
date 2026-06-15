import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { workPackages } from "@/lib/db/schema/work-packages";
import { projects as projectsTable } from "@/lib/db/schema/projects";
import { vendors } from "@/lib/db/schema/site-operations";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint MD-4 Phase 1 — Active-subcontractor aggregator for the
 * Project Manager cabinet apex.
 *
 * The codebase has no clean "subcontractor_assignments" pivot table;
 * subcontractors are vendors that own at least one currently-active
 * work_package (status in 'ready_to_start' or 'in_progress'). This
 * loader treats `vendors` as the proxy and surfaces the work_package
 * they're currently delivering on as the "working on" line.
 *
 * Status mapping:
 *   - work_package.status = 'in_progress' → "active"
 *   - work_package.status = 'ready_to_start' → "idle"
 *   - work_package.status = 'on_hold'       → "blocked"
 *
 * Vendors with multiple active packages collapse to their highest-
 * priority row (in_progress wins; ties broken by most-recent
 * planned_start).
 */

export type SubcontractorStatus = "active" | "idle" | "blocked";

export interface ActiveSubcontractor {
  id: string;
  name: string;
  workingOn: string;
  projectName: string | null;
  status: SubcontractorStatus;
  statusLabel: string;
  href?: string;
}

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  ready_to_start: 1,
  on_hold: 2,
};

function statusFor(s: string): SubcontractorStatus {
  if (s === "in_progress") return "active";
  if (s === "on_hold") return "blocked";
  return "idle";
}

function statusLabel(s: SubcontractorStatus): string {
  switch (s) {
    case "active":
      return "On site";
    case "blocked":
      return "On hold";
    default:
      return "Standing by";
  }
}

export async function loadActiveSubcontractors(
  projectIds?: string[],
  limit = 8,
): Promise<ActiveSubcontractor[]> {
  const db = getDb();
  if (!db) return [];

  const organizationId = await requireOrgId();

  const ACTIVE_STATUSES = ["ready_to_start", "in_progress", "on_hold"];

  const baseFilters = projectIds && projectIds.length > 0
    ? and(
        eq(workPackages.organizationId, organizationId),
        inArray(workPackages.projectId, projectIds),
        inArray(workPackages.status, ACTIVE_STATUSES),
        sql`${workPackages.primaryVendorId} IS NOT NULL`,
      )
    : and(
        eq(workPackages.organizationId, organizationId),
        inArray(workPackages.status, ACTIVE_STATUSES),
        sql`${workPackages.primaryVendorId} IS NOT NULL`,
      );

  const rows = await db
    .select({
      packageId: workPackages.id,
      packageName: workPackages.name,
      status: workPackages.status,
      plannedStart: workPackages.plannedStart,
      vendorId: workPackages.primaryVendorId,
      vendorName: vendors.legalName,
      projectId: workPackages.projectId,
      projectName: projectsTable.name,
    })
    .from(workPackages)
    .innerJoin(vendors, eq(vendors.id, workPackages.primaryVendorId))
    .leftJoin(
      projectsTable,
      eq(projectsTable.id, workPackages.projectId),
    )
    .where(baseFilters)
    .orderBy(
      asc(workPackages.status),
      asc(workPackages.plannedStart),
    );

  // Dedupe by vendor — keep the highest-priority active row.
  const byVendor = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!r.vendorId) continue;
    const existing = byVendor.get(r.vendorId);
    if (!existing) {
      byVendor.set(r.vendorId, r);
      continue;
    }
    const existingPriority = STATUS_ORDER[existing.status] ?? 99;
    const incomingPriority = STATUS_ORDER[r.status] ?? 99;
    if (incomingPriority < existingPriority) {
      byVendor.set(r.vendorId, r);
    }
  }

  return Array.from(byVendor.values())
    .slice(0, limit)
    .map((r): ActiveSubcontractor => {
      const status = statusFor(r.status);
      return {
        id: r.vendorId!,
        name: r.vendorName ?? "—",
        workingOn: r.packageName,
        projectName: r.projectName ?? null,
        status,
        statusLabel: statusLabel(status),
        href: `/development-os/projects`,
      };
    });
}

export interface ProjectCompletionRow {
  projectId: string;
  projectName: string;
  plannedPercent: number;
  actualPercent: number;
}

/**
 * Phase 1.2 — Project completion roll-up.
 *
 * For each project, sum the actual % vs the planned 100% across its
 * work_packages. A work_package counts as 100% complete when
 * `actual_finish IS NOT NULL`; otherwise its `progress_percentage`
 * column carries the in-flight figure.
 *
 * The `plannedPercent` column always reports 100 because the planned
 * timeline does not carry an explicit "what % should we have shipped
 * by today" curve in the existing schema (would require an S-curve
 * roll-up that doesn't exist yet). Operator reads `actualPercent`
 * against the implicit 100% benchmark.
 */
export async function loadProjectCompletion(
  projectIds?: string[],
): Promise<ProjectCompletionRow[]> {
  const db = getDb();
  if (!db) return [];

  const organizationId = await requireOrgId();

  const projectFilter = projectIds && projectIds.length > 0
    ? inArray(workPackages.projectId, projectIds)
    : undefined;

  const rows = await db
    .select({
      projectId: workPackages.projectId,
      projectName: projectsTable.name,
      actualFinish: workPackages.actualFinish,
      progressPercentage: workPackages.progressPercentage,
    })
    .from(workPackages)
    .leftJoin(
      projectsTable,
      eq(projectsTable.id, workPackages.projectId),
    )
    .where(
      projectFilter
        ? and(eq(workPackages.organizationId, organizationId), projectFilter)
        : eq(workPackages.organizationId, organizationId),
    );

  // Sum progress across packages per project.
  const byProject = new Map<
    string,
    { name: string; totals: number; count: number }
  >();
  for (const r of rows) {
    const key = r.projectId;
    const ratio = r.actualFinish ? 100 : Number(r.progressPercentage ?? 0);
    const existing = byProject.get(key);
    if (existing) {
      existing.totals += ratio;
      existing.count += 1;
    } else {
      byProject.set(key, {
        name: r.projectName ?? "—",
        totals: ratio,
        count: 1,
      });
    }
  }

  return Array.from(byProject.entries()).map(
    ([projectId, agg]): ProjectCompletionRow => ({
      projectId,
      projectName: agg.name,
      plannedPercent: 100,
      actualPercent:
        agg.count === 0 ? 0 : Math.round(agg.totals / agg.count),
    }),
  );
}

import "server-only";

/**
 * Phase 2.2 dev-01 data-wiring — read side for the per-project milestone
 * editor. Loads the real `milestones` rows for a project plus an upstream
 * dependency count per milestone, shaped for the editor's MilestoneRow.
 *
 * Returns `[]` on db-down so the page can fall back to its phase-synthesized
 * proof-of-life rows.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { milestones, milestoneDependencies } from "@/lib/db/schema/milestones";
import { dbStatusToUi } from "@/lib/development/milestone-status";
import type { MilestoneRowMilestone } from "@/components/projects/milestone-row";

export async function getProjectMilestones(
  projectId: string,
): Promise<MilestoneRowMilestone[]> {
  const db = getDb();
  if (!db) return [];

  // TENANCY — scope to the caller's org (in addition to project_id).
  // Single-tenant today, so this hides nothing; it is the multi-tenant guard.
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.organizationId, organizationId),
        eq(milestones.projectId, projectId),
      ),
    )
    .orderBy(asc(milestones.targetDate));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const edges = await db
    .select({ to: milestoneDependencies.toMilestoneId })
    .from(milestoneDependencies)
    .where(inArray(milestoneDependencies.toMilestoneId, ids));

  const depCount = new Map<string, number>();
  for (const e of edges) {
    depCount.set(e.to, (depCount.get(e.to) ?? 0) + 1);
  }

  const today = new Date();
  return rows.map((m) => {
    let slipDays = 0;
    if (m.targetDate && !m.actualDate && m.status !== "done") {
      const target = new Date(m.targetDate);
      if (target < today) {
        slipDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000);
      }
    }
    const count = depCount.get(m.id) ?? 0;
    return {
      id: m.id,
      name: m.name,
      targetDate: m.targetDate,
      actualDate: m.actualDate ?? undefined,
      status: dbStatusToUi(m.status),
      slipDays,
      dependencyCount: count > 0 ? count : undefined,
    };
  });
}

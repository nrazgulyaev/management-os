import "server-only";

import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  maintenanceTemplates,
  maintenanceWindowSuggestions,
  villaMaintenancePlans,
} from "@/lib/db/schema/maintenance-intelligence";
import { villas } from "@/lib/db/schema/projects";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { operationTasks } from "@/lib/db/schema/operations";
import {
  calculateNextDueAt,
  enumerateCandidateWindows,
  scoreWindowCandidates,
  type DisruptionLevel,
  type Frequency,
} from "./scheduling-pure";

/**
 * V9D — DB-aware scheduling. Pure logic in `scheduling-pure.ts`.
 */

export interface SuggestWindowsResult {
  planId: string;
  suggestions: Array<{
    start: string;
    end: string;
    date: string;
    score: number;
    reason: string;
    conflictCount: number;
  }>;
}

/**
 * Compute candidate windows for a plan, filter against calendar blocks,
 * score, and persist as `maintenance_window_suggestions`. Stale
 * `suggested` rows for the plan are cleared first so the surface stays
 * tidy on re-run.
 */
export async function suggestMaintenanceWindows(
  planId: string,
  horizonDays = 14,
): Promise<SuggestWindowsResult> {
  const db = getDb();
  if (!db) return { planId, suggestions: [] };

  // TENANCY: the planId is client-supplied through suggestMaintenanceWindowsAction.
  // Scope the lookup so a foreign-org plan reads as "not found" before any
  // villa-block/project read, suggestion DELETE, or suggestion INSERT runs.
  const organizationId = await requireOrgId();
  const [plan] = await db
    .select({
      p: villaMaintenancePlans,
      tCategory: maintenanceTemplates.category,
    })
    .from(villaMaintenancePlans)
    .leftJoin(
      maintenanceTemplates,
      eq(maintenanceTemplates.id, villaMaintenancePlans.templateId),
    )
    .where(and(
      eq(villaMaintenancePlans.id, planId),
      eq(villaMaintenancePlans.organizationId, organizationId),
    ))
    .limit(1);
  if (!plan) return { planId, suggestions: [] };

  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const until = new Date(from.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  // Pull villa blocks intersecting the horizon.
  const blocks = await db
    .select({
      blockType: villaCalendarBlocks.blockType,
      status: villaCalendarBlocks.status,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.villaId, plan.p.villaId),
        eq(villaCalendarBlocks.status, "active"),
        lt(villaCalendarBlocks.startsAt, until),
        gt(villaCalendarBlocks.endsAt, from),
      ),
    );

  // Pull same-category preventive tasks already scheduled across the
  // project — used to penalise clustering.
  const projectId = plan.p.projectId;
  const category = plan.tCategory ?? "general";
  let sameCategoryDateCounts: Record<string, number> = {};
  let totalVillasInProject = 0;
  if (projectId) {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)` })
      .from(villas)
      .where(
        and(eq(villas.projectId, projectId), eq(villas.status, "active")),
      );
    totalVillasInProject = Number(c ?? 0);

    const sameCat = await db
      .select({
        scheduledFor: operationTasks.scheduledFor,
        villaId: operationTasks.villaId,
      })
      .from(operationTasks)
      .where(
        and(
          eq(operationTasks.projectId, projectId),
          eq(operationTasks.category, "maintenance"),
          eq(operationTasks.source, "preventive"),
          inArray(operationTasks.status, [
            "open",
            "in_progress",
            "needs_review",
          ]),
        ),
      );
    sameCategoryDateCounts = sameCat.reduce<Record<string, number>>((acc, r) => {
      const d = r.scheduledFor as unknown as string | null;
      if (!d || !r.villaId) return acc;
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    }, {});
  }

  const candidates = enumerateCandidateWindows({
    from,
    until,
    durationMinutes: plan.p.durationMinutes,
    preferredTimeWindowStart:
      (plan.p.preferredTimeWindowStart as unknown as string | null) ?? null,
  });

  const scored = scoreWindowCandidates({
    candidates,
    villaBlocks: blocks,
    constraints: {
      category,
      durationMinutes: plan.p.durationMinutes,
      canBeDoneWhileOccupied: plan.p.canBeDoneWhileOccupied,
      guestDisruptionLevel:
        plan.p.guestDisruptionLevel as DisruptionLevel,
      requiresVillaEmpty: plan.p.requiresVillaEmpty,
      preferredWeekdays: plan.p.preferredWeekdays,
      avoidWeekdays: plan.p.avoidWeekdays,
      preferredTimeWindowStart:
        (plan.p.preferredTimeWindowStart as unknown as string | null) ?? null,
      preferredTimeWindowEnd:
        (plan.p.preferredTimeWindowEnd as unknown as string | null) ?? null,
    },
    sameCategoryDateCounts,
    totalVillasInProject,
  });

  // Persist top-N suggestions, replacing prior `suggested` rows.
  await db
    .delete(maintenanceWindowSuggestions)
    .where(
      and(
        eq(maintenanceWindowSuggestions.villaMaintenancePlanId, planId),
        eq(maintenanceWindowSuggestions.status, "suggested"),
      ),
    );
  const top = scored.slice(0, 5);
  if (top.length > 0) {
    await db.insert(maintenanceWindowSuggestions).values(
      top.map((s) => ({
        organizationId: plan.p.organizationId,
        villaMaintenancePlanId: planId,
        villaId: plan.p.villaId,
        suggestedStart: new Date(s.start),
        suggestedEnd: new Date(s.end),
        score: String(s.score),
        reason: s.reason,
        conflictCount: s.conflictCount,
        status: "suggested",
      })),
    );
  }
  return { planId, suggestions: top };
}

/**
 * Advance the plan's `next_due_at` after a task is generated. Pure-ish
 * — calls `calculateNextDueAt` and persists the result.
 */
export async function advancePlanNextDueAt(
  planId: string,
  completedAt?: Date,
): Promise<Date | null> {
  const db = getDb();
  if (!db) return null;
  const [plan] = await db
    .select()
    .from(villaMaintenancePlans)
    .where(eq(villaMaintenancePlans.id, planId))
    .limit(1);
  if (!plan) return null;
  const next = calculateNextDueAt({
    frequency: plan.frequency as Frequency,
    intervalDays: plan.intervalDays,
    lastCompletedAt: completedAt ?? plan.nextDueAt ?? null,
  });
  await db
    .update(villaMaintenancePlans)
    .set({ nextDueAt: next, updatedAt: new Date() })
    .where(eq(villaMaintenancePlans.id, planId));
  return next;
}

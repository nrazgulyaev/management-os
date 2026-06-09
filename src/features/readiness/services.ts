import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  villaReadinessStates,
  type NewVillaReadinessState,
} from "@/lib/db/schema/availability";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";

/**
 * V9A — readiness timeline reads. Pure DB. The "current" state is the
 * row with `effective_to IS NULL`; the partial unique index guarantees
 * at most one such row per villa.
 */

export interface CurrentReadinessRow {
  villaId: string;
  villaCode: string | null;
  projectName: string | null;
  readinessStatus: string;
  effectiveFrom: string;
  notes: string | null;
}

export async function getCurrentVillaReadiness(
  villaId: string,
): Promise<CurrentReadinessRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      r: villaReadinessStates,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaReadinessStates)
    .leftJoin(villas, eq(villas.id, villaReadinessStates.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(
      and(
        eq(villaReadinessStates.villaId, villaId),
        isNull(villaReadinessStates.effectiveTo),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    villaId: row.r.villaId,
    villaCode: row.villaCode ?? null,
    projectName: row.projectName ?? null,
    readinessStatus: row.r.readinessStatus,
    effectiveFrom: row.r.effectiveFrom.toISOString(),
    notes: row.r.notes,
  };
}

export async function listCurrentReadiness(opts?: {
  projectId?: string;
}): Promise<CurrentReadinessRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [isNull(villaReadinessStates.effectiveTo)];
  if (opts?.projectId) filters.push(eq(villas.projectId, opts.projectId));
  const rows = await db
    .select({
      r: villaReadinessStates,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaReadinessStates)
    .leftJoin(villas, eq(villas.id, villaReadinessStates.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(and(...filters))
    .orderBy(asc(villas.unitCode));
  return rows.map((r) => ({
    villaId: r.r.villaId,
    villaCode: r.villaCode ?? null,
    projectName: r.projectName ?? null,
    readinessStatus: r.r.readinessStatus,
    effectiveFrom: r.r.effectiveFrom.toISOString(),
    notes: r.r.notes,
  }));
}

export async function listReadinessHistory(
  villaId: string,
  limit = 30,
): Promise<{
  id: string;
  readinessStatus: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  changedBy: string | null;
}[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(villaReadinessStates)
    .where(eq(villaReadinessStates.villaId, villaId))
    .orderBy(desc(villaReadinessStates.effectiveFrom))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    readinessStatus: r.readinessStatus,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo?.toISOString() ?? null,
    notes: r.notes,
    changedBy: r.changedBy,
  }));
}

/**
 * Atomic state-transition helper used by both the user action and the
 * auto-set hook from operation-task status changes. Closes the previous
 * open row (effective_to = now) and inserts the new open row in one
 * transaction so the partial unique index never fires.
 *
 * Returns the new row id, or null when the readiness is unchanged
 * (idempotent — you can call this from a task hook without thrashing
 * the timeline).
 */
export async function setVillaReadiness(input: {
  villaId: string;
  readinessStatus: string;
  relatedBookingId?: string | null;
  relatedTaskId?: string | null;
  notes?: string | null;
  changedBy?: string | null;
}): Promise<{ stateId: string | null; changed: boolean }> {
  const db = getDb();
  if (!db) return { stateId: null, changed: false };

  return await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(villaReadinessStates)
      .where(
        and(
          eq(villaReadinessStates.villaId, input.villaId),
          isNull(villaReadinessStates.effectiveTo),
        ),
      )
      .limit(1);

    if (current && current.readinessStatus === input.readinessStatus) {
      return { stateId: current.id, changed: false };
    }

    const now = new Date();
    if (current) {
      await tx
        .update(villaReadinessStates)
        .set({ effectiveTo: now })
        .where(eq(villaReadinessStates.id, current.id));
    }

    // Org: reuse the prior open row's org, else resolve via villa -> project.
    let organizationId = current?.organizationId ?? null;
    if (!organizationId) {
      const [v] = await tx
        .select({ organizationId: projectsTable.organizationId })
        .from(villas)
        .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
        .where(eq(villas.id, input.villaId))
        .limit(1);
      organizationId = v?.organizationId ?? null;
    }

    const insertRow: NewVillaReadinessState = {
      organizationId,
      villaId: input.villaId,
      readinessStatus: input.readinessStatus,
      effectiveFrom: now,
      relatedBookingId: input.relatedBookingId ?? null,
      relatedTaskId: input.relatedTaskId ?? null,
      notes: input.notes ?? null,
      changedBy: input.changedBy ?? null,
    };
    const [inserted] = await tx
      .insert(villaReadinessStates)
      .values(insertRow)
      .returning({ id: villaReadinessStates.id });
    return { stateId: inserted!.id, changed: true };
  });
}

// Pure helpers re-exported for convenience; the canonical home is
// `./lifecycle.ts` so tests can import without `server-only`.
export {
  TASK_TO_READINESS,
  readinessFromTaskUpdate,
  READINESS_STATUSES,
  type ReadinessStatus,
} from "./lifecycle";
import { readinessFromTaskUpdate as _readinessFromTaskUpdate } from "./lifecycle";

/**
 * Hook: when an operations task's status changes, optionally bump the
 * villa's readiness. Safe — returns null when there's no mapping. The
 * caller (operations actions) decides whether to invoke this.
 */
export async function autoSetReadinessFromTask(input: {
  villaId: string | null;
  taskId: string;
  category: string;
  status: string;
  changedBy?: string | null;
}): Promise<{ stateId: string | null; changed: boolean } | null> {
  if (!input.villaId) return null;
  const target = _readinessFromTaskUpdate(input.category, input.status);
  if (!target) return null;
  return setVillaReadiness({
    villaId: input.villaId,
    readinessStatus: target,
    relatedTaskId: input.taskId,
    changedBy: input.changedBy ?? null,
  });
}

// Suppress unused-import warnings on helpers we may want from this module
// later (sql / inArray are used by future bulk APIs).
export const _drizzleHelpers = { sql, inArray };

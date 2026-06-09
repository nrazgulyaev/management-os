"use server";

/**
 * Phase 2.2 dev-01 data-wiring — project-milestone persistence.
 *
 * Real CRUD for the per-project `milestones` table (the gantt-lite editor
 * at /development-os/projects/[slug]/milestones). Until this landed the
 * editor's "+ Add milestone" was local-state only; the table was read by
 * the schedule-variance detector but never written by a human. These three
 * actions close that loop so the detector reads real authored data.
 *
 * Permission-gated on `projects.write` (matches the sibling project writes)
 * and audit-logged like the RFI actions. Dependency edges are written into
 * `milestone_dependencies` (finish-to-start) so the variance detector can
 * propagate slip through the CPM graph.
 */

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import { getDb } from "@/lib/db/client";
import {
  milestones,
  milestoneDependencies,
  type MilestoneKind,
} from "@/lib/db/schema/milestones";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import {
  UI_MILESTONE_STATUSES as UI_STATUSES,
  UI_TO_DB_STATUS as UI_TO_DB,
} from "@/lib/development/milestone-status";

const MILESTONE_KINDS: readonly MilestoneKind[] = [
  "design",
  "permit",
  "site_prep",
  "foundation",
  "frame",
  "mep",
  "finishes",
  "handover",
  "other",
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be ISO YYYY-MM-DD.");

export interface MilestoneActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const createSchema = z.object({
  projectId: z.string().uuid(),
  projectSlug: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(200),
  targetDate: isoDate,
  actualDate: isoDate.nullish(),
  kind: z.enum(MILESTONE_KINDS as unknown as [MilestoneKind, ...MilestoneKind[]]).default("other"),
  status: z.enum(UI_STATUSES).default("planned"),
  ownerStaffId: z.string().uuid().nullish(),
  notes: z.string().max(2000).nullish(),
  /** Existing milestone ids this one depends on (finish → start). */
  dependsOn: z.array(z.string().uuid()).default([]),
});

/**
 * Inserts a milestone and its finish-to-start dependency edges. Only
 * accepts dependency ids that already belong to the same project (a
 * cross-project edge would corrupt the variance graph).
 */
export async function createMilestone(
  input: z.input<typeof createSchema>,
): Promise<MilestoneActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const ctx = await requirePermission("projects.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const data = parsed.data;

  const [row] = await db
    .insert(milestones)
    .values({
      projectId: data.projectId,
      name: data.name,
      kind: data.kind,
      targetDate: data.targetDate,
      actualDate: data.actualDate ?? null,
      status: UI_TO_DB[data.status],
      ownerStaffId: data.ownerStaffId ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  if (!row) return { ok: false, error: "Failed to create milestone." };

  // Validate dependency ids are real + same-project before linking.
  if (data.dependsOn.length > 0) {
    const valid = await db
      .select({ id: milestones.id })
      .from(milestones)
      .where(
        and(
          eq(milestones.projectId, data.projectId),
          inArray(milestones.id, data.dependsOn),
        ),
      );
    const validIds = valid.map((r) => r.id).filter((id) => id !== row.id);
    if (validIds.length > 0) {
      await db
        .insert(milestoneDependencies)
        .values(
          validIds.map((from) => ({
            fromMilestoneId: from,
            toMilestoneId: row.id,
            kind: "fs",
          })),
        )
        .onConflictDoNothing();
    }
  }

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "milestone.create",
    entityType: "milestone",
    entityId: row.id,
    after: {
      name: row.name,
      kind: row.kind,
      targetDate: row.targetDate,
      status: row.status,
    },
    metadata: { projectId: data.projectId, dependsOn: data.dependsOn },
  });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/projects/${data.projectSlug}/milestones`);
  return { ok: true, id: row.id };
}

const updateSchema = z.object({
  milestoneId: z.string().uuid(),
  projectSlug: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  targetDate: isoDate.optional(),
  actualDate: isoDate.nullish(),
  kind: z.enum(MILESTONE_KINDS as unknown as [MilestoneKind, ...MilestoneKind[]]).optional(),
  status: z.enum(UI_STATUSES).optional(),
  ownerStaffId: z.string().uuid().nullish(),
  notes: z.string().max(2000).nullish(),
});

/**
 * Patches a milestone. Setting status to `done` without an explicit
 * actualDate stamps today's date so the variance detector treats it as
 * complete (it keys completion off `status === done || actualDate`).
 */
export async function updateMilestone(
  input: z.input<typeof updateSchema>,
): Promise<MilestoneActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const ctx = await requirePermission("projects.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const data = parsed.data;

  const [current] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, data.milestoneId))
    .limit(1);
  if (!current) return { ok: false, error: "Milestone not found." };

  const updates: Partial<typeof milestones.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.targetDate !== undefined) updates.targetDate = data.targetDate;
  if (data.actualDate !== undefined) updates.actualDate = data.actualDate ?? null;
  if (data.kind !== undefined) updates.kind = data.kind;
  if (data.ownerStaffId !== undefined) updates.ownerStaffId = data.ownerStaffId ?? null;
  if (data.notes !== undefined) updates.notes = data.notes ?? null;
  if (data.status !== undefined) {
    updates.status = UI_TO_DB[data.status];
    // Completing a milestone implies an actual date; stamp today if the
    // caller didn't supply one and none exists yet.
    if (data.status === "done" && data.actualDate === undefined && !current.actualDate) {
      updates.actualDate = new Date().toISOString().slice(0, 10);
    }
  }

  const [row] = await db
    .update(milestones)
    .set(updates)
    .where(eq(milestones.id, data.milestoneId))
    .returning();
  if (!row) return { ok: false, error: "Failed to update milestone." };

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "milestone.update",
    entityType: "milestone",
    entityId: row.id,
    before: {
      name: current.name,
      status: current.status,
      targetDate: current.targetDate,
      actualDate: current.actualDate,
    },
    after: {
      name: row.name,
      status: row.status,
      targetDate: row.targetDate,
      actualDate: row.actualDate,
    },
    metadata: { projectId: current.projectId },
  });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/projects/${data.projectSlug}/milestones`);
  return { ok: true, id: row.id };
}

const deleteSchema = z.object({
  milestoneId: z.string().uuid(),
  projectSlug: z.string().min(1),
});

/**
 * Deletes a milestone. Dependency edges cascade via the FK
 * (`milestone_dependencies` references milestones with onDelete cascade).
 */
export async function deleteMilestone(
  input: z.input<typeof deleteSchema>,
): Promise<MilestoneActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const ctx = await requirePermission("projects.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [current] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, parsed.data.milestoneId))
    .limit(1);
  if (!current) return { ok: false, error: "Milestone not found." };

  await db.delete(milestones).where(eq(milestones.id, parsed.data.milestoneId));

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "milestone.delete",
    entityType: "milestone",
    entityId: parsed.data.milestoneId,
    before: {
      name: current.name,
      status: current.status,
      targetDate: current.targetDate,
    },
    metadata: { projectId: current.projectId },
  });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/projects/${parsed.data.projectSlug}/milestones`);
  return { ok: true, id: parsed.data.milestoneId };
}

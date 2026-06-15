"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { turnovers, TURNOVER_STATUSES } from "@/lib/db/schema/turnovers";
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsers } from "@/lib/db/schema/identity";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * W4 mgmt-04 — turnover board status persistence + manual cleaner assignment.
 *
 * Wired from <TurnoverBoardClient> (the client wrapper around
 * <TurnoverBoard>): dragging a card between columns calls
 * updateTurnoverStatusAction; the per-card cleaner picker calls
 * assignTurnoverAction. Both are permission-gated + audit-logged like
 * sibling operations mutations.
 *
 * TENANCY: `turnovers` has no organization_id column — its only org anchor
 * is the villa → project graph (mirrors turnover-queries.ts). Every lookup
 * resolves the row by id AND verifies its villa's project belongs to the
 * caller's org, so a cross-org operator can't read or mutate another
 * tenant's turnover row.
 */

export interface TurnoverActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Load a turnover by id and confirm its villa's project belongs to `orgId`.
 * Returns the row only on match, else null (treated as not-found upstream).
 */
async function loadOrgScopedTurnover(
  db: NonNullable<ReturnType<typeof getDb>>,
  id: string,
  organizationId: string,
) {
  const [row] = await db
    .select({ t: turnovers })
    .from(turnovers)
    .innerJoin(villas, eq(villas.id, turnovers.villaId))
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(eq(turnovers.id, id), eq(projects.organizationId, organizationId)),
    )
    .limit(1);
  return row?.t ?? null;
}

const updateTurnoverStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(TURNOVER_STATUSES),
});

export async function updateTurnoverStatusAction(
  input: z.infer<typeof updateTurnoverStatusSchema>,
): Promise<TurnoverActionResult> {
  await requirePermission("operations.write");

  const parsed = updateTurnoverStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid turnover or status." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // TENANCY: scope the lookup to this org's villa → project graph.
  const before = await loadOrgScopedTurnover(db, parsed.data.id, organizationId);
  if (!before) return { ok: false, error: "Turnover not found." };

  if (before.status === parsed.data.status) return { ok: true };

  const now = new Date();
  const patch: Partial<typeof turnovers.$inferInsert> = {
    status: parsed.data.status,
    updatedAt: now,
  };
  // Stamp lifecycle timestamps the first time the card enters the column.
  if (parsed.data.status === "in-progress" && !before.startedAt) patch.startedAt = now;
  if (parsed.data.status === "done" && !before.completedAt) patch.completedAt = now;

  await db.update(turnovers).set(patch).where(eq(turnovers.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.turnover.status",
    entityType: "turnover",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.status },
  });

  revalidatePath("/dashboard/operations/turnovers");
  revalidatePath("/dashboard/operations");
  return { ok: true };
}

const assignTurnoverSchema = z.object({
  id: z.string().uuid(),
  // Empty string clears the assignment (unassign).
  assigneeUserId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : (v ?? null))),
});

/**
 * Manually assign (or clear) the cleaner on a turnover card. Replaces the
 * cron-only allocator path so a housekeeping manager can override the
 * board live. Permission-gated on operations.assign + org-scoped + audited.
 */
export async function assignTurnoverAction(
  input: z.input<typeof assignTurnoverSchema>,
): Promise<TurnoverActionResult> {
  await requirePermission("operations.assign");

  const parsed = assignTurnoverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid turnover or assignee." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const before = await loadOrgScopedTurnover(db, parsed.data.id, organizationId);
  if (!before) return { ok: false, error: "Turnover not found." };

  // TENANCY: when assigning (not clearing), confirm the client-supplied
  // assignee is a member of the caller's org. Without this, a cross-org
  // cleaner UUID could be persisted onto this org's turnover row.
  if (parsed.data.assigneeUserId !== null) {
    const [assignee] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(
        and(
          eq(appUsers.id, parsed.data.assigneeUserId),
          eq(appUsers.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!assignee) return { ok: false, error: "Assignee not found." };
  }

  if (before.assigneeUserId === parsed.data.assigneeUserId) return { ok: true };

  await db
    .update(turnovers)
    .set({
      assigneeUserId: parsed.data.assigneeUserId,
      // A manual assignment overrides any agent rationale.
      assignmentRationale:
        parsed.data.assigneeUserId === null ? null : "Manually assigned",
      updatedAt: new Date(),
    })
    .where(eq(turnovers.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.turnover.assign",
    entityType: "turnover",
    entityId: parsed.data.id,
    before: { assigneeUserId: before.assigneeUserId },
    after: { assigneeUserId: parsed.data.assigneeUserId },
  });

  revalidatePath("/dashboard/operations/turnovers");
  revalidatePath("/dashboard/operations");
  return { ok: true };
}

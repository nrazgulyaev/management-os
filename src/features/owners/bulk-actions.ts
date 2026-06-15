"use server";

/**
 * CRM-SAVED-VIEWS-BULK (#169) — owner bulk actions (<BulkActionBar>).
 *
 * Multi-select rows on /dashboard/owners → bulk status change / tag / assign.
 * BUILD-SAFETY (PR #168): exports ONLY async functions; zod schemas are
 * module-local consts.
 *
 * - Bulk status change writes the REAL `owners.status` column.
 * - Bulk tag + bulk assign are audit-only (no tags / owner-assignment column
 *   exists yet — same audit-only pattern as owners/actions.ts commission /
 *   portal-invite writes; a dedicated table lands in a later unit).
 *
 * Every write is owners.write gated and audit-logged. getDb() may be null
 * (demo) → no-op result. Export-CSV is client-side (no server round-trip).
 */

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { appUsers } from "@/lib/db/schema/identity";
import { crmTagAssignments } from "@/lib/db/schema/crm-custom-fields";
import { createTagAction } from "@/features/crm-custom-fields/actions";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

export interface BulkResult {
  ok: boolean;
  error?: string;
  /** How many rows the action touched. */
  affected?: number;
}

const idsSchema = z.array(z.string().uuid()).min(1).max(500);

const bulkStatusSchema = z.object({
  ids: idsSchema,
  status: z.enum(["active", "onboarding", "archived"]),
});

/** Bulk-set owner status across the selected rows (real column write). */
export async function bulkOwnerStatusAction(
  input: z.infer<typeof bulkStatusSchema>,
): Promise<BulkResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = bulkStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { ids, status } = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY (0173): owners is org-scoped via its own organization_id. Scope the
  // bulk write to the caller's org so any foreign ids in the selection are
  // silently filtered out, and report the TRUE affected count from the row set.
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const updated = await db
    .update(owners)
    .set({ status, updatedAt: new Date() })
    .where(and(inArray(owners.id, ids), eq(owners.organizationId, organizationId)))
    .returning({ id: owners.id });
  const updatedIds = updated.map((r) => r.id);

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.bulk_status",
    entityType: "owner",
    entityId: null,
    after: { status, ownerIds: updatedIds, count: updatedIds.length },
  });
  revalidatePath("/dashboard/owners");
  return { ok: true, affected: updatedIds.length };
}

const bulkTagSchema = z.object({
  ids: idsSchema,
  tag: z.string().min(1).max(60),
});

/**
 * Bulk-tag the selected owners via the shared CRM tag layer. Resolve (or
 * create) the org tag once from the free-text label — createTagAction is
 * idempotent on slug, so re-using an existing tag is a no-op — then insert a
 * crm_tag_assignments row (subjectType 'owner') for each owner that belongs to
 * the caller's org. The insert mirrors assignTagAction: org-stamped + onConflict
 * idempotent (unique tag/subject index → re-tagging is a no-op).
 */
export async function bulkOwnerTagAction(
  input: z.infer<typeof bulkTagSchema>,
): Promise<BulkResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = bulkTagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { ids, tag } = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY: scope the selection to the caller's org so any foreign ids are
  // silently dropped before we persist anything against them.
  const organizationId = await requireOrgId();
  const ownerRows = await db
    .select({ id: owners.id })
    .from(owners)
    .where(and(inArray(owners.id, ids), eq(owners.organizationId, organizationId)));
  const ownerIds = ownerRows.map((r) => r.id);
  if (ownerIds.length === 0) return { ok: true, affected: 0 };

  // Resolve/create the tag once (idempotent on slug, org-scoped + audit-logged
  // inside createTagAction). May throw if the label has no slug-able chars.
  let resolved: { id: string; label: string; color: string };
  try {
    resolved = await createTagAction({ label: tag });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid tag." };
  }

  const me = await getCurrentAppUser();
  // One idempotent insert per owner (unique (tag, subject_type, subject_id)
  // index → onConflictDoNothing skips already-tagged owners).
  await db
    .insert(crmTagAssignments)
    .values(
      ownerIds.map((ownerId) => ({
        organizationId,
        tagId: resolved.id,
        subjectType: "owner" as const,
        subjectId: ownerId,
        assignedBy: me?.id ?? null,
      })),
    )
    .onConflictDoNothing();

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.bulk_tag",
    entityType: "owner",
    entityId: null,
    after: { tag, tagId: resolved.id, ownerIds, count: ownerIds.length },
    metadata: { organizationId },
  });
  revalidatePath("/dashboard/owners");
  return { ok: true, affected: ownerIds.length };
}

const bulkAssignSchema = z.object({
  ids: idsSchema,
  assigneeAppUserId: z.string().uuid(),
});

/**
 * Bulk-assign the selected owners to a relationship manager. Persists the
 * assignee on owners.assigned_app_user_id (migration 0178): a real column
 * write, no longer audit-only.
 *
 * The UPDATE is doubly org-scoped — the assignee must be an app_user in the
 * caller's org (else any foreign assigneeId is rejected) AND each owner row is
 * AND-scoped on organization_id, so foreign ids in the selection are silently
 * filtered out. The TRUE affected count is read back from the returned rows.
 */
export async function bulkOwnerAssignAction(
  input: z.infer<typeof bulkAssignSchema>,
): Promise<BulkResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = bulkAssignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { ids, assigneeAppUserId } = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY: scope to the caller's org on BOTH sides of the relationship.
  const organizationId = await requireOrgId();

  // 1) The relationship manager must be an app_user in this org — block
  //    cross-tenant assignment before we touch any owner row.
  const [assignee] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.id, assigneeAppUserId),
        eq(appUsers.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!assignee) return { ok: false, error: "Assignee not found in this organization." };

  // 2) Org-scoped UPDATE — foreign owner ids in the selection are dropped by
  //    the organization_id predicate; report the TRUE affected count.
  const me = await getCurrentAppUser();
  const updated = await db
    .update(owners)
    .set({ assignedAppUserId: assigneeAppUserId, updatedAt: new Date() })
    .where(and(inArray(owners.id, ids), eq(owners.organizationId, organizationId)))
    .returning({ id: owners.id });
  const updatedIds = updated.map((r) => r.id);

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.bulk_assign",
    entityType: "owner",
    entityId: null,
    after: { assigneeAppUserId, ownerIds: updatedIds, count: updatedIds.length },
    metadata: { organizationId },
  });
  revalidatePath("/dashboard/owners");
  return { ok: true, affected: updatedIds.length };
}

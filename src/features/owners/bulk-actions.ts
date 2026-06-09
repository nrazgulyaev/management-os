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
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";

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

  const me = await getCurrentAppUser();
  await db.update(owners).set({ status, updatedAt: new Date() }).where(inArray(owners.id, ids));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.bulk_status",
    entityType: "owner",
    entityId: null,
    after: { status, ownerIds: ids, count: ids.length },
  });
  revalidatePath("/dashboard/owners");
  return { ok: true, affected: ids.length };
}

const bulkTagSchema = z.object({
  ids: idsSchema,
  tag: z.string().min(1).max(60),
});

/**
 * Bulk-tag the selected owners. Audit-only until a dedicated owner-tags
 * table lands — captures the director's intent as a reviewable event.
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

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.bulk_tag",
    entityType: "owner",
    entityId: null,
    after: { tag, ownerIds: ids, count: ids.length },
  });
  revalidatePath("/dashboard/owners");
  return { ok: true, affected: ids.length };
}

const bulkAssignSchema = z.object({
  ids: idsSchema,
  assigneeAppUserId: z.string().uuid(),
});

/**
 * Bulk-assign the selected owners to a relationship manager. Audit-only
 * until an owner-assignment column / table lands.
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

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.bulk_assign",
    entityType: "owner",
    entityId: null,
    after: { assigneeAppUserId, ownerIds: ids, count: ids.length },
  });
  revalidatePath("/dashboard/owners");
  return { ok: true, affected: ids.length };
}

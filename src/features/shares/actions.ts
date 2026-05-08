"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ownershipShares } from "@/lib/db/schema/ownership";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { createShareSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();

export async function createShareAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("share"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = createShareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const d = parsed.data;
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(ownershipShares)
    .values({
      ownerId: d.ownerId,
      villaId: d.villaId && d.villaId !== "" ? d.villaId : null,
      projectId: d.projectId && d.projectId !== "" ? d.projectId : null,
      sharePercent: String(d.sharePercent),
      model: d.model,
      startsOn: d.startsOn,
      endsOn: d.endsOn && d.endsOn !== "" ? d.endsOn : null,
      status: d.status,
    })
    .returning({ id: ownershipShares.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "share.create",
    entityType: "ownership_share",
    entityId: row.id,
    after: d,
  });

  revalidatePath("/dashboard/shares");
  if (d.ownerId) revalidatePath(`/dashboard/owners/${d.ownerId}`);
  redirect("/dashboard/shares");
}

export async function archiveShareAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("share"))) return { ok: false, error: "Not authorised." };
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing share id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [before] = await db
    .select()
    .from(ownershipShares)
    .where(eq(ownershipShares.id, id.data))
    .limit(1);
  if (!before) return { ok: false, error: "Share not found." };
  await db.update(ownershipShares).set({ status: "ended" }).where(eq(ownershipShares.id, id.data));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "share.end",
    entityType: "ownership_share",
    entityId: id.data,
    before: { status: before.status },
    after: { status: "ended" },
  });
  revalidatePath("/dashboard/shares");
  return { ok: true };
}

// =============================================================================
// Stage 10.E.3 — Edit (constrained).
//
// Audit found shares had Add but no Edit/Delete affordance. Shares are
// historically-significant ledger rows (driving distribution math), so
// `ownerId`, `villaId`, `projectId`, and `model` stay immutable post-
// create. Edit is constrained to operationally-correctable fields:
// sharePercent, startsOn, endsOn, status. The full row is re-validated
// against createShareSchema (which enforces the model ↔ villa/project
// invariants), then mutated on a small subset.
// =============================================================================

export async function updateShareAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("share"))) {
    return { ok: false, error: "Not authorised." };
  }
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing share id." };
  const parsed = createShareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;
  const [before] = await db
    .select()
    .from(ownershipShares)
    .where(eq(ownershipShares.id, id.data))
    .limit(1);
  if (!before) return { ok: false, error: "Share not found." };
  // Mutate only the operationally-correctable fields. The form may post
  // ownerId / villaId / projectId / model as part of the round-tripped
  // payload — we ignore them on update to preserve ledger integrity.
  await db
    .update(ownershipShares)
    .set({
      sharePercent: String(d.sharePercent),
      startsOn: d.startsOn,
      endsOn: d.endsOn && d.endsOn !== "" ? d.endsOn : null,
      status: d.status,
    })
    .where(eq(ownershipShares.id, id.data));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "share.update",
    entityType: "ownership_share",
    entityId: id.data,
    before: {
      sharePercent: before.sharePercent,
      startsOn: before.startsOn,
      endsOn: before.endsOn,
      status: before.status,
    },
    after: {
      sharePercent: d.sharePercent,
      startsOn: d.startsOn,
      endsOn: d.endsOn ?? null,
      status: d.status,
    },
  });
  revalidatePath("/dashboard/shares");
  if (before.ownerId) revalidatePath(`/dashboard/owners/${before.ownerId}`);
  return { ok: true };
}

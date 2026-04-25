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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { createOwnerSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();

function nullable(v: string | undefined) {
  return v && v !== "" ? v : null;
}

export async function createOwnerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const raw = Object.fromEntries(formData.entries());
  const parsed = createOwnerSchema.safeParse(raw);
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
    .insert(owners)
    .values({
      type: d.type,
      displayName: d.displayName,
      legalName: nullable(d.legalName),
      email: nullable(d.email),
      phone: nullable(d.phone),
      nationality: nullable(d.nationality),
      taxResidency: nullable(d.taxResidency),
      status: d.status,
    })
    .returning({ id: owners.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.create",
    entityType: "owner",
    entityId: row.id,
    after: d,
  });

  revalidatePath("/dashboard/owners");
  redirect(`/dashboard/owners/${row.id}`);
}

export async function updateOwnerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing owner id." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = createOwnerSchema.safeParse(raw);
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
  const [before] = await db.select().from(owners).where(eq(owners.id, id.data)).limit(1);
  if (!before) return { ok: false, error: "Owner not found." };

  await db
    .update(owners)
    .set({
      type: d.type,
      displayName: d.displayName,
      legalName: nullable(d.legalName),
      email: nullable(d.email),
      phone: nullable(d.phone),
      nationality: nullable(d.nationality),
      taxResidency: nullable(d.taxResidency),
      status: d.status,
    })
    .where(eq(owners.id, id.data));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.update",
    entityType: "owner",
    entityId: id.data,
    before: {
      ...before,
      createdAt: before.createdAt.toISOString(),
      updatedAt: before.updatedAt.toISOString(),
    },
    after: d,
  });

  revalidatePath("/dashboard/owners");
  revalidatePath(`/dashboard/owners/${id.data}`);
  redirect(`/dashboard/owners/${id.data}`);
}

async function transition(
  id: string,
  next: "archived" | "active",
  action: "owner.archive" | "owner.unarchive",
): Promise<ActionResult> {
  if (!(await canManageEntity("owner"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [before] = await db.select().from(owners).where(eq(owners.id, id)).limit(1);
  if (!before) return { ok: false, error: "Owner not found." };
  await db.update(owners).set({ status: next }).where(eq(owners.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action,
    entityType: "owner",
    entityId: id,
    before: { status: before.status },
    after: { status: next },
  });
  revalidatePath("/dashboard/owners");
  revalidatePath(`/dashboard/owners/${id}`);
  return { ok: true };
}

export async function archiveOwnerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing owner id." };
  return transition(id.data, "archived", "owner.archive");
}

export async function unarchiveOwnerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing owner id." };
  return transition(id.data, "active", "owner.unarchive");
}

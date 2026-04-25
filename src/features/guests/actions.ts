"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { guests } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { createGuestSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();
const nullable = (v: string | undefined) => (v && v !== "" ? v : null);

export async function createGuestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("guest"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = createGuestSchema.safeParse(Object.fromEntries(formData.entries()));
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
    .insert(guests)
    .values({
      fullName: d.fullName,
      email: nullable(d.email),
      phone: nullable(d.phone),
      nationality: nullable(d.nationality),
      preferredLanguage: nullable(d.preferredLanguage),
      whatsapp: nullable(d.whatsapp),
      status: d.status,
    })
    .returning({ id: guests.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "guest.create",
    entityType: "guest",
    entityId: row.id,
    after: d,
  });

  revalidatePath("/dashboard/guests");
  redirect("/dashboard/guests");
}

async function transition(
  id: string,
  next: "archived" | "active",
  action: "guest.archive" | "guest.unarchive",
): Promise<ActionResult> {
  if (!(await canManageEntity("guest"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [before] = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
  if (!before) return { ok: false, error: "Guest not found." };
  await db.update(guests).set({ status: next }).where(eq(guests.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action,
    entityType: "guest",
    entityId: id,
    before: { status: before.status },
    after: { status: next },
  });
  revalidatePath("/dashboard/guests");
  return { ok: true };
}

export async function archiveGuestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing guest id." };
  return transition(id.data, "archived", "guest.archive");
}

export async function unarchiveGuestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing guest id." };
  return transition(id.data, "active", "guest.unarchive");
}

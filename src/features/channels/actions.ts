"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { bookingChannels } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { isSuperAdminContext } from "@/features/auth/require-super-admin";
import { createChannelSchema, updateChannelSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();

export async function createChannelAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // The channel catalog (booking_channels) is a SHARED, global reference list —
  // no organization_id, referenced by every tenant's bookings. So curating it
  // (add/edit/archive) is platform-level: PLATFORM super-admin only (the
  // allowlist-gated helper), not a per-org role. A tenant admin also holds the
  // super_admin role, so the raw `ctx.isSuperAdmin` field would let them mutate
  // a catalog every other tenant shares — route through isSuperAdminContext().
  const { ok: isPlatformAdmin } = await isSuperAdminContext();
  if (!isPlatformAdmin) {
    return {
      ok: false,
      error:
        "The channel catalog is shared across all tenants — only a platform super-admin can change it.",
    };
  }
  const parsed = createChannelSchema.safeParse(Object.fromEntries(formData.entries()));
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

  try {
    const [row] = await db
      .insert(bookingChannels)
      .values({
        key: d.key,
        name: d.name,
        type: d.type,
        commissionModel: d.commissionModel ?? null,
        defaultCommissionPct:
          d.defaultCommissionPct !== undefined ? String(d.defaultCommissionPct) : null,
        status: d.status,
      })
      .returning({ id: bookingChannels.id });
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "channel.create",
      entityType: "channel",
      entityId: row.id,
      after: d,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return { ok: false, error: msg.includes("unique") ? "Key already exists." : msg };
  }

  revalidatePath("/dashboard/channels");
  return { ok: true };
}

export async function updateChannelAction(
  id: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // The channel catalog (booking_channels) is a SHARED, global reference list —
  // no organization_id, referenced by every tenant's bookings. So curating it
  // (add/edit/archive) is platform-level: PLATFORM super-admin only (the
  // allowlist-gated helper), not a per-org role. A tenant admin also holds the
  // super_admin role, so the raw `ctx.isSuperAdmin` field would let them mutate
  // a catalog every other tenant shares — route through isSuperAdminContext().
  const { ok: isPlatformAdmin } = await isSuperAdminContext();
  if (!isPlatformAdmin) {
    return {
      ok: false,
      error:
        "The channel catalog is shared across all tenants — only a platform super-admin can change it.",
    };
  }
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Missing channel id." };
  const parsed = updateChannelSchema.safeParse(Object.fromEntries(formData.entries()));
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

  const [before] = await db
    .select()
    .from(bookingChannels)
    .where(eq(bookingChannels.id, id))
    .limit(1);
  if (!before) return { ok: false, error: "Channel not found." };

  await db
    .update(bookingChannels)
    .set({
      name: d.name,
      type: d.type,
      commissionModel: d.commissionModel ?? null,
      defaultCommissionPct:
        d.defaultCommissionPct !== undefined ? String(d.defaultCommissionPct) : null,
      status: d.status,
      updatedAt: new Date(),
    })
    .where(eq(bookingChannels.id, id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "channel.update",
    entityType: "channel",
    entityId: id,
    before: {
      name: before.name,
      type: before.type,
      commissionModel: before.commissionModel,
      defaultCommissionPct: before.defaultCommissionPct,
      status: before.status,
    },
    after: d,
  });

  revalidatePath("/dashboard/channels");
  return { ok: true };
}

async function transition(
  id: string,
  next: "archived" | "active",
  action: "channel.archive" | "channel.unarchive",
): Promise<ActionResult> {
  const { ok: isPlatformAdmin } = await isSuperAdminContext();
  if (!isPlatformAdmin)
    return {
      ok: false,
      error:
        "The channel catalog is shared across all tenants — only a platform super-admin can change it.",
    };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [before] = await db
    .select()
    .from(bookingChannels)
    .where(eq(bookingChannels.id, id))
    .limit(1);
  if (!before) return { ok: false, error: "Channel not found." };
  await db.update(bookingChannels).set({ status: next }).where(eq(bookingChannels.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action,
    entityType: "channel",
    entityId: id,
    before: { status: before.status },
    after: { status: next },
  });
  revalidatePath("/dashboard/channels");
  return { ok: true };
}

export async function archiveChannelAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing channel id." };
  return transition(id.data, "archived", "channel.archive");
}

export async function unarchiveChannelAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing channel id." };
  return transition(id.data, "active", "channel.unarchive");
}

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { securityCameraDevices } from "@/lib/db/schema/availability";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  createCameraDeviceSchema,
  updateCameraDeviceSchema,
} from "@/features/availability/schema";
import type { ActionResult } from "@/features/projects/actions";

export async function createSecurityCameraDeviceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { cameraId?: string }> {
  await requirePermission("security.manage");
  const raw = Object.fromEntries(formData.entries());
  const parsed = createCameraDeviceSchema.safeParse({
    ...raw,
    projectId: raw.projectId || null,
    villaId: raw.villaId || null,
    provider: raw.provider || null,
    externalAppUrl: raw.externalAppUrl || null,
    accessRole: raw.accessRole || null,
    notes: raw.notes || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const externalAppUrl =
    parsed.data.externalAppUrl && parsed.data.externalAppUrl !== ""
      ? parsed.data.externalAppUrl
      : null;

  const [row] = await db
    .insert(securityCameraDevices)
    .values({
      projectId: parsed.data.projectId ?? null,
      villaId: parsed.data.villaId ?? null,
      name: parsed.data.name,
      locationLabel: parsed.data.locationLabel,
      provider: parsed.data.provider ?? null,
      externalAppUrl,
      status: "active",
      accessRole: parsed.data.accessRole ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning({ id: securityCameraDevices.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "security.camera.create",
    entityType: "security_camera_device",
    entityId: row!.id,
    after: {
      name: parsed.data.name,
      locationLabel: parsed.data.locationLabel,
      provider: parsed.data.provider ?? null,
      hasExternalUrl: Boolean(externalAppUrl),
    },
  });

  revalidatePath("/dashboard/security");
  revalidatePath("/dashboard/security/cameras");
  return { ok: true, cameraId: row!.id };
}

export async function updateSecurityCameraDeviceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("security.manage");
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateCameraDeviceSchema.safeParse({
    ...raw,
    projectId: raw.projectId || null,
    villaId: raw.villaId || null,
    provider: raw.provider || null,
    externalAppUrl: raw.externalAppUrl || null,
    accessRole: raw.accessRole || null,
    notes: raw.notes || null,
    status: raw.status || undefined,
    lastCheckedAt: raw.lastCheckedAt || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const externalAppUrl =
    parsed.data.externalAppUrl && parsed.data.externalAppUrl !== ""
      ? parsed.data.externalAppUrl
      : null;

  await db
    .update(securityCameraDevices)
    .set({
      projectId: parsed.data.projectId ?? null,
      villaId: parsed.data.villaId ?? null,
      name: parsed.data.name,
      locationLabel: parsed.data.locationLabel,
      provider: parsed.data.provider ?? null,
      externalAppUrl,
      accessRole: parsed.data.accessRole ?? null,
      notes: parsed.data.notes ?? null,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.lastCheckedAt
        ? { lastCheckedAt: new Date(parsed.data.lastCheckedAt) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(securityCameraDevices.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "security.camera.update",
    entityType: "security_camera_device",
    entityId: parsed.data.id,
    after: { name: parsed.data.name },
  });

  revalidatePath("/dashboard/security");
  revalidatePath("/dashboard/security/cameras");
  return { ok: true };
}

// Stage 10.E.5 — archive a camera device. Schema has status text NOT
// NULL DEFAULT 'active'; flip to "archived". Hardware-revoked devices
// stay in DB for audit trail (camera footage retention).
export async function archiveSecurityCameraDeviceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("security.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing camera id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(securityCameraDevices)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(securityCameraDevices.id, id))
    .returning({ id: securityCameraDevices.id });
  if (!row) return { ok: false, error: "Camera not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "security.camera.archive",
    entityType: "security_camera_device",
    entityId: id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/security");
  revalidatePath("/dashboard/security/cameras");
  return { ok: true };
}

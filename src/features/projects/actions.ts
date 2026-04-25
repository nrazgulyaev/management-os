"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { createProjectSchema } from "./schema";

export type ActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const idSchema = z.string().uuid();

function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out as T;
}

type ProjectStatus = "planning" | "under_construction" | "active" | "managed" | "archived";
type ProjectMgmtStatus = "lead" | "onboarding" | "managed" | "paused" | "exited";

export async function createProjectAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("project"))) {
    return { ok: false, error: "Not authorised to create projects." };
  }
  const raw = Object.fromEntries(formData.entries());
  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      error:
        "Database is not configured. Set DATABASE_URL in .env.local and run the migration before creating records.",
    };
  }

  const data = emptyToNull(parsed.data);
  const me = await getCurrentAppUser();

  let createdId: string;
  try {
    const [row] = await db
      .insert(projects)
      .values({
        slug: data.slug as string,
        name: data.name as string,
        concept: (data.concept as string | null) ?? null,
        location: data.location as string,
        area: (data.area as string | null) ?? null,
        description: (data.description as string | null) ?? null,
        status: data.status as ProjectStatus,
        managementStatus: data.managementStatus as ProjectMgmtStatus,
        totalVillas: (data.totalVillas as number | undefined) ?? null,
        targetHandoverDate: (data.targetHandoverDate as string | null) ?? null,
        leaseholdUntil: (data.leaseholdUntil as string | null) ?? null,
      })
      .returning({ id: projects.id });
    createdId = row.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return {
      ok: false,
      error: msg.includes("unique") ? "Slug already in use." : msg,
    };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "project.create",
    entityType: "project",
    entityId: createdId,
    after: data as Record<string, unknown>,
  });

  revalidatePath("/dashboard/projects");
  redirect(`/dashboard/projects/${data.slug}`);
}

export async function updateProjectAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("project"))) {
    return { ok: false, error: "Not authorised to update projects." };
  }
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing or invalid project id." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const data = emptyToNull(parsed.data);
  const me = await getCurrentAppUser();
  const [before] = await db.select().from(projects).where(eq(projects.id, id.data)).limit(1);
  if (!before) return { ok: false, error: "Project not found." };

  try {
    await db
      .update(projects)
      .set({
        slug: data.slug as string,
        name: data.name as string,
        concept: (data.concept as string | null) ?? null,
        location: data.location as string,
        area: (data.area as string | null) ?? null,
        description: (data.description as string | null) ?? null,
        status: data.status as ProjectStatus,
        managementStatus: data.managementStatus as ProjectMgmtStatus,
        totalVillas: (data.totalVillas as number | undefined) ?? null,
        targetHandoverDate: (data.targetHandoverDate as string | null) ?? null,
        leaseholdUntil: (data.leaseholdUntil as string | null) ?? null,
      })
      .where(eq(projects.id, id.data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return { ok: false, error: msg.includes("unique") ? "Slug already in use." : msg };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "project.update",
    entityType: "project",
    entityId: id.data,
    before: {
      ...before,
      createdAt: before.createdAt.toISOString(),
      updatedAt: before.updatedAt.toISOString(),
    },
    after: data as Record<string, unknown>,
  });

  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${data.slug}`);
  redirect(`/dashboard/projects/${data.slug}`);
}

async function transition(
  id: string,
  next: ProjectStatus,
  action: "project.archive" | "project.unarchive",
): Promise<ActionResult> {
  if (!(await canManageEntity("project"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const [before] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!before) return { ok: false, error: "Project not found." };

  await db.update(projects).set({ status: next }).where(eq(projects.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action,
    entityType: "project",
    entityId: id,
    before: { status: before.status },
    after: { status: next },
  });

  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${before.slug}`);
  return { ok: true };
}

export async function archiveProjectAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing project id." };
  return transition(id.data, "archived", "project.archive");
}

export async function unarchiveProjectAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing project id." };
  return transition(id.data, "active", "project.unarchive");
}

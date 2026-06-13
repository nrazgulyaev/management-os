"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { villas, projects } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { createVillaSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();

export async function createVillaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("villa"))) {
    return { ok: false, error: "Not authorised to create villas." };
  }
  const raw = Object.fromEntries(formData.entries());
  const parsed = createVillaSchema.safeParse(raw);
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

  const d = parsed.data;
  const me = await getCurrentAppUser();

  // TENANCY: villas have no direct org column — their anchor is transitive via
  // villas.project_id -> projects.organization_id. Verify the target project is
  // in the caller's org so a villa can't be created under another org's project.
  const organizationId = await requireOrgId();
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, d.projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!proj) {
    return { ok: false, error: "Project not found in your organization." };
  }

  let id: string;
  try {
    // Stage 5.B.1 — every villa row needs asset_type_id (NOT NULL).
    // Look up the 'villa' asset type once per insert.
    const [villaType] = await db
      .select({ id: assetTypes.id })
      .from(assetTypes)
      .where(eq(assetTypes.typeKey, "villa"))
      .limit(1);
    if (!villaType) {
      return {
        ok: false,
        error: "Asset type 'villa' missing from registry. Re-run migrations.",
      };
    }
    const [row] = await db
      .insert(villas)
      .values({
        projectId: d.projectId,
        unitCode: d.unitCode,
        slug: d.slug,
        name: d.name && d.name !== "" ? d.name : null,
        assetTypeId: villaType.id,
        status: d.status,
        bedrooms: d.bedrooms,
        bathrooms: d.bathrooms !== undefined ? String(d.bathrooms) : null,
        builtAreaSqm: d.builtAreaSqm !== undefined ? String(d.builtAreaSqm) : null,
        landAreaSqm: d.landAreaSqm !== undefined ? String(d.landAreaSqm) : null,
        poolAreaSqm: d.poolAreaSqm !== undefined ? String(d.poolAreaSqm) : null,
        viewType: d.viewType && d.viewType !== "" ? d.viewType : null,
        managementModel: d.managementModel,
        currentNightlyRateUsd:
          d.currentNightlyRateUsd !== undefined ? String(d.currentNightlyRateUsd) : null,
      })
      .returning({ id: villas.id });
    id = row.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return {
      ok: false,
      error: msg.includes("unique") ? "Unit code already exists in this project." : msg,
    };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa.create",
    entityType: "villa",
    entityId: id,
    after: d,
  });

  revalidatePath("/dashboard/villas");
  redirect(`/dashboard/villas/${id}`);
}

export async function updateVillaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("villa"))) {
    return { ok: false, error: "Not authorised." };
  }
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing villa id." };

  const raw = Object.fromEntries(formData.entries());
  const parsed = createVillaSchema.safeParse(raw);
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

  // TENANCY: prove the target villa belongs to the caller's org via its project
  // (villas have no direct org column), and treat a cross-org id as not-found.
  const organizationId = await requireOrgId();
  const [before] = await db
    .select()
    .from(villas)
    .innerJoin(projects, eq(villas.projectId, projects.id))
    .where(and(eq(villas.id, id.data), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Villa not found." };

  // Reject moving the villa into another org's project.
  const [destProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, d.projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!destProject) {
    return { ok: false, error: "Project not found in your organization." };
  }

  try {
    await db
      .update(villas)
      .set({
        projectId: d.projectId,
        unitCode: d.unitCode,
        slug: d.slug,
        name: d.name && d.name !== "" ? d.name : null,
        status: d.status,
        bedrooms: d.bedrooms,
        bathrooms: d.bathrooms !== undefined ? String(d.bathrooms) : null,
        builtAreaSqm: d.builtAreaSqm !== undefined ? String(d.builtAreaSqm) : null,
        landAreaSqm: d.landAreaSqm !== undefined ? String(d.landAreaSqm) : null,
        poolAreaSqm: d.poolAreaSqm !== undefined ? String(d.poolAreaSqm) : null,
        viewType: d.viewType && d.viewType !== "" ? d.viewType : null,
        managementModel: d.managementModel,
        currentNightlyRateUsd:
          d.currentNightlyRateUsd !== undefined ? String(d.currentNightlyRateUsd) : null,
      })
      .where(eq(villas.id, id.data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return {
      ok: false,
      error: msg.includes("unique") ? "Unit code already exists in this project." : msg,
    };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa.update",
    entityType: "villa",
    entityId: id.data,
    before: {
      ...before.villas,
      createdAt: before.villas.createdAt.toISOString(),
      updatedAt: before.villas.updatedAt.toISOString(),
    },
    after: d,
  });

  revalidatePath("/dashboard/villas");
  revalidatePath(`/dashboard/villas/${id.data}`);
  redirect(`/dashboard/villas/${id.data}`);
}

async function transition(
  id: string,
  next: "archived" | "ready",
  action: "villa.archive" | "villa.unarchive",
): Promise<ActionResult> {
  if (!(await canManageEntity("villa"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: scope the transition to the caller's org via the project anchor
  // (villas have no direct org column) so a crafted id can't flip another org's
  // villa status; a cross-org id reads as the existing not-found path.
  const organizationId = await requireOrgId();
  const [before] = await db
    .select({ status: villas.status })
    .from(villas)
    .innerJoin(projects, eq(villas.projectId, projects.id))
    .where(and(eq(villas.id, id), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Villa not found." };
  await db.update(villas).set({ status: next }).where(eq(villas.id, id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action,
    entityType: "villa",
    entityId: id,
    before: { status: before.status },
    after: { status: next },
  });
  revalidatePath("/dashboard/villas");
  revalidatePath(`/dashboard/villas/${id}`);
  return { ok: true };
}

export async function archiveVillaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing villa id." };
  return transition(id.data, "archived", "villa.archive");
}

export async function unarchiveVillaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing villa id." };
  return transition(id.data, "ready", "villa.unarchive");
}

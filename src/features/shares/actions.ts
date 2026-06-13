"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ownershipShares, owners } from "@/lib/db/schema/ownership";
import { villas, projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
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
  // TENANCY: shares drive distribution/statement math. Stamp the caller's org
  // and verify every FK (owner/villa/project) belongs to it, so a crafted POST
  // can't attach another org's owner/villa to a share (cross-org ledger
  // poisoning). Mirrors onboardOwnerAction's villa validation.
  const organizationId = await requireOrgId();
  const [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.id, d.ownerId), eq(owners.organizationId, organizationId)))
    .limit(1);
  if (!owner) {
    return { ok: false, error: "Owner is not available in your organisation." };
  }
  if (d.villaId && d.villaId !== "") {
    const [v] = await db
      .select({ id: villas.id })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(and(eq(villas.id, d.villaId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!v) return { ok: false, error: "Villa is not available in your organisation." };
  }
  if (d.projectId && d.projectId !== "") {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, d.projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!p) return { ok: false, error: "Project is not available in your organisation." };
  }

  const [row] = await db
    .insert(ownershipShares)
    .values({
      organizationId,
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
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  // TENANCY: only end a share in the caller's org (cross-org id → not found).
  const [before] = await db
    .select()
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.id, id.data),
        eq(ownershipShares.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Share not found." };
  await db
    .update(ownershipShares)
    .set({ status: "ended" })
    .where(
      and(
        eq(ownershipShares.id, id.data),
        eq(ownershipShares.organizationId, organizationId),
      ),
    );
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
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const d = parsed.data;
  // TENANCY: only edit a share in the caller's org (cross-org id → not found).
  const [before] = await db
    .select()
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.id, id.data),
        eq(ownershipShares.organizationId, organizationId),
      ),
    )
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
    .where(
      and(
        eq(ownershipShares.id, id.data),
        eq(ownershipShares.organizationId, organizationId),
      ),
    );
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

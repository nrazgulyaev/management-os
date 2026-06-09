"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { recordAuditEvent } from "@/features/audit/services";
import { recordCrmActivity } from "@/features/crm-activity/services";
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
  // CRM ACTIVITY TIMELINE (#169) — surface owner archive/unarchive on the
  // unified relationship feed. Best-effort, org-scoped, audit-logged inside.
  await recordCrmActivity({
    subjectType: "owner",
    subjectId: id,
    kind: "status_change",
    title: `Status → ${next}`,
    metadata: { fromStatus: before.status, toStatus: next },
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

/* ------------------------------------------------------------------ *
 * mgmt-03 cabinet wiring — audit-only writes.
 *
 * The commission/portal-invite/insight UI shells (EditCommissionModal,
 * InvitePortalModal, InsightCard) have no dedicated persistence target
 * in this phase: commission lives at the ownership-share level and the
 * portal magic-link + insight model land in the 2.2 data PR. Until then
 * these directors' decisions are recorded as append-only audit events so
 * the intent is captured and reviewable. No new tables / no migration.
 * ------------------------------------------------------------------ */

const editCommissionInput = z.object({
  ownerId: idSchema,
  commissionPct: z.coerce.number().min(0).max(100),
  effectiveDate: z.string().min(4).max(40),
  reason: z.string().min(1).max(2000),
});

export async function recordCommissionChangeAction(
  input: z.infer<typeof editCommissionInput>,
): Promise<ActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = editCommissionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid commission change." };
  const d = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [owner] = await db.select().from(owners).where(eq(owners.id, d.ownerId)).limit(1);
  if (!owner) return { ok: false, error: "Owner not found." };

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.commission_change",
    entityType: "owner",
    entityId: d.ownerId,
    after: {
      commissionPct: d.commissionPct,
      effectiveDate: d.effectiveDate,
      reason: d.reason,
    },
  });

  revalidatePath(`/dashboard/owners/${d.ownerId}`);
  return { ok: true };
}

const portalInviteInput = z.object({
  ownerId: idSchema,
  note: z.string().max(2000).optional().default(""),
});

export async function recordPortalInviteAction(
  input: z.infer<typeof portalInviteInput>,
): Promise<ActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = portalInviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid invite." };
  const d = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [owner] = await db.select().from(owners).where(eq(owners.id, d.ownerId)).limit(1);
  if (!owner) return { ok: false, error: "Owner not found." };

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.portal_invite",
    entityType: "owner",
    entityId: d.ownerId,
    after: { note: d.note || null, email: owner.email },
  });

  revalidatePath(`/dashboard/owners/${d.ownerId}`);
  return { ok: true };
}

const insightDecisionInput = z.object({
  ownerId: idSchema,
  insightId: z.string().min(1).max(120),
  decision: z.enum(["schedule_call", "dismiss"]),
  reason: z.string().max(120).optional().default(""),
  note: z.string().max(2000).optional().default(""),
});

export async function recordInsightDecisionAction(
  input: z.infer<typeof insightDecisionInput>,
): Promise<ActionResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = insightDecisionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid insight decision." };
  const d = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action:
      d.decision === "schedule_call"
        ? "owner.insight_schedule_call"
        : "owner.insight_dismiss",
    entityType: "owner",
    entityId: d.ownerId,
    after: {
      insightId: d.insightId,
      reason: d.reason || null,
      note: d.note || null,
    },
  });

  revalidatePath(`/dashboard/owners/${d.ownerId}`);
  return { ok: true };
}

export async function unarchiveOwnerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing owner id." };
  return transition(id.data, "active", "owner.unarchive");
}

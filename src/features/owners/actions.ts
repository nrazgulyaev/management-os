"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { owners, ownershipShares } from "@/lib/db/schema/ownership";
import { villas, projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { recordCrmActivity } from "@/features/crm-activity/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
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

/* ------------------------------------------------------------------ *
 * Onboard-owner wizard — full persistence (defect-3 fix).
 *
 * The 3-step OnboardOwnerModal collects identity (step 1), commission %
 * (step 2) and villa assignment + portal invite (step 3). The old launcher
 * forwarded ONLY the identity fields to createOwnerAction and silently
 * dropped commission / villaIds / invitePortal. This single action persists
 * everything that has a home, in one org-scoped flow, and returns the new
 * owner id so the client can navigate.
 *
 *   - identity     → owners row (status 'onboarding')
 *   - commissionPct→ owners.commission_pct (fraction; migration 0169)
 *   - villaIds     → one active ownership_shares row per villa, org-stamped
 *                    and refused if the villa is not in the caller's org
 *   - invitePortal → honest audit-only invite record (the real portal grant
 *                    lands via Domain-2 team_invitations.owner_id, mig 0168)
 * ------------------------------------------------------------------ */

const onboardOwnerInput = z.object({
  displayName: z.string().min(2).max(160),
  legalName: z.string().max(200).optional().default(""),
  email: z.string().email().optional().or(z.literal("")),
  taxResidency: z.string().max(80).optional().default(""),
  commissionPct: z.coerce.number().min(0).max(100),
  villaIds: z.array(z.string().uuid()).max(200).default([]),
  invitePortal: z.boolean().default(false),
});

export async function onboardOwnerAction(
  input: z.infer<typeof onboardOwnerInput>,
): Promise<ActionResult & { ownerId?: string }> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = onboardOwnerInput.safeParse(input);
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
  // TENANCY: the new shares are org-scoped; villas are validated against
  // this org so a foreign villa can never be assigned to the new owner.
  const organizationId = await requireOrgId();

  // Validate the chosen villas BEFORE creating the owner — every villa must
  // exist and belong to the caller's org (via its project). Refuse the whole
  // submission on any cross-org / unknown villa rather than silently skip it.
  const villaIds = [...new Set(d.villaIds)];
  let validVillas: { id: string; projectId: string }[] = [];
  if (villaIds.length > 0) {
    validVillas = await db
      .select({ id: villas.id, projectId: villas.projectId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(
        and(
          inArray(villas.id, villaIds),
          eq(projects.organizationId, organizationId),
        ),
      );
    if (validVillas.length !== villaIds.length) {
      return {
        ok: false,
        error: "One or more selected villas are not available in your organisation.",
      };
    }
  }

  const commissionFraction = (d.commissionPct / 100).toFixed(4);

  const [ownerRow] = await db
    .insert(owners)
    .values({
      type: "individual",
      displayName: d.displayName,
      legalName: d.legalName && d.legalName !== "" ? d.legalName : null,
      email: d.email && d.email !== "" ? d.email : null,
      taxResidency: d.taxResidency && d.taxResidency !== "" ? d.taxResidency : null,
      status: "onboarding",
      commissionPct: commissionFraction,
    })
    .returning({ id: owners.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.create",
    entityType: "owner",
    entityId: ownerRow.id,
    after: {
      displayName: d.displayName,
      email: d.email || null,
      commissionPct: commissionFraction,
      villaCount: validVillas.length,
    },
  });

  // One active villa-direct ownership_share per assigned villa, org-stamped.
  const today = new Date().toISOString().slice(0, 10);
  for (const v of validVillas) {
    const [shareRow] = await db
      .insert(ownershipShares)
      .values({
        ownerId: ownerRow.id,
        organizationId,
        villaId: v.id,
        projectId: v.projectId,
        sharePercent: "100",
        model: "individual",
        startsOn: today,
        status: "active",
      })
      .returning({ id: ownershipShares.id });
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "share.create",
      entityType: "ownership_share",
      entityId: shareRow.id,
      after: { ownerId: ownerRow.id, villaId: v.id, sharePercent: 100, source: "onboard_wizard" },
    });
  }

  // Honest portal-invite intent — recorded as an audit event (same path the
  // owner-card "Invite to portal" uses). NOT a fake success: the real grant
  // is issued through the Domain-2 invitation flow.
  if (d.invitePortal) {
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "owner.portal_invite",
      entityType: "owner",
      entityId: ownerRow.id,
      after: { email: d.email || null, source: "onboard_wizard" },
    });
  }

  revalidatePath("/dashboard/owners");
  revalidatePath(`/dashboard/owners/${ownerRow.id}`);
  return { ok: true, ownerId: ownerRow.id };
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
 * mgmt-03 cabinet wiring.
 *
 * recordCommissionChangeAction now PERSISTS the operator commission on
 * owners.commission_pct (migration 0169) in addition to the append-only
 * audit event — the statement engines read this per-owner rate (falling
 * back to the 20% platform default when NULL). The portal-invite + insight
 * shells stay audit-only here (the real portal grant lands via the Domain-2
 * team_invitations.owner_id path, migration 0168).
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

  // Persist as a FRACTION in [0,1] (0.20 = 20%), shape-compatible with
  // owner_statements.operator_commission_pct so the statement engines read
  // it directly. The UI collects a 0-100 percent.
  const commissionFraction = (d.commissionPct / 100).toFixed(4);

  const me = await getCurrentAppUser();
  await db
    .update(owners)
    .set({ commissionPct: commissionFraction })
    .where(eq(owners.id, d.ownerId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner.commission_change",
    entityType: "owner",
    entityId: d.ownerId,
    before: { commissionPct: owner.commissionPct },
    after: {
      commissionPct: commissionFraction,
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

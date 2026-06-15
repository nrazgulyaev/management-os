"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  ownerStayPolicies,
  ownerStayRequests,
  villaEquivalenceGroups,
  villaEquivalenceGroupMembers,
} from "@/lib/db/schema/owner-stays";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  addEquivalenceMemberSchema,
  archiveOwnerStayPolicySchema,
  createEquivalenceGroupSchema,
  createOwnerStayPolicySchema,
  createOwnerStayRequestSchema,
  ownerStayIdSchema,
  reviewOwnerStayRequestSchema,
} from "./schema";
import {
  calculateOwnerStayCharges,
  estimateOwnerStayRequest,
} from "./services";
import {
  queueOwnerStayNotification,
  queueOwnerStayStatusChangedNotification,
} from "./notifications";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Owner stay policies (admin)
// -----------------------------------------------------------------------------

function parsePolicyForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    policyName: raw.policyName,
    projectId: raw.projectId || null,
    villaId: raw.villaId || null,
    freeNightsPerYear: raw.freeNightsPerYear
      ? Number(raw.freeNightsPerYear)
      : 14,
    freeNightsApplyToPeak:
      raw.freeNightsApplyToPeak === "on" || raw.freeNightsApplyToPeak === "true",
    requiresApproval:
      raw.requiresApproval === "on" || raw.requiresApproval === "true",
    allowDisplacingGuestBookings:
      raw.allowDisplacingGuestBookings === "on" ||
      raw.allowDisplacingGuestBookings === "true",
    relocationAllowed:
      raw.relocationAllowed === "on" || raw.relocationAllowed === "true",
    operationalCostModel: raw.operationalCostModel || "actual_costs",
    fixedOperationalCostMinor: raw.fixedOperationalCostMinor
      ? Number(raw.fixedOperationalCostMinor)
      : null,
    currency: raw.currency || null,
    compensationModel:
      raw.compensationModel || "management_fee_on_expected_gross",
    compensationPercent: raw.compensationPercent
      ? Number(raw.compensationPercent)
      : null,
    fixedCompensationMinor: raw.fixedCompensationMinor
      ? Number(raw.fixedCompensationMinor)
      : null,
  };
}

export async function createOwnerStayPolicyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { policyId?: string }> {
  await requirePermission("owner_stay.approve");
  const parsed = createOwnerStayPolicySchema.safeParse(parsePolicyForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(ownerStayPolicies)
    .values({
      policyName: parsed.data.policyName,
      projectId: parsed.data.projectId ?? null,
      villaId: parsed.data.villaId ?? null,
      freeNightsPerYear: parsed.data.freeNightsPerYear,
      freeNightsApplyToPeak: parsed.data.freeNightsApplyToPeak ?? false,
      requiresApproval: parsed.data.requiresApproval ?? true,
      allowDisplacingGuestBookings:
        parsed.data.allowDisplacingGuestBookings ?? false,
      relocationAllowed: parsed.data.relocationAllowed ?? true,
      operationalCostModel: parsed.data.operationalCostModel,
      fixedOperationalCostMinor: parsed.data.fixedOperationalCostMinor ?? null,
      currency: parsed.data.currency ?? null,
      compensationModel: parsed.data.compensationModel,
      compensationPercent:
        parsed.data.compensationPercent != null
          ? String(parsed.data.compensationPercent)
          : null,
      fixedCompensationMinor: parsed.data.fixedCompensationMinor ?? null,
    })
    .returning({ id: ownerStayPolicies.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.policy.create",
    entityType: "owner_stay_policy",
    entityId: row!.id,
    after: { policyName: parsed.data.policyName },
  });
  revalidatePath("/dashboard/owner-stays/policies");
  return { ok: true, policyId: row!.id };
}

export async function archiveOwnerStayPolicyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_stay.approve");
  const parsed = archiveOwnerStayPolicySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing policy id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  await db
    .update(ownerStayPolicies)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(ownerStayPolicies.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.policy.archive",
    entityType: "owner_stay_policy",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/owner-stays/policies");
  return { ok: true };
}

// Stage 10.E.3 — full-policy edit (audit found Add but no Edit).
// Same parse path as createOwnerStayPolicyAction, then a complete
// re-set of the policy row by id.
export async function updateOwnerStayPolicyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_stay.approve");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing policy id." };
  const parsed = createOwnerStayPolicySchema.safeParse(parsePolicyForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;
  const [row] = await db
    .update(ownerStayPolicies)
    .set({
      policyName: d.policyName,
      projectId: d.projectId ?? null,
      villaId: d.villaId ?? null,
      freeNightsPerYear: d.freeNightsPerYear,
      freeNightsApplyToPeak: d.freeNightsApplyToPeak ?? false,
      requiresApproval: d.requiresApproval ?? true,
      allowDisplacingGuestBookings: d.allowDisplacingGuestBookings ?? false,
      relocationAllowed: d.relocationAllowed ?? true,
      operationalCostModel: d.operationalCostModel,
      fixedOperationalCostMinor: d.fixedOperationalCostMinor ?? null,
      currency: d.currency ?? null,
      compensationModel: d.compensationModel,
      compensationPercent:
        d.compensationPercent != null ? String(d.compensationPercent) : null,
      fixedCompensationMinor: d.fixedCompensationMinor ?? null,
      updatedAt: new Date(),
    })
    .where(eq(ownerStayPolicies.id, id))
    .returning({ id: ownerStayPolicies.id });
  if (!row) return { ok: false, error: "Policy not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.policy.update",
    entityType: "owner_stay_policy",
    entityId: id,
    after: { policyName: d.policyName, freeNightsPerYear: d.freeNightsPerYear },
  });
  revalidatePath("/dashboard/owner-stays/policies");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Owner stay requests
// -----------------------------------------------------------------------------

async function ensureOwnerGrant(
  appUserId: string | null,
  ownerId: string,
): Promise<boolean> {
  if (!appUserId) return false;
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: appUsersOwners.id })
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.appUserId, appUserId),
        eq(appUsersOwners.ownerId, ownerId),
        eq(appUsersOwners.status, "active"),
      ),
    )
    .limit(1);
  return !!row;
}

export async function createOwnerStayRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { requestId?: string }> {
  await requirePermission("owner_stay.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = createOwnerStayRequestSchema.safeParse({
    ownerId: raw.ownerId,
    villaId: raw.villaId,
    requestedStart: raw.requestedStart,
    requestedEnd: raw.requestedEnd,
    guestsCount: raw.guestsCount ? Number(raw.guestsCount) : null,
    purpose: raw.purpose || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  // Owner must be granted for this app_user — RLS enforces this too, but
  // we check up-front so the UI gets a clean error.
  const grantOk = await ensureOwnerGrant(me?.id ?? null, parsed.data.ownerId);
  if (!grantOk) {
    return {
      ok: false,
      error: "You don't have an active grant on this owner.",
    };
  }

  const [v] = await db
    .select({
      id: villas.id,
      projectId: villas.projectId,
      organizationId: projects.organizationId,
    })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(villas.id, parsed.data.villaId))
    .limit(1);
  if (!v) return { ok: false, error: "Villa not found." };

  // Estimate snapshot at request time. Owner sees the same shape on detail.
  const ctx = await estimateOwnerStayRequest({
    ownerId: parsed.data.ownerId,
    villaId: parsed.data.villaId,
    requestedStart: parsed.data.requestedStart,
    requestedEnd: parsed.data.requestedEnd,
  });
  const charges = calculateOwnerStayCharges(ctx.estimate);

  // Status routing:
  //   - guest-booking conflict → requires_relocation (if policy allows
  //     relocation) else pending_admin_approval.
  //   - other-block conflict   → pending_admin_approval.
  //   - policy.requiresApproval → pending_admin_approval.
  //   - else → requested (will need admin approve to materialise).
  let status: string = "requested";
  let relocationRequired = false;
  if (ctx.hasGuestBookingConflict) {
    relocationRequired = true;
    status = ctx.policy?.relocationAllowed
      ? "requires_relocation"
      : "pending_admin_approval";
  } else if (ctx.hasAnyConflict) {
    status = "pending_admin_approval";
  } else if (ctx.policy?.requiresApproval) {
    status = "pending_admin_approval";
  }

  const year = Number(parsed.data.requestedStart.slice(0, 4));

  const [row] = await db
    .insert(ownerStayRequests)
    .values({
      organizationId: v.organizationId,
      ownerId: parsed.data.ownerId,
      requestedByAppUserId: me?.id ?? null,
      villaId: parsed.data.villaId,
      projectId: v.projectId,
      requestedStart: parsed.data.requestedStart,
      requestedEnd: parsed.data.requestedEnd,
      guestsCount: parsed.data.guestsCount ?? null,
      purpose: parsed.data.purpose ?? null,
      status,
      relocationRequired,
      relocationPossible: relocationRequired ? null : true,
      estimatedGrossRevenueMinor: charges.estimatedGrossRevenueMinor,
      estimatedManagementCompensationMinor:
        charges.estimatedManagementCompensationMinor,
      estimatedOperationalCostMinor: charges.estimatedOperationalCostMinor,
      estimatedTotalOwnerChargeMinor: charges.estimatedTotalOwnerChargeMinor,
      currency: charges.currency,
      allowanceYear: year,
      allowanceNightsApplied: charges.allowanceNightsApplied,
      billableNights: charges.billableNights,
    })
    .returning({ id: ownerStayRequests.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.request.create",
    entityType: "owner_stay_request",
    entityId: row!.id,
    after: {
      ownerId: parsed.data.ownerId,
      villaId: parsed.data.villaId,
      status,
      hasGuestBookingConflict: ctx.hasGuestBookingConflict,
    },
  });

  // V9C — owner-facing notifications (best-effort).
  try {
    await queueOwnerStayNotification(row!.id, "owner_stay.request_received");
    if (status === "requires_relocation") {
      await queueOwnerStayNotification(
        row!.id,
        "owner_stay.relocation_pending",
      );
    }
  } catch {
    // Never block request creation on a notification queue failure.
  }

  revalidatePath("/owner/stays");
  revalidatePath("/dashboard/owner-stays");
  return { ok: true, requestId: row!.id };
}

export async function cancelOwnerStayRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Owner can cancel their own pending/requested rows; admin can cancel any.
  const parsed = ownerStayIdSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(ownerStayRequests)
    .where(eq(ownerStayRequests.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Request not found." };
  if (
    before.status !== "requested" &&
    before.status !== "pending_admin_approval" &&
    before.status !== "availability_check" &&
    before.status !== "requires_relocation"
  ) {
    return {
      ok: false,
      error: `Cannot cancel a request in status ${before.status}.`,
    };
  }

  // Owner self-cancel: must hold an active grant on the owner_id.
  const isOwner = await ensureOwnerGrant(me?.id ?? null, before.ownerId);
  if (!isOwner) {
    // Otherwise must be internal admin — and only within their OWN org
    // (TENANCY: a cross-org request id reads as not-found on the admin path).
    await requirePermission("owner_stay.write");
    if (before.organizationId !== (await requireOrgId())) {
      return { ok: false, error: "Request not found." };
    }
  }

  await db
    .update(ownerStayRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(ownerStayRequests.id, parsed.data.id));

  // Cancel the associated calendar block (if any).
  if (before.createdCalendarBlockId) {
    await db
      .update(villaCalendarBlocks)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(villaCalendarBlocks.id, before.createdCalendarBlockId));
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.request.cancel",
    entityType: "owner_stay_request",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "cancelled" },
  });

  try {
    await queueOwnerStayStatusChangedNotification(
      parsed.data.id,
      before.status,
      "cancelled",
    );
  } catch {
    // ignore — cancel still succeeded.
  }

  revalidatePath("/owner/stays");
  revalidatePath("/dashboard/owner-stays");
  return { ok: true };
}

export async function approveOwnerStayRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { calendarBlockId?: string }> {
  await requirePermission("owner_stay.approve");
  const parsed = reviewOwnerStayRequestSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    decision: formData.get("decision") || "approved",
  });
  if (!parsed.success || parsed.data.decision !== "approved") {
    return { ok: false, error: "Use the reject action to reject." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: resolve the caller's org up front and verify the request belongs
  // to it — otherwise an operator in org A could approve org B's request (a
  // cross-org write-IDOR that mints a calendar block on the other org's villa).
  const organizationId = await requireOrgId();

  const [req] = await db
    .select()
    .from(ownerStayRequests)
    .where(eq(ownerStayRequests.id, parsed.data.id))
    .limit(1);
  if (!req || req.organizationId !== organizationId) {
    return { ok: false, error: "Request not found." };
  }
  if (
    req.status !== "requested" &&
    req.status !== "pending_admin_approval" &&
    req.status !== "availability_check" &&
    req.status !== "requires_relocation"
  ) {
    return { ok: false, error: `Cannot approve from status ${req.status}.` };
  }

  // Materialise the calendar block.
  const startsAt = new Date(`${req.requestedStart as unknown as string}T00:00:00.000Z`);
  const endsAt = new Date(`${req.requestedEnd as unknown as string}T00:00:00.000Z`);
  const [block] = await db
    .insert(villaCalendarBlocks)
    .values({
      organizationId,
      villaId: req.villaId,
      projectId: req.projectId,
      blockType: "owner_stay",
      sourceType: "owner_stay_request",
      sourceId: req.id,
      startsAt,
      endsAt,
      title: `Owner stay`,
      description: req.purpose,
      status: "active",
      ownerVisible: true,
      guestVisible: false,
      createdBy: me?.id ?? null,
    })
    .returning({ id: villaCalendarBlocks.id });

  await db
    .update(ownerStayRequests)
    .set({
      status: "approved",
      adminDecision: "approved",
      adminNotes: parsed.data.adminNotes ?? req.adminNotes,
      approvedBy: me?.id ?? null,
      approvedAt: new Date(),
      createdCalendarBlockId: block!.id,
      updatedAt: new Date(),
    })
    .where(eq(ownerStayRequests.id, req.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.request.approve",
    entityType: "owner_stay_request",
    entityId: req.id,
    before: { status: req.status },
    after: { status: "approved", calendarBlockId: block!.id },
  });

  try {
    await queueOwnerStayStatusChangedNotification(
      req.id,
      req.status,
      "approved",
    );
  } catch {
    // ignore — approval still succeeded.
  }

  revalidatePath("/owner/stays");
  revalidatePath("/dashboard/owner-stays");
  revalidatePath("/dashboard/availability");
  return { ok: true, calendarBlockId: block!.id };
}

export async function rejectOwnerStayRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_stay.approve");
  const parsed = reviewOwnerStayRequestSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    decision: formData.get("decision") || "rejected",
  });
  if (!parsed.success || parsed.data.decision !== "rejected") {
    return { ok: false, error: "Use the approve action to approve." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: verify the request belongs to the caller's org (cross-org reject
  // would otherwise be possible by typed id).
  const organizationId = await requireOrgId();

  const [req] = await db
    .select()
    .from(ownerStayRequests)
    .where(eq(ownerStayRequests.id, parsed.data.id))
    .limit(1);
  if (!req || req.organizationId !== organizationId) {
    return { ok: false, error: "Request not found." };
  }
  if (req.status === "approved" || req.status === "completed") {
    return { ok: false, error: `Cannot reject ${req.status} request.` };
  }

  await db
    .update(ownerStayRequests)
    .set({
      status: "rejected",
      adminDecision: "rejected",
      adminNotes: parsed.data.adminNotes ?? req.adminNotes,
      rejectedBy: me?.id ?? null,
      rejectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ownerStayRequests.id, req.id));

  // If a block was somehow already materialised, cancel it.
  if (req.createdCalendarBlockId) {
    await db
      .update(villaCalendarBlocks)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(villaCalendarBlocks.id, req.createdCalendarBlockId));
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.request.reject",
    entityType: "owner_stay_request",
    entityId: req.id,
    before: { status: req.status },
    after: { status: "rejected" },
  });

  try {
    await queueOwnerStayStatusChangedNotification(
      req.id,
      req.status,
      "rejected",
    );
  } catch {
    // ignore — rejection still succeeded.
  }

  revalidatePath("/owner/stays");
  revalidatePath("/dashboard/owner-stays");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Equivalence groups
// -----------------------------------------------------------------------------

export async function createEquivalenceGroupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { groupId?: string }> {
  await requirePermission("relocation.manage");
  const parsed = createEquivalenceGroupSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    projectId: formData.get("projectId") || null,
    description: formData.get("description") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(villaEquivalenceGroups)
    .values({
      name: parsed.data.name,
      projectId: parsed.data.projectId ?? null,
      description: parsed.data.description ?? null,
    })
    .returning({ id: villaEquivalenceGroups.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.group.create",
    entityType: "villa_equivalence_group",
    entityId: row!.id,
    after: { name: parsed.data.name },
  });
  revalidatePath("/dashboard/owner-stays/equivalence-groups");
  return { ok: true, groupId: row!.id };
}

export async function addEquivalenceMemberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("relocation.manage");
  const raw = Object.fromEntries(formData.entries());
  const parsed = addEquivalenceMemberSchema.safeParse({
    groupId: raw.groupId,
    villaId: raw.villaId,
    qualityRank: raw.qualityRank ? Number(raw.qualityRank) : 100,
    notes: raw.notes || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  await db
    .insert(villaEquivalenceGroupMembers)
    .values({
      groupId: parsed.data.groupId,
      villaId: parsed.data.villaId,
      qualityRank: parsed.data.qualityRank,
      notes: parsed.data.notes ?? null,
    })
    .onConflictDoNothing({
      target: [
        villaEquivalenceGroupMembers.groupId,
        villaEquivalenceGroupMembers.villaId,
      ],
    });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.group.add_member",
    entityType: "villa_equivalence_group",
    entityId: parsed.data.groupId,
    after: {
      villaId: parsed.data.villaId,
      qualityRank: parsed.data.qualityRank,
    },
  });
  revalidatePath("/dashboard/owner-stays/equivalence-groups");
  return { ok: true };
}

// Equivalence-group members can be added but never hard-removed. This flips the
// member's existing status column to "archived" (the relocation engine already
// filters on status='active', so an archived member drops out of swap candidates).
// ORG-SCOPE: confirm the member's parent group belongs to this org (in-org
// project OR global null-project, matching listEquivalenceGroups/Members reads)
// before mutating, so a cross-org member id is a no-op not-found.
export async function removeEquivalenceMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("relocation.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing member id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Resolve the member + its parent group's org scope. Group is in-org when its
  // project is in this org, OR when it is global (null projectId).
  const [member] = await db
    .select({
      id: villaEquivalenceGroupMembers.id,
      groupId: villaEquivalenceGroupMembers.groupId,
      villaId: villaEquivalenceGroupMembers.villaId,
      status: villaEquivalenceGroupMembers.status,
      groupProjectId: villaEquivalenceGroups.projectId,
      projectOrgId: projects.organizationId,
    })
    .from(villaEquivalenceGroupMembers)
    .innerJoin(
      villaEquivalenceGroups,
      eq(villaEquivalenceGroups.id, villaEquivalenceGroupMembers.groupId),
    )
    .leftJoin(projects, eq(projects.id, villaEquivalenceGroups.projectId))
    .where(
      and(
        eq(villaEquivalenceGroupMembers.id, id),
        or(
          eq(projects.organizationId, organizationId),
          isNull(villaEquivalenceGroups.projectId),
        ),
      ),
    )
    .limit(1);

  if (!member) return { ok: false, error: "Member not found." };

  await db
    .update(villaEquivalenceGroupMembers)
    .set({ status: "archived" })
    .where(eq(villaEquivalenceGroupMembers.id, member.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.group.remove_member",
    entityType: "villa_equivalence_group",
    entityId: member.groupId,
    before: { villaId: member.villaId, status: member.status },
    after: { villaId: member.villaId, status: "archived" },
  });
  revalidatePath("/dashboard/owner-stays/equivalence-groups");
  return { ok: true };
}

// Stage 10.E.3 — equivalence group edit + archive (audit found Add but
// no Edit/Delete). Update accepts the same shape as create (name +
// description + projectId); archive flips status to "archived".
export async function updateEquivalenceGroupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("relocation.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing group id." };
  const parsed = createEquivalenceGroupSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    projectId: formData.get("projectId") || null,
    description: formData.get("description") || null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(villaEquivalenceGroups)
    .set({
      name: parsed.data.name,
      projectId: parsed.data.projectId ?? null,
      description: parsed.data.description ?? null,
    })
    .where(eq(villaEquivalenceGroups.id, id))
    .returning({ id: villaEquivalenceGroups.id });
  if (!row) return { ok: false, error: "Group not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.group.update",
    entityType: "villa_equivalence_group",
    entityId: id,
    after: { name: parsed.data.name },
  });
  revalidatePath("/dashboard/owner-stays/equivalence-groups");
  return { ok: true };
}

export async function archiveEquivalenceGroupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("relocation.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing group id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(villaEquivalenceGroups)
    .set({ status: "archived" })
    .where(eq(villaEquivalenceGroups.id, id))
    .returning({ id: villaEquivalenceGroups.id });
  if (!row) return { ok: false, error: "Group not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "relocation.group.archive",
    entityType: "villa_equivalence_group",
    entityId: id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/owner-stays/equivalence-groups");
  return { ok: true };
}

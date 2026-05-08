"use server";

/**
 * Stage 9.D — owner team management actions.
 *
 * Four server actions:
 *   inviteTeamMemberAction       — create pending invitation + queue email
 *   acceptInvitationAction       — recipient accepts → provision user + role
 *   resendInvitationAction       — bump resent_count + re-queue email
 *   revokeAccessAction           — disable an app_user's role grants
 *
 * Permission gate: every mutating action requires `users.write`.
 *
 * Org context: actions resolve the inviter's org via the
 * ARCONIQUE_DEFAULT fallback (same compromise as other Stage 7.E
 * surfaces until tenant subdomain resolution lands at runtime).
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { teamInvitations } from "@/lib/db/schema/team-invitations";
import { appUsers } from "@/lib/db/schema/identity";
import { appUserRoles } from "@/lib/db/schema/role-cabinets";
import { auditEvents } from "@/lib/db/schema/audit";
import { requirePermission } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendDevOsEmail } from "@/lib/development/server/email";
import { env } from "@/lib/env";

// 7-day default expiration window. Operators can resend before then.
const INVITE_EXPIRY_DAYS = 7;

// ============================================================================
// Helpers
// ============================================================================

function newToken(): string {
  // 32 bytes -> ~43 url-safe chars; collision-resistant for one-shot
  // invitation tokens.
  return randomBytes(32).toString("base64url");
}

function inviteUrl(token: string): string {
  const base = env.server.APP_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/accept-invitation/${encodeURIComponent(token)}`;
}

const VALID_ROLES = [
  "marketing_staff",
  "qs_analyst",
  "procurement_manager",
  "warehouse_manager",
  "site_supervisor",
  "sales_manager",
  "project_manager",
  "cfo_accountant",
  "executive_ceo",
  "admin",
] as const;

// ============================================================================
// inviteTeamMemberAction
// ============================================================================

const inviteSchema = z.object({
  email: z.string().email().max(255),
  roleKey: z.enum(VALID_ROLES),
  scope: z.enum(["company_wide", "project_specific"]).default("company_wide"),
  scopedProjectId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export type InviteResult =
  | { ok: true; invitationId: string; token: string; emailQueued: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function inviteTeamMemberAction(
  input: z.input<typeof inviteSchema>,
): Promise<InviteResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: "Invalid input.", fieldErrors };
  }
  const data = parsed.data;
  if (data.scope === "project_specific" && !data.scopedProjectId) {
    return {
      ok: false,
      error: "scope=project_specific requires scopedProjectId",
      fieldErrors: { scopedProjectId: "Required for project-specific scope" },
    };
  }

  const db = requireDb();
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) return { ok: false, error: "No organization context available." };

  const now = new Date();
  const token = newToken();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 86400 * 1000);

  // Idempotent: refuse to overlap with an existing pending invite. The
  // partial unique index in the migration enforces this at the DB layer
  // too, so a race condition surfaces as a constraint violation.
  const existingPending = await db
    .select({ id: teamInvitations.id })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.organizationId, org.id),
        eq(teamInvitations.email, data.email.toLowerCase()),
        eq(teamInvitations.status, "pending"),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (existingPending) {
    return {
      ok: false,
      error: "An active invitation for that email already exists. Resend or revoke it first.",
      fieldErrors: { email: "Active invitation already pending" },
    };
  }

  let invitationId: string;
  try {
    const [row] = await db
      .insert(teamInvitations)
      .values({
        organizationId: org.id,
        email: data.email.toLowerCase(),
        roleKey: data.roleKey,
        scope: data.scope,
        scopedProjectId: data.scopedProjectId ?? null,
        invitedByUserId: me.id,
        token,
        status: "pending",
        expiresAt,
        notes: data.notes ?? null,
      })
      .returning({ id: teamInvitations.id });
    invitationId = row.id;
  } catch (err) {
    return {
      ok: false,
      error: `Could not create invitation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Queue the email through the existing dry-run-aware helper.
  const url = inviteUrl(token);
  const bodyText =
    `Hi,\n\n` +
    `You've been invited to join ${org.name} on Arconique Management OS as ${data.roleKey.replace(/_/g, " ")}.\n\n` +
    `Accept the invitation here:\n${url}\n\n` +
    `This link expires in ${INVITE_EXPIRY_DAYS} days. If you didn't expect this invitation you can ignore this email.\n\n` +
    `— Arconique`;
  const emailResult = await sendDevOsEmail({
    to: data.email,
    subject: `You're invited to join ${org.name} on Arconique`,
    bodyText,
    bodyHtml: `<p>${bodyText.replace(/\n/g, "<br/>")}</p>`,
    metadata: {
      triggerEntityType: "team_invitation",
      triggerEntityId: invitationId,
      templateName: "team_invitation_initial",
    },
  }).catch(() => ({ status: "failed" as const, deliveryId: "", errorReason: "exception" }));

  await db
    .update(teamInvitations)
    .set({ lastEmailSentAt: now, updatedAt: now })
    .where(eq(teamInvitations.id, invitationId));

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "team.invitation.created",
    entityType: "team_invitation",
    entityId: invitationId,
    after: {
      email: data.email,
      role_key: data.roleKey,
      scope: data.scope,
      organization_id: org.id,
    },
  });

  revalidatePath("/dashboard/settings/team");
  return {
    ok: true,
    invitationId,
    token,
    emailQueued: emailResult.status !== "failed",
  };
}

// ============================================================================
// acceptInvitationAction
// ============================================================================

const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200).optional(),
  fullName: z.string().min(1).max(200).optional(),
});

export type AcceptResult =
  | { ok: true; appUserId: string; redirectUrl: string }
  | { ok: false; error: string };

export async function acceptInvitationAction(
  input: z.input<typeof acceptSchema>,
): Promise<AcceptResult> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const db = requireDb();
  const now = new Date();

  const invitation = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.token, parsed.data.token),
        eq(teamInvitations.status, "pending"),
        gt(teamInvitations.expiresAt, now),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!invitation) {
    return {
      ok: false,
      error: "This invitation link is invalid, expired, or already used.",
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "Sign-up service is temporarily unavailable." };
  }

  // Look for an existing auth user with this email; create one if missing.
  // We don't expose whether the email already had an auth account — same
  // anti-enum hardening as the public sign-up endpoint.
  let authUserId: string | null = null;
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) {
    return { ok: false, error: "Could not query the auth directory." };
  }
  const found = list.data.users.find(
    (u) => u.email?.toLowerCase() === invitation.email.toLowerCase(),
  );
  if (found) {
    authUserId = found.id;
    // If the user provided a password (treating accept as set-password),
    // patch it. Skip silently if no password — they'll log in with whatever
    // they had previously.
    if (parsed.data.password) {
      await admin.auth.admin.updateUserById(found.id, {
        password: parsed.data.password,
      });
    }
  } else {
    if (!parsed.data.password) {
      return {
        ok: false,
        error: "A password is required to create your account.",
      };
    }
    const created = await admin.auth.admin.createUser({
      email: invitation.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        invitation_id: invitation.id,
        full_name: parsed.data.fullName ?? null,
      },
    });
    if (created.error || !created.data.user) {
      return {
        ok: false,
        error: "Could not create the account. Please try again.",
      };
    }
    authUserId = created.data.user.id;
  }

  if (!authUserId) {
    return { ok: false, error: "Could not resolve auth user." };
  }

  // Atomically provision app_users row + grant the invitation's role.
  // We always grant the ROLE_KEY recorded on the invitation, NOT super_admin.
  // Internal-user bypass (via user_roles) is reserved for founders.
  // provision_app_user takes (auth_user_id, email, full_name,
  // role_key_internal, role_key_cabinet). For invitees we DON'T grant
  // user_roles.super_admin — pass NULL for the internal slot. The
  // function tolerates NULL there (skips assign_user_role).
  const provisionResult = await db.execute<{ provision_app_user: string }>(
    sql`SELECT public.provision_app_user(
      ${authUserId}::uuid,
      ${invitation.email}::text,
      ${parsed.data.fullName ?? invitation.email}::text,
      NULL::text,
      ${invitation.roleKey}::text
    ) AS provision_app_user`,
  );
  const provisionRows = (
    Array.isArray(provisionResult)
      ? provisionResult
      : ((provisionResult as { rows?: Array<{ provision_app_user: string }> }).rows ?? [])
  ) as Array<{ provision_app_user: string }>;
  const appUserId = provisionRows[0]?.provision_app_user;
  if (!appUserId) {
    return { ok: false, error: "Could not provision your account. Please contact support." };
  }

  // Mark invitation accepted.
  await db
    .update(teamInvitations)
    .set({
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: appUserId,
      updatedAt: now,
    })
    .where(eq(teamInvitations.id, invitation.id));

  await db.insert(auditEvents).values({
    actorUserId: appUserId,
    action: "team.invitation.accepted",
    entityType: "team_invitation",
    entityId: invitation.id,
    after: {
      app_user_id: appUserId,
      role_key: invitation.roleKey,
    },
  });

  revalidatePath("/dashboard/settings/team");
  return {
    ok: true,
    appUserId,
    redirectUrl: "/login?onboarded=1&email=" + encodeURIComponent(invitation.email),
  };
}

// ============================================================================
// resendInvitationAction
// ============================================================================

export async function resendInvitationAction(
  invitationId: string,
): Promise<{ ok: true; emailQueued: boolean } | { ok: false; error: string }> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const db = requireDb();
  const inv = await db
    .select()
    .from(teamInvitations)
    .where(eq(teamInvitations.id, invitationId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!inv) return { ok: false, error: "Invitation not found." };
  if (inv.status !== "pending") {
    return { ok: false, error: `Cannot resend — status is ${inv.status}.` };
  }

  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  const orgName = org?.name ?? "your team";
  const url = inviteUrl(inv.token);
  const bodyText =
    `Hi,\n\nThis is a reminder of your invitation to join ${orgName} on Arconique.\n\n` +
    `Accept the invitation here:\n${url}\n\n` +
    `If you no longer want to accept, you can ignore this email.\n\n— Arconique`;
  const result = await sendDevOsEmail({
    to: inv.email,
    subject: `Reminder: invitation to join ${orgName}`,
    bodyText,
    bodyHtml: `<p>${bodyText.replace(/\n/g, "<br/>")}</p>`,
    metadata: {
      triggerEntityType: "team_invitation",
      triggerEntityId: invitationId,
      templateName: "team_invitation_reminder",
    },
  }).catch(() => ({ status: "failed" as const, deliveryId: "", errorReason: "exception" }));

  const now = new Date();
  await db
    .update(teamInvitations)
    .set({
      resentCount: inv.resentCount + 1,
      lastEmailSentAt: now,
      updatedAt: now,
    })
    .where(eq(teamInvitations.id, invitationId));

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "team.invitation.resent",
    entityType: "team_invitation",
    entityId: invitationId,
  });

  revalidatePath("/dashboard/settings/team");
  return { ok: true, emailQueued: result.status !== "failed" };
}

// ============================================================================
// revokeAccessAction — revoke a pending invitation OR disable an active user
// ============================================================================

const revokeSchema = z.object({
  invitationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

export async function revokeAccessAction(
  input: z.input<typeof revokeSchema>,
): Promise<{ ok: true; kind: "invitation" | "user" } | { ok: false; error: string }> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!parsed.data.invitationId && !parsed.data.userId) {
    return { ok: false, error: "Provide invitationId or userId." };
  }

  const db = requireDb();
  const now = new Date();

  if (parsed.data.invitationId) {
    await db
      .update(teamInvitations)
      .set({
        status: "revoked",
        revokedAt: now,
        revokedByUserId: me.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(teamInvitations.id, parsed.data.invitationId),
          eq(teamInvitations.status, "pending"),
        ),
      );
    await db.insert(auditEvents).values({
      actorUserId: me.id,
      action: "team.invitation.revoked",
      entityType: "team_invitation",
      entityId: parsed.data.invitationId,
    });
    revalidatePath("/dashboard/settings/team");
    return { ok: true, kind: "invitation" };
  }

  // userId path — disable all active app_user_roles for that user.
  // Refuse if it would leave zero active admins (last-admin invariant).
  const userId = parsed.data.userId!;
  if (userId === me.id) {
    return { ok: false, error: "You cannot revoke your own access." };
  }
  const remainingAdmins = await db
    .select({ id: appUserRoles.id })
    .from(appUserRoles)
    .where(
      and(
        eq(appUserRoles.roleKey, "admin"),
        eq(appUserRoles.isActive, true),
      ),
    );
  // Count active-admin grants belonging to OTHER users.
  const otherAdmins = await db
    .select({ id: appUserRoles.id })
    .from(appUserRoles)
    .where(
      and(
        eq(appUserRoles.roleKey, "admin"),
        eq(appUserRoles.isActive, true),
      ),
    )
    .then((rows) => rows.filter((r) => r.id !== userId));
  if (remainingAdmins.length > 0 && otherAdmins.length === 0) {
    return {
      ok: false,
      error: "Cannot revoke the last active admin. Promote another user first.",
    };
  }

  await db
    .update(appUserRoles)
    .set({
      isActive: false,
      revokedAt: now,
      revokedBy: me.id,
      revocationReason: "team admin revoke",
      updatedAt: now,
    })
    .where(
      and(
        eq(appUserRoles.userId, userId),
        eq(appUserRoles.isActive, true),
      ),
    );

  await db
    .update(appUsers)
    .set({ status: "suspended", updatedAt: now })
    .where(eq(appUsers.id, userId));

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "team.user.revoked",
    entityType: "app_user",
    entityId: userId,
  });

  revalidatePath("/dashboard/settings/team");
  return { ok: true, kind: "user" };
}

// ============================================================================
// updateUserRoleAction (Stage 9.E)
// ============================================================================

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  newRoleKey: z.enum(VALID_ROLES),
  scope: z.enum(["company_wide", "project_specific"]).default("company_wide"),
  scopedProjectId: z.string().uuid().nullable().optional(),
  reason: z.string().max(500).optional(),
});

export type UpdateRoleResult =
  | { ok: true; previousRoleKey: string | null; newRoleKey: string }
  | { ok: false; error: string };

/**
 * Replace the user's active cabinet grant(s) in `app_user_roles` with a
 * single new active grant. The previous grant(s) are soft-deleted
 * (`is_active=false`, `revoked_at`, `revoked_by`, `revocation_reason`)
 * so the historical trail is preserved.
 *
 * Scope: this action ONLY touches `app_user_roles` (the cabinet-routing
 * table). It deliberately does NOT mutate `user_roles` — that table
 * controls `is_internal_user()` (RLS bypass) and is reserved for
 * founder / audit-bot accounts. A future "promote to internal" action
 * would be a separate, more privileged operation.
 *
 * Invariants enforced:
 *   - Permission: `roles.assign` (super_admin only).
 *   - Self-change refused — owner needs another admin to change their own role.
 *   - Cannot demote the last active admin (would lock the org out).
 */
export async function updateUserRoleAction(
  input: z.input<typeof updateRoleSchema>,
): Promise<UpdateRoleResult> {
  await requirePermission("roles.assign");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  if (data.scope === "project_specific" && !data.scopedProjectId) {
    return { ok: false, error: "scope=project_specific requires scopedProjectId" };
  }
  if (data.userId === me.id) {
    return { ok: false, error: "You cannot change your own role. Ask another admin." };
  }

  const db = requireDb();

  // Confirm target user exists.
  const target = await db
    .select({ id: appUsers.id, status: appUsers.status, email: appUsers.email })
    .from(appUsers)
    .where(eq(appUsers.id, data.userId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!target) return { ok: false, error: "User not found." };

  // Last-active-admin invariant: if the target currently has admin AND
  // the new role is NOT admin, refuse if no other active admin remains.
  const currentGrants = await db
    .select({
      id: appUserRoles.id,
      roleKey: appUserRoles.roleKey,
    })
    .from(appUserRoles)
    .where(
      and(eq(appUserRoles.userId, data.userId), eq(appUserRoles.isActive, true)),
    );
  const targetCurrentlyAdmin = currentGrants.some((g) => g.roleKey === "admin");
  if (targetCurrentlyAdmin && data.newRoleKey !== "admin") {
    const otherActiveAdmins = await db
      .select({ userId: appUserRoles.userId })
      .from(appUserRoles)
      .where(
        and(
          eq(appUserRoles.roleKey, "admin"),
          eq(appUserRoles.isActive, true),
        ),
      )
      .then((rows) => rows.filter((r) => r.userId !== data.userId));
    if (otherActiveAdmins.length === 0) {
      return {
        ok: false,
        error: "Cannot demote the last active admin. Promote another user to admin first.",
      };
    }
  }

  const previousRoleKey =
    currentGrants.find((g) => g.roleKey === "admin")?.roleKey ??
    currentGrants[0]?.roleKey ??
    null;
  const now = new Date();

  // Idempotent: if the user already has exactly the requested grant active,
  // skip the rewrite + audit.
  const alreadyHasNew = currentGrants.some(
    (g) => g.roleKey === data.newRoleKey,
  );
  if (alreadyHasNew && currentGrants.length === 1) {
    return { ok: true, previousRoleKey: data.newRoleKey, newRoleKey: data.newRoleKey };
  }

  // Revoke all existing active grants.
  if (currentGrants.length > 0) {
    await db
      .update(appUserRoles)
      .set({
        isActive: false,
        revokedAt: now,
        revokedBy: me.id,
        revocationReason: data.reason ?? "role change",
        updatedAt: now,
      })
      .where(
        and(
          eq(appUserRoles.userId, data.userId),
          eq(appUserRoles.isActive, true),
        ),
      );
  }

  // Insert the new grant.
  await db.insert(appUserRoles).values({
    userId: data.userId,
    roleKey: data.newRoleKey,
    scope: data.scope,
    scopedProjectId: data.scopedProjectId ?? null,
    isPrimary: true,
    isActive: true,
    grantedBy: me.id,
    notes: data.reason ?? null,
  });

  // If the user was suspended (e.g. via revokeAccessAction), bring them
  // back to active so the new grant takes effect.
  if (target.status === "suspended") {
    await db
      .update(appUsers)
      .set({ status: "active", updatedAt: now })
      .where(eq(appUsers.id, data.userId));
  }

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "team.user.role_changed",
    entityType: "app_user",
    entityId: data.userId,
    before: {
      role_keys: currentGrants.map((g) => g.roleKey),
    },
    after: {
      role_key: data.newRoleKey,
      scope: data.scope,
      scoped_project_id: data.scopedProjectId ?? null,
    },
    metadata: {
      reason: data.reason ?? null,
      target_email: target.email,
    },
  });

  revalidatePath("/dashboard/settings/team");
  revalidatePath(`/dashboard/settings/team/${data.userId}`);
  return { ok: true, previousRoleKey, newRoleKey: data.newRoleKey };
}

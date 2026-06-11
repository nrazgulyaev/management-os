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
 * Org context: STAB-4 — actions resolve the inviter's org from the
 * authenticated session's app_users row (via getCurrentAppUser's
 * organizationId). Previously this fell back to ARCONIQUE_DEFAULT
 * which would have leaked invites across tenants (every customer's
 * "Invite teammate" would have landed in the operator's org).
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb, rowsOf } from "@/lib/db/client";
import { teamInvitations } from "@/lib/db/schema/team-invitations";
import { organizations } from "@/lib/db/schema/saas";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { appUserRoles } from "@/lib/db/schema/role-cabinets";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { owners } from "@/lib/db/schema/ownership";
import { auditEvents } from "@/lib/db/schema/audit";
import { requirePermission } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendDevOsEmail } from "@/lib/development/server/email";
import { env } from "@/lib/env";
import {
  ASSIGNABLE_INTERNAL_ROLES,
  internalRoleLabel,
} from "./internal-roles";

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
  // DOMAIN 2 — owner taxonomy: inviting an owner must NOT force an internal
  // staff cabinet role. An `owner` invite carries an ownerId and creates a
  // real owner-portal grant (app_users_owners) on accept; the cabinet grant
  // it provisions is `investor_owner`.
  "owner",
] as const;

/**
 * DOMAIN 2 — whether an email was actually handed to a real delivery
 * provider. `sendDevOsEmail` returns status "sent" even in dry-run mode
 * (no RESEND_API_KEY / EMAIL_DRY_RUN defaulting to on), so the old
 * `status !== "failed"` check was NOT honest: it read "sent" for both real
 * and dry-run sends.
 *
 * This mirrors `isEmailDryRun()` + the Resend-config gate in
 * `lib/development/server/email.ts`: a real send requires EMAIL_DRY_RUN to be
 * explicitly off AND both Resend env values present. EMAIL_DRY_RUN defaults
 * to dry-run when unset.
 */
function emailIsDryRun(): boolean {
  // Mirror isEmailDryRun() in lib/development/server/email.ts: unset → on.
  const flag = process.env.EMAIL_DRY_RUN;
  if (flag === undefined) return true;
  return flag === "1" || flag.toLowerCase() === "true";
}

function emailReallyDelivered(status: string): boolean {
  if (status === "failed") return false;
  if (emailIsDryRun()) return false;
  return Boolean(env.server.RESEND_API_KEY && env.server.RESEND_FROM_EMAIL);
}

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
  | {
      ok: true;
      invitationId: string;
      token: string;
      /** Real provider delivery (false in dry-run / no RESEND key). */
      emailDelivered: boolean;
      /** The acceptance URL — always returned so dry-run callers can share it. */
      acceptUrl: string;
    }
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
  // DOMAIN 2 — owner invites must go through inviteOwnerToPortalAction (they
  // need an ownerId so accept can create the app_users_owners grant). The
  // generic staff invite never creates owner-portal access.
  if (data.roleKey === "owner") {
    return {
      ok: false,
      error: "Owner invitations are created from the owner record's “Invite to portal” action.",
      fieldErrors: { roleKey: "Use the owner portal invite flow" },
    };
  }

  const db = requireDb();
  // STAB-4 fix: scope the invite to the inviter's own organization.
  // Previously hardcoded to ARCONIQUE_DEFAULT, which would have made
  // every tenant's "Invite teammate" land in the operator's org.
  const orgId = me.organizationId;
  if (!orgId) return { ok: false, error: "No organization context available." };
  const orgRow = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!orgRow) return { ok: false, error: "Organization not found." };
  const org = { id: orgId, name: orgRow.name };

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
        ownerId: null,
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
    emailDelivered: emailReallyDelivered(emailResult.status),
    acceptUrl: url,
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

  // DOMAIN 2 — owner-portal invitations carry an ownerId + roleKey "owner".
  // The cabinet role we actually provision for an owner is `investor_owner`
  // (a real Dev-OS cabinet key); after provisioning we create the explicit
  // app_users_owners grant so owner-portal scoping (current_owner_ids) works.
  const isOwnerInvite = invitation.roleKey === "owner" && Boolean(invitation.ownerId);
  const cabinetRoleKey = isOwnerInvite ? "investor_owner" : invitation.roleKey;

  // Atomically provision app_users row + grant the invitation's cabinet role.
  // We never grant super_admin here. Internal-user bypass (via user_roles) is
  // reserved for founders, so the internal slot is always NULL.
  // Signature: (auth_user_id, email, full_name, organization_id,
  // role_key_internal, role_key_cabinet). The org_id comes from the
  // invitation row (NOT NULL FK).
  const provisionResult = await db.execute<{ provision_app_user: string }>(
    sql`SELECT public.provision_app_user(
      ${authUserId}::uuid,
      ${invitation.email}::text,
      ${parsed.data.fullName ?? invitation.email}::text,
      ${invitation.organizationId}::uuid,
      NULL::text,
      ${cabinetRoleKey}::text
    ) AS provision_app_user`,
  );
  const provisionRows = rowsOf<{ provision_app_user: string }>(provisionResult);
  const appUserId = provisionRows[0]?.provision_app_user;
  if (!appUserId) {
    return { ok: false, error: "Could not provision your account. Please contact support." };
  }

  // Owner-portal grant: link the new app_user to the owner record. Org-scoped
  // (the invitation's org). Idempotent — skip if an active grant already
  // exists for this (app_user, owner, owner_portal) tuple.
  if (isOwnerInvite && invitation.ownerId) {
    const existingGrant = await db
      .select({ id: appUsersOwners.id })
      .from(appUsersOwners)
      .where(
        and(
          eq(appUsersOwners.appUserId, appUserId),
          eq(appUsersOwners.ownerId, invitation.ownerId),
          eq(appUsersOwners.grantType, "owner_portal"),
          eq(appUsersOwners.status, "active"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (!existingGrant) {
      await db.insert(appUsersOwners).values({
        appUserId,
        ownerId: invitation.ownerId,
        organizationId: invitation.organizationId,
        grantType: "owner_portal",
        status: "active",
        grantedBy: invitation.invitedByUserId ?? null,
        notes: "Created on owner-portal invitation accept.",
      });
    }
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
      cabinet_role_key: cabinetRoleKey,
      owner_id: invitation.ownerId ?? null,
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
): Promise<
  | { ok: true; emailDelivered: boolean; acceptUrl: string }
  | { ok: false; error: string }
> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const db = requireDb();
  // STAB-4 fix: scope SELECT to the inviter's own organization so an
  // admin in tenant A cannot resend an invitation that lives in tenant
  // B's data. Previously this read was unscoped + the org lookup
  // hardcoded ARCONIQUE_DEFAULT.
  const inv = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.organizationId, me.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!inv) return { ok: false, error: "Invitation not found." };
  if (inv.status !== "pending") {
    return { ok: false, error: `Cannot resend — status is ${inv.status}.` };
  }

  const orgRow = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, me.organizationId))
    .limit(1)
    .then((rows) => rows[0]);
  const orgName = orgRow?.name ?? "your team";
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
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.organizationId, me.organizationId),
      ),
    );

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "team.invitation.resent",
    entityType: "team_invitation",
    entityId: invitationId,
  });

  revalidatePath("/dashboard/settings/team");
  return {
    ok: true,
    emailDelivered: emailReallyDelivered(result.status),
    acceptUrl: url,
  };
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
  const orgId = me.organizationId;
  if (!orgId) return { ok: false, error: "No organization context available." };

  if (parsed.data.invitationId) {
    // IDOR fix (defect 2): verify the invitation belongs to the caller's org
    // BEFORE revoking. The previous UPDATE filtered only by id + status, so an
    // admin in tenant A could revoke tenant B's pending invitation.
    const inv = await db
      .select({ id: teamInvitations.id })
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.id, parsed.data.invitationId),
          eq(teamInvitations.organizationId, orgId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (!inv) return { ok: false, error: "Invitation not found." };

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
          eq(teamInvitations.organizationId, orgId),
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
  const userId = parsed.data.userId!;
  if (userId === me.id) {
    return { ok: false, error: "You cannot revoke your own access." };
  }

  // IDOR fix (defect 2): the target app_user MUST belong to the caller's org.
  // Without this, a foreign user id would have had its grants disabled +
  // status suspended cross-tenant.
  const target = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.organizationId, orgId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!target) return { ok: false, error: "User not found." };

  // Last-admin invariant (defect 3): the old code compared a GRANT id to a
  // USER id (`r.id !== userId`), so the guard never fired. Count the DISTINCT
  // OTHER users in THIS org who still hold an active `admin` grant. If the
  // target is the only active admin, refuse.
  const orgAdmins = await db
    .selectDistinct({ userId: appUserRoles.userId })
    .from(appUserRoles)
    .innerJoin(appUsers, eq(appUsers.id, appUserRoles.userId))
    .where(
      and(
        eq(appUserRoles.roleKey, "admin"),
        eq(appUserRoles.isActive, true),
        eq(appUsers.organizationId, orgId),
      ),
    );
  const targetIsAdmin = orgAdmins.some((a) => a.userId === userId);
  const otherAdminCount = orgAdmins.filter((a) => a.userId !== userId).length;
  if (targetIsAdmin && otherAdminCount === 0) {
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
    .where(and(eq(appUsers.id, userId), eq(appUsers.organizationId, orgId)));

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

// Cabinet roles only (Dev-OS app_user_roles). `owner` is NOT a cabinet role —
// it's an owner-portal grant created through the owner invite flow, so it must
// not be selectable as a member's cabinet role.
const CABINET_ROLES = VALID_ROLES.filter((r) => r !== "owner") as Exclude<
  (typeof VALID_ROLES)[number],
  "owner"
>[];

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  newRoleKey: z.enum(CABINET_ROLES as [string, ...string[]]),
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
  const orgId = me.organizationId;
  if (!orgId) return { ok: false, error: "No organization context available." };

  // IDOR fix (defect 2): the target user MUST belong to the caller's org.
  // Without the org filter a foreign user's grants could be rewritten.
  const target = await db
    .select({ id: appUsers.id, status: appUsers.status, email: appUsers.email })
    .from(appUsers)
    .where(and(eq(appUsers.id, data.userId), eq(appUsers.organizationId, orgId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!target) return { ok: false, error: "User not found." };

  // Last-active-admin invariant: if the target currently has admin AND
  // the new role is NOT admin, refuse if no other active admin remains
  // WITHIN THIS ORG (count distinct other admin users — defect 3 pattern).
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
      .selectDistinct({ userId: appUserRoles.userId })
      .from(appUserRoles)
      .innerJoin(appUsers, eq(appUsers.id, appUserRoles.userId))
      .where(
        and(
          eq(appUserRoles.roleKey, "admin"),
          eq(appUserRoles.isActive, true),
          eq(appUsers.organizationId, orgId),
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
  // back to active so the new grant takes effect. Org-scoped.
  if (target.status === "suspended") {
    await db
      .update(appUsers)
      .set({ status: "active", updatedAt: now })
      .where(and(eq(appUsers.id, data.userId), eq(appUsers.organizationId, orgId)));
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

// ============================================================================
// DOMAIN 2 — INTERNAL role grant/revoke (user_roles → /dashboard cabinets)
//
// Until now, the dashboard cabinet roles (housekeeper, accountant, director,
// …) could ONLY be set by scripts (bootstrap / provision_app_user). These
// actions let a super_admin / director assign or revoke an INTERNAL role from
// the app, writing `user_roles` through the same SECURITY DEFINER helper the
// bootstrap uses (`assign_user_role`). super_admin is intentionally NOT
// assignable from the UI (reserved for bootstrap / founder accounts).
//
// Org-scoped (target must be in the caller's org), permission-gated
// (`roles.assign`), and audited.
// ============================================================================

/**
 * Returns the internal roles that are BOTH in the assignable allow-list AND
 * present as rows in the `roles` table (so `assign_user_role` won't raise an
 * "unknown role key"). Used by the UI to render only roles that can succeed.
 */
export async function listAssignableInternalRoles(): Promise<
  Array<{ key: string; label: string }>
> {
  const db = requireDb();
  const rows = await db
    .select({ key: roles.key })
    .from(roles)
    .where(inArray(roles.key, ASSIGNABLE_INTERNAL_ROLES));
  const present = new Set(rows.map((r) => r.key));
  return ASSIGNABLE_INTERNAL_ROLES.filter((k) => present.has(k)).map((k) => ({
    key: k,
    label: internalRoleLabel(k),
  }));
}

const internalRoleSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.enum(ASSIGNABLE_INTERNAL_ROLES as unknown as [string, ...string[]]),
  reason: z.string().max(500).optional(),
});

export type InternalRoleResult =
  | { ok: true; roleKey: string; alreadyHeld: boolean }
  | { ok: false; error: string };

export async function assignInternalRoleAction(
  input: z.input<typeof internalRoleSchema>,
): Promise<InternalRoleResult> {
  await requirePermission("roles.assign");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = internalRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role." };
  }
  const data = parsed.data;

  const db = requireDb();
  const orgId = me.organizationId;
  if (!orgId) return { ok: false, error: "No organization context available." };

  // Target must live in the caller's org (IDOR guard).
  const target = await db
    .select({ id: appUsers.id, email: appUsers.email })
    .from(appUsers)
    .where(and(eq(appUsers.id, data.userId), eq(appUsers.organizationId, orgId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!target) return { ok: false, error: "User not found." };

  // Confirm the role key exists in `roles` so assign_user_role won't raise.
  const roleRow = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, data.roleKey))
    .limit(1)
    .then((rows) => rows[0]);
  if (!roleRow) {
    return {
      ok: false,
      error: `Role "${internalRoleLabel(data.roleKey)}" is not seeded in this database.`,
    };
  }

  // Idempotent check — was the grant already present (global scope)?
  const before = await db
    .execute<{ has: boolean }>(
      sql`SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
         WHERE ur.user_id = ${data.userId}::uuid
           AND r.key = ${data.roleKey}::text
           AND ur.scope_type IS NULL
           AND ur.scope_id IS NULL
      ) AS has`,
    )
    .then((res) => rowsOf<{ has: boolean }>(res)[0]?.has ?? false);

  // Grant via the same SECURITY DEFINER helper the bootstrap uses. Idempotent.
  await db.execute(
    sql`SELECT public.assign_user_role(${data.userId}::uuid, ${data.roleKey}::text, NULL::text, NULL::uuid)`,
  );

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "team.internal_role.assigned",
    entityType: "app_user",
    entityId: data.userId,
    after: { role_key: data.roleKey, scope: "global" },
    metadata: {
      reason: data.reason ?? null,
      target_email: target.email,
      already_held: before,
    },
  });

  revalidatePath("/dashboard/settings/team");
  revalidatePath(`/dashboard/settings/team/${data.userId}`);
  return { ok: true, roleKey: data.roleKey, alreadyHeld: before };
}

export async function revokeInternalRoleAction(
  input: z.input<typeof internalRoleSchema>,
): Promise<InternalRoleResult> {
  await requirePermission("roles.assign");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = internalRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role." };
  }
  const data = parsed.data;

  const db = requireDb();
  const orgId = me.organizationId;
  if (!orgId) return { ok: false, error: "No organization context available." };

  const target = await db
    .select({ id: appUsers.id, email: appUsers.email })
    .from(appUsers)
    .where(and(eq(appUsers.id, data.userId), eq(appUsers.organizationId, orgId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!target) return { ok: false, error: "User not found." };

  const roleRow = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, data.roleKey))
    .limit(1)
    .then((rows) => rows[0]);
  if (!roleRow) return { ok: false, error: "Role not found." };

  // Last-internal-admin / lockout guards: never let the org lose its last
  // director (the only internal role with users.read by default besides
  // super_admin). We do NOT manage super_admin here.
  if (data.roleKey === "director") {
    const otherDirectors = await db
      .selectDistinct({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(appUsers, eq(appUsers.id, userRoles.userId))
      .where(
        and(
          eq(roles.key, "director"),
          eq(appUsers.organizationId, orgId),
        ),
      )
      .then((rows) => rows.filter((r) => r.userId !== data.userId));
    if (otherDirectors.length === 0) {
      return {
        ok: false,
        error: "Cannot revoke the last director. Assign another director first.",
      };
    }
  }

  // Delete the global-scope grant for this (user, role).
  const deleted = await db
    .delete(userRoles)
    .where(
      and(
        eq(userRoles.userId, data.userId),
        eq(userRoles.roleId, roleRow.id),
        sql`${userRoles.scopeType} IS NULL`,
        sql`${userRoles.scopeId} IS NULL`,
      ),
    )
    .returning({ id: userRoles.id });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "team.internal_role.revoked",
    entityType: "app_user",
    entityId: data.userId,
    before: { role_key: data.roleKey, scope: "global" },
    metadata: {
      reason: data.reason ?? null,
      target_email: target.email,
      removed: deleted.length,
    },
  });

  revalidatePath("/dashboard/settings/team");
  revalidatePath(`/dashboard/settings/team/${data.userId}`);
  return { ok: true, roleKey: data.roleKey, alreadyHeld: deleted.length === 0 };
}

// ============================================================================
// DOMAIN 2 — owner-portal invitation (replaces the audit-only stub)
//
// Creates a REAL team_invitation for an owner's email with roleKey "owner"
// + ownerId set, returns the accept link, and queues the email (dry-run
// aware). On accept, acceptInvitationAction provisions the app_user as
// investor_owner + creates the app_users_owners grant. Org-scoped + audited.
// ============================================================================

const ownerInviteSchema = z.object({
  ownerId: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  note: z.string().max(500).optional(),
});

export type OwnerInviteResult =
  | {
      ok: true;
      invitationId: string;
      acceptUrl: string;
      emailDelivered: boolean;
      email: string;
    }
  | { ok: false; error: string };

export async function inviteOwnerToPortalAction(
  input: z.input<typeof ownerInviteSchema>,
): Promise<OwnerInviteResult> {
  // Owner-portal access management is gated by owner_access.manage (the same
  // gate the access-grant actions use).
  await requirePermission("owner_access.manage");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = ownerInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const db = requireDb();
  const orgId = me.organizationId;
  if (!orgId) return { ok: false, error: "No organization context available." };

  // Resolve the owner. (`owners` has no organization_id column today, so we
  // can't org-filter the SELECT; the invitation row we create IS org-scoped,
  // and the resulting grant is org-anchored to the caller's org.)
  const owner = await db
    .select({ id: owners.id, email: owners.email, displayName: owners.displayName })
    .from(owners)
    .where(eq(owners.id, data.ownerId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!owner) return { ok: false, error: "Owner not found." };

  const email = (data.email ?? owner.email ?? "").trim().toLowerCase();
  if (!email) {
    return {
      ok: false,
      error: "This owner has no email. Add one to the owner record before inviting.",
    };
  }

  const orgRow = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!orgRow) return { ok: false, error: "Organization not found." };

  // Refuse to overlap with an existing pending invite for this email in-org.
  const existingPending = await db
    .select({ id: teamInvitations.id })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.organizationId, orgId),
        eq(teamInvitations.email, email),
        eq(teamInvitations.status, "pending"),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (existingPending) {
    return {
      ok: false,
      error: "An active invitation for that email already exists. Revoke it first.",
    };
  }

  const now = new Date();
  const token = newToken();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 86400 * 1000);

  let invitationId: string;
  try {
    const [row] = await db
      .insert(teamInvitations)
      .values({
        organizationId: orgId,
        email,
        roleKey: "owner",
        scope: "company_wide",
        scopedProjectId: null,
        ownerId: owner.id,
        invitedByUserId: me.id,
        token,
        status: "pending",
        expiresAt,
        notes: data.note ?? null,
      })
      .returning({ id: teamInvitations.id });
    invitationId = row.id;
  } catch (err) {
    return {
      ok: false,
      error: `Could not create invitation: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const url = inviteUrl(token);
  const bodyText =
    `Hi ${owner.displayName},\n\n` +
    `You've been invited to access the ${orgRow.name} owner portal on Arconique.\n\n` +
    `Accept the invitation here:\n${url}\n\n` +
    `This link expires in ${INVITE_EXPIRY_DAYS} days. If you didn't expect this you can ignore this email.\n\n` +
    `— Arconique`;
  const emailResult = await sendDevOsEmail({
    to: email,
    subject: `You're invited to the ${orgRow.name} owner portal`,
    bodyText,
    bodyHtml: `<p>${bodyText.replace(/\n/g, "<br/>")}</p>`,
    metadata: {
      triggerEntityType: "team_invitation",
      triggerEntityId: invitationId,
      templateName: "owner_portal_invitation",
    },
  }).catch(() => ({ status: "failed" as const, deliveryId: "", errorReason: "exception" }));

  await db
    .update(teamInvitations)
    .set({ lastEmailSentAt: now, updatedAt: now })
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.organizationId, orgId),
      ),
    );

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "owner.portal_invite.created",
    entityType: "team_invitation",
    entityId: invitationId,
    after: {
      owner_id: owner.id,
      email,
      organization_id: orgId,
    },
  });

  revalidatePath(`/dashboard/owners/${owner.id}`);
  revalidatePath("/dashboard/settings/team");
  return {
    ok: true,
    invitationId,
    acceptUrl: url,
    emailDelivered: emailReallyDelivered(emailResult.status),
    email,
  };
}

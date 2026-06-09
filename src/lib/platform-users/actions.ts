/**
 * Platform Admin OS — cross-org user admin actions.
 *
 * Invoked from /platform/users/[id]. Two privileged actions:
 *   - sendPasswordResetAction — emails the user a Supabase recovery link
 *     (reuses supabase.auth.resetPasswordForEmail, the same primitive the
 *     public /forgot-password flow uses)
 *   - resetMfaAction — revokes the user's verified TOTP factor + active
 *     recovery codes (reuses revokeMfaFactorAsAdmin from the
 *     security-baseline service), forcing a fresh re-enrolment
 *
 * Every action:
 *   1. Re-checks the caller is super_admin (defense-in-depth — the
 *      (platform-app) layout already gates, but server actions can be
 *      invoked from anywhere).
 *   2. Emits an audit_events row with a `platform.user.*` action prefix
 *      so it automatically surfaces in /platform/audit.
 *
 * "View dashboard" is a plain link (org switch), not a mutation, so it
 * has no action here. No new tables, no migration.
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { getSupabaseServer } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/features/audit/services";
import { requireSuperAdmin } from "@/features/auth/require-super-admin";
import { revokeMfaFactorAsAdmin } from "@/features/security-baseline/mfa-services";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Resolve the public origin so the recovery email links back to the
 *  same host the operator is on. Mirrors features/auth/actions.ts. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "arconique.com";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

async function loadUser(
  userId: string,
): Promise<{ id: string; email: string } | null> {
  const db = getDb();
  if (!db) return null;
  const [u] = await db
    .select({ id: appUsers.id, email: appUsers.email })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  return u ?? null;
}

/**
 * Send a password-reset email to the target user. Reuses Supabase's
 * `resetPasswordForEmail` — the same recovery primitive the public
 * /forgot-password flow uses. The link lands on /auth/confirm which
 * forwards to /reset-password after exchanging the token.
 */
export async function sendPasswordResetAction(
  userId: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireSuperAdmin();
    const actorUserId = ctx.appUser?.id ?? null;

    const target = await loadUser(userId);
    if (!target) return { ok: false, error: "User not found." };

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return { ok: false, error: "Supabase auth is not configured." };
    }

    const origin = await requestOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
      redirectTo: `${origin}/auth/confirm?next=/reset-password`,
    });
    if (error) return { ok: false, error: error.message };

    await recordAuditEvent({
      actorUserId,
      action: "platform.user.password_reset_sent",
      entityType: "app_user",
      entityId: target.id,
      metadata: { email: target.email },
    });

    revalidatePath(`/platform/users/${userId}`);
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "password reset failed",
    };
  }
}

/**
 * Reset (revoke) the target user's MFA. Revokes the verified/pending TOTP
 * factor + active recovery codes via the security-baseline service, so the
 * user must re-enrol on next sign-in. Audit-logged.
 */
export async function resetMfaAction(userId: string): Promise<ActionResult> {
  try {
    const ctx = await requireSuperAdmin();
    const actorUserId = ctx.appUser?.id ?? null;

    const target = await loadUser(userId);
    if (!target) return { ok: false, error: "User not found." };

    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured." };

    // Find the user's current pending/verified factor to revoke.
    const { authMfaFactors } = await import("@/lib/db/schema/security");
    const { inArray, and } = await import("drizzle-orm");
    const [factor] = await db
      .select({ id: authMfaFactors.id })
      .from(authMfaFactors)
      .where(
        and(
          eq(authMfaFactors.appUserId, userId),
          inArray(authMfaFactors.status, ["pending", "verified"]),
        ),
      )
      .limit(1);

    if (!factor) {
      return { ok: false, error: "This user has no active MFA factor." };
    }

    const res = await revokeMfaFactorAsAdmin({ factorId: factor.id });
    if (!res.ok) return { ok: false, error: "Failed to revoke MFA factor." };

    await recordAuditEvent({
      actorUserId,
      action: "platform.user.mfa_reset",
      entityType: "app_user",
      entityId: target.id,
      before: { mfaFactorStatus: "active", factorId: factor.id },
      after: { mfaFactorStatus: "revoked" },
      metadata: { email: target.email },
    });

    revalidatePath(`/platform/users/${userId}`);
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "MFA reset failed",
    };
  }
}

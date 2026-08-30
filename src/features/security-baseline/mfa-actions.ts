"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAuditEvent } from "@/features/audit/services";
import { clearMfaPendingMarker } from "./mfa-pending-marker";
import {
  checkMfaThrottle,
  countRecentMfaFailures,
} from "./mfa-throttle";
import { mfaMaxFailedPerUser } from "@/lib/env";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  consumeRecoveryCode,
  disableMfaFactor,
  revokeMfaFactorAsAdmin,
  startMfaEnrolment,
  verifyMfaChallenge,
  verifyMfaEnrolment,
} from "./mfa-services";
import { recordSecurityEvent } from "./security-events";
import type { ActionResult } from "@/features/projects/actions";

const codeSchema = z.object({
  code: z.string().min(6).max(20),
});
const factorIdSchema = z.object({
  factorId: z.string().uuid(),
});

export async function startMfaEnrollmentAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<
  ActionResult & {
    factorId?: string;
    otpauthUrl?: string;
    secret?: string;
  }
> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const out = await startMfaEnrolment({
    appUserId: me.id,
    email: me.email,
  });
  if (!out) return { ok: false, error: "Database not configured." };
  await recordSecurityEvent({
    eventType: "mfa_enrolled",
    appUserId: me.id,
    metadata: { stage: "started", factorId: out.factorId },
  });
  await recordAuditEvent({
    actorUserId: me.id,
    action: "mfa.enrolment.start",
    entityType: "auth_mfa_factor",
    entityId: out.factorId,
  });
  revalidatePath("/setup/mfa");
  revalidatePath("/dashboard/settings/security");
  return {
    ok: true,
    factorId: out.factorId,
    otpauthUrl: out.otpauthUrl,
    secret: out.secret,
  };
}

export async function verifyMfaEnrollmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { recoveryCodes?: string[]; factorId?: string }> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const parsed = codeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid code." };
  const out = await verifyMfaEnrolment({
    appUserId: me.id,
    code: parsed.data.code,
  });
  if (!out.ok) {
    await recordSecurityEvent({
      eventType: "mfa_failed",
      appUserId: me.id,
      severity: "warning",
      metadata: { stage: "enrol_verify", reason: out.reason ?? "unknown" },
    });
    return { ok: false, error: ownerFacingMfaError(out.reason) };
  }
  await recordSecurityEvent({
    eventType: "mfa_verified",
    appUserId: me.id,
    metadata: { stage: "enrolment", factorId: out.factorId ?? null },
  });
  await recordAuditEvent({
    actorUserId: me.id,
    action: "mfa.enrolment.verify",
    entityType: "auth_mfa_factor",
    entityId: out.factorId ?? null,
  });
  revalidatePath("/setup/mfa/verify");
  revalidatePath("/setup/mfa/recovery-codes");
  revalidatePath("/dashboard/settings/security");
  return { ok: true, recoveryCodes: out.recoveryCodes, factorId: out.factorId };
}

export async function verifyMfaChallengeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  // MFA-THROTTLE-1 — reject before verifying once the per-user failure
  // budget is exhausted within the window. Lock the session (drop the
  // mfa_pending marker) so the attacker must re-authenticate to retry,
  // which itself runs the login throttle.
  const gate = await checkMfaThrottle(me.id);
  if (!gate.allowed) {
    await lockMfaSession(me.id);
    return mfaLockedResult();
  }
  const parsed = codeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid code." };
  const out = await verifyMfaChallenge({
    appUserId: me.id,
    code: parsed.data.code,
  });
  if (!out.ok) {
    await recordSecurityEvent({
      eventType: "mfa_failed",
      appUserId: me.id,
      severity: "warning",
      metadata: { stage: "challenge", reason: out.reason ?? "unknown" },
    });
    // If this failure exhausts the budget, lock the session now rather than
    // waiting for the next request to hit the gate above.
    if ((await countRecentMfaFailures(me.id)) >= mfaMaxFailedPerUser()) {
      await lockMfaSession(me.id);
      return mfaLockedResult();
    }
    return { ok: false, error: ownerFacingMfaError(out.reason) };
  }
  await recordSecurityEvent({
    eventType: "mfa_verified",
    appUserId: me.id,
    metadata: { stage: "challenge" },
  });
  // MFA-ENFORCE-1 — challenge cleared: drop the `mfa_pending` marker so the
  // layout gate stops bouncing the user to /login/mfa, then send them into
  // the app. redirect() throws a control-flow signal; nothing after it runs.
  await clearMfaPendingMarker();
  redirect("/dashboard");
}

export async function redeemRecoveryCodeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { remaining?: number }> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  // MFA-THROTTLE-1 — same per-user gate as the TOTP challenge. Recovery-code
  // failures and challenge failures share one counter, so an attacker cannot
  // grind recovery codes after burning the TOTP budget (or vice versa).
  const gate = await checkMfaThrottle(me.id);
  if (!gate.allowed) {
    await lockMfaSession(me.id);
    return mfaLockedResult();
  }
  const parsed = z
    .object({ code: z.string().min(8).max(40) })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid recovery code." };
  const out = await consumeRecoveryCode({
    appUserId: me.id,
    code: parsed.data.code,
  });
  if (!out.ok) {
    await recordSecurityEvent({
      eventType: "mfa_failed",
      appUserId: me.id,
      severity: "warning",
      metadata: {
        stage: "recovery",
        reason: out.reason ?? "unknown",
      },
    });
    if ((await countRecentMfaFailures(me.id)) >= mfaMaxFailedPerUser()) {
      await lockMfaSession(me.id);
      return mfaLockedResult();
    }
    return { ok: false, error: "We could not match that recovery code." };
  }
  await recordSecurityEvent({
    eventType: "mfa_recovery_used",
    appUserId: me.id,
    severity: "warning",
    metadata: { remaining: out.remaining ?? 0 },
  });
  await recordAuditEvent({
    actorUserId: me.id,
    action: "mfa.recovery.use",
    entityType: "auth_mfa_recovery_code",
    entityId: null,
  });
  // MFA-ENFORCE-1 — a valid recovery code satisfies the second factor:
  // clear the `mfa_pending` marker and enter the app. redirect() throws a
  // control-flow signal, so nothing after it runs.
  await clearMfaPendingMarker();
  redirect("/dashboard");
}

export async function disableMfaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const parsed = factorIdSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid factor id." };
  await disableMfaFactor({
    appUserId: me.id,
    factorId: parsed.data.factorId,
    reason: "self",
  });
  await recordSecurityEvent({
    eventType: "mfa_disabled",
    appUserId: me.id,
    severity: "warning",
    metadata: { factorId: parsed.data.factorId, by: "self" },
  });
  await recordAuditEvent({
    actorUserId: me.id,
    action: "mfa.disable",
    entityType: "auth_mfa_factor",
    entityId: parsed.data.factorId,
  });
  revalidatePath("/dashboard/settings/security");
  return { ok: true };
}

export async function revokeMfaFactorAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("mfa.manage");
  const me = await getCurrentAppUser();
  const parsed = factorIdSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid factor id." };
  const out = await revokeMfaFactorAsAdmin({
    factorId: parsed.data.factorId,
    organizationId: me?.organizationId ?? null,
  });
  if (!out.ok) return { ok: false, error: "Factor not found." };
  await recordSecurityEvent({
    eventType: "mfa_revoked",
    appUserId: out.appUserId ?? null,
    severity: "warning",
    metadata: { factorId: parsed.data.factorId, by: me?.id ?? "system" },
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "mfa.revoke",
    entityType: "auth_mfa_factor",
    entityId: parsed.data.factorId,
  });
  revalidatePath("/dashboard/security/mfa");
  revalidatePath("/dashboard/settings/security");
  return { ok: true };
}

/**
 * MFA-THROTTLE-1 — lock the pending second-factor session: drop the
 * `mfa_pending` marker (so the layout gate stops accepting this session as
 * mid-challenge and the user is forced back to /login to re-authenticate)
 * and log a security event for the admin login surface. Best-effort: a
 * failure to log must not mask the lock.
 */
async function lockMfaSession(appUserId: string): Promise<void> {
  await clearMfaPendingMarker();
  await recordSecurityEvent({
    eventType: "mfa_failed",
    appUserId,
    severity: "warning",
    metadata: { stage: "challenge", reason: "throttled_locked" },
  });
}

function mfaLockedResult(): ActionResult {
  return {
    ok: false,
    error:
      "Too many incorrect codes. For your security this sign-in has been blocked — please sign in again to restart verification.",
  };
}

function ownerFacingMfaError(reason: string | undefined): string {
  switch (reason) {
    case "invalid_code":
      return "That code did not match. Please try again.";
    case "factor_not_found":
      return "MFA is not enrolled.";
    case "no_db":
      return "MFA is unavailable right now. Please try again later.";
    default:
      return "MFA verification failed.";
  }
}

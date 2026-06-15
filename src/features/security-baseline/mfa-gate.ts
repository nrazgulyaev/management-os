import "server-only";

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { hasValidMfaPendingMarker } from "./mfa-pending-marker";

/**
 * MFA-ENFORCE-1 — layout-level gate.
 *
 * Call at the top of an app-surface layout (dashboard, development-os).
 * When the current session carries a valid `mfa_pending` marker (i.e. the
 * user signed in with a password but hasn't cleared their second factor
 * yet), this redirect()s to `/login/mfa` so no product surface renders.
 *
 * Fail-open + no-lockout posture:
 *   - Anonymous (no app user) → return; the existing product-access guard
 *     handles unauthenticated visitors. We never mint or require a marker
 *     for someone with no session.
 *   - No marker (the case for EVERY user without a verified factor, and
 *     for any user who already cleared the challenge) → return; pure
 *     pass-through, zero behaviour change.
 *   - Any error resolving the marker → swallowed (never blocks access).
 *
 * redirect() throws a control-flow signal; callers must let it propagate
 * (the layouts already re-throw isRedirectError).
 */
export async function enforceMfaChallengeCleared(): Promise<void> {
  let me;
  try {
    me = await getCurrentAppUser();
  } catch {
    return; // resolving the user failed — don't block, let other guards run
  }
  if (!me) return; // anonymous — nothing to enforce

  let pending = false;
  try {
    pending = await hasValidMfaPendingMarker(me.id);
  } catch {
    return; // marker check failed — fail open, never lock out
  }

  if (pending) redirect("/login/mfa");
}

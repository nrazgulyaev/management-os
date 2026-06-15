import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { securityEncryptionSecret, isProduction } from "@/lib/env";

/**
 * MFA-ENFORCE-1 — the "mfa_pending" challenge marker.
 *
 * After a successful password sign-in for a user who has a VERIFIED MFA
 * factor, sign-in stamps this marker cookie and bounces the user to
 * `/login/mfa`. App access (dashboard / development-os layouts) is gated
 * so a present-and-valid marker forces the user back to the challenge
 * before any product surface renders. The challenge / recovery-code
 * actions CLEAR the marker on success.
 *
 * Why it is unforgeable
 * ---------------------
 * The cookie value is `v1.<appUserId>.<expEpochSeconds>.<sigBase64Url>`
 * where `sig = HMAC-SHA256(secret, "v1.<appUserId>.<exp>")`. The signing
 * key is `SECURITY_ENCRYPTION_SECRET` (the same server-only secret the
 * MFA secret-at-rest crypto uses — never shipped to the client). An
 * attacker cannot mint or alter a marker without that secret, and cannot
 * replay one user's marker for another account because the payload binds
 * the exact `appUserId` and the signature covers it. The marker also
 * carries a short expiry (10 min) so a leaked value cannot be reused
 * indefinitely.
 *
 * Why a user with NO verified factor is unaffected
 * ------------------------------------------------
 * The marker is ONLY ever written by `setMfaPendingMarker`, which sign-in
 * calls exclusively inside `if (getMfaStatus(...).verified)`. A no-factor
 * user is never issued a cookie, so `readValidMfaPendingMarker` returns
 * null for them and every gate is a pure pass-through. No new check runs
 * on their request path; their sign-in → redirect is byte-for-byte the
 * prior behaviour.
 */

export const MFA_PENDING_COOKIE = "__arconique_mfa_pending";

/** Marker lifetime — long enough to fetch a code, short enough to bound
 *  replay of a leaked cookie. The user can always restart by signing in
 *  again, which re-stamps a fresh marker. */
const MARKER_TTL_SECONDS = 10 * 60;
const VERSION = "v1";

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Resolve the HMAC signing key. Falls CLOSED in production when the
 * secret is missing (so we never mint a marker an attacker could forge
 * against a predictable key) but allows a deterministic dev fallback so
 * local sign-in still exercises the challenge. Mirrors the fall-closed
 * posture of `crypto.ts`.
 */
function signingKey(): string {
  const secret = securityEncryptionSecret();
  if (secret && secret.length >= 32) return secret;
  if (isProduction()) {
    throw new Error(
      "[mfa-pending-marker] SECURITY_ENCRYPTION_SECRET is missing in production — refusing to sign the MFA marker.",
    );
  }
  return "arconique-dev-only-fallback-secret-do-not-use-in-production-ever";
}

function sign(payload: string): string {
  return base64Url(createHmac("sha256", signingKey()).update(payload).digest());
}

/**
 * Stamp the marker for `appUserId`. Called by sign-in ONLY when a
 * verified factor exists. HttpOnly so client JS can't read or mint it;
 * Secure in production; SameSite=Lax so the post-sign-in redirect
 * carries it. Path `/` so every gated surface sees it.
 */
export async function setMfaPendingMarker(appUserId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MARKER_TTL_SECONDS;
  const payload = `${VERSION}.${appUserId}.${exp}`;
  const value = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set({
    name: MFA_PENDING_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MARKER_TTL_SECONDS,
  });
}

/** Clear the marker (challenge or recovery-code success). */
export async function clearMfaPendingMarker(): Promise<void> {
  const store = await cookies();
  store.set({
    name: MFA_PENDING_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Verify a raw cookie value against `expectedAppUserId`. Returns true
 * only when: the format is valid, the signature matches (constant-time),
 * the marker is not expired, AND it is bound to exactly this user. Any
 * tampering, a marker minted for a different user, or expiry → false.
 *
 * Pure (no cookie store access) so it's unit-testable and reusable.
 */
export function isMfaPendingMarkerValid(
  rawValue: string | undefined | null,
  expectedAppUserId: string,
): boolean {
  if (!rawValue) return false;
  const parts = rawValue.split(".");
  if (parts.length !== 4) return false;
  const [version, appUserId, expStr, sig] = parts;
  if (version !== VERSION) return false;
  if (appUserId !== expectedAppUserId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return false;
  if (Math.floor(Date.now() / 1000) > exp) return false;
  const expectedSig = sign(`${version}.${appUserId}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Read the marker from the request cookies and confirm it is valid for
 * `appUserId`. Returns true when the user is still mid-challenge. Used by
 * the layout gates. A no-factor user never has this cookie, so this is a
 * pure pass-through (returns false) for them.
 */
export async function hasValidMfaPendingMarker(
  appUserId: string,
): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(MFA_PENDING_COOKIE)?.value;
  return isMfaPendingMarkerValid(raw, appUserId);
}

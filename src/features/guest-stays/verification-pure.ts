/**
 * Pure verification primitives for the guest stay one-time-code flow
 * (v9G). No `server-only` import — these helpers can be unit-tested
 * directly.
 *
 *   - 6-digit numeric code (zero-padded). 1,000,000 keyspace + 5 attempts
 *     gives ~2 × 10⁻⁵ guess success per session, which is fine for an
 *     audience that already has a 256-bit token.
 *   - SHA-256 hash of the code is what we store. No reversal.
 *   - Expiry default: 10 minutes. Resend cooldown: 60 seconds.
 *   - `maskRecipient` produces a "j****@gmail.com" / "+62••••3456"
 *     style label that's safe to render to the guest before they've
 *     entered the code.
 */

import { createHash, randomInt } from "node:crypto";

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_DEFAULT_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const VERIFICATION_MAX_ATTEMPTS = 5;

/** Pure: 6-digit zero-padded numeric code via `crypto.randomInt`. */
export function generateVerificationCode(
  source: () => number = () => randomInt(0, 1_000_000),
): string {
  const n = source() % 1_000_000;
  return String(n).padStart(VERIFICATION_CODE_LENGTH, "0");
}

/**
 * Hash a verification code. We salt with the token prefix so two
 * tokens that happened to mint the same numeric code don't collide on
 * `verification_code_hash`.
 */
export function hashVerificationCode(
  code: string,
  tokenPrefix: string,
): string {
  return createHash("sha256")
    .update(`arconique:verification:${tokenPrefix}:${code}`, "utf8")
    .digest("hex");
}

/**
 * Pure: derive the default expiry given a "now" timestamp.
 */
export function defaultVerificationExpiresAt(
  now: Date = new Date(),
  ttlMs: number = VERIFICATION_DEFAULT_TTL_MS,
): Date {
  return new Date(now.getTime() + ttlMs);
}

/**
 * Pure: mask an email or phone for guest-safe pre-verification display.
 *
 *   guest+demo@arconique.com → "g****@arconique.com"
 *   +6281234567890           → "+6281••••7890"
 */
export function maskRecipient(
  recipient: string | null | undefined,
): string | null {
  if (!recipient) return null;
  const r = recipient.trim();
  if (r.includes("@")) return maskEmail(r);
  if (r.startsWith("+") || /^[0-9 ()-]+$/.test(r)) return maskPhone(r);
  return maskGeneric(r);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return maskGeneric(email);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, "");
  if (digits.length <= 4) return maskGeneric(phone);
  const head = digits.slice(0, Math.min(4, digits.length - 4));
  const tail = digits.slice(-4);
  return `${head}${"•".repeat(4)}${tail}`;
}

function maskGeneric(s: string): string {
  if (s.length <= 4) return "*".repeat(s.length);
  return s.slice(0, 1) + "*".repeat(s.length - 2) + s.slice(-1);
}

// -----------------------------------------------------------------------------
// Verification outcome state machine
// -----------------------------------------------------------------------------

export interface VerificationRowSnapshot {
  status: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  verificationCodeHash: string;
}

export type VerifyOutcome =
  | { ok: true; nextStatus: "verified" }
  | {
      ok: false;
      reason:
        | "expired"
        | "exhausted"
        | "invalid_code"
        | "already_verified"
        | "cancelled";
      nextAttempts: number;
      nextStatus: "pending" | "expired" | "failed" | "verified" | "cancelled";
    };

/**
 * Pure verifier. Bumps attempts. Caller writes the row + the security
 * event using the `nextAttempts` / `nextStatus` it returns.
 */
export function evaluateVerification(
  prior: VerificationRowSnapshot,
  candidateCode: string,
  tokenPrefix: string,
  now: Date = new Date(),
): VerifyOutcome {
  if (prior.status === "verified") {
    return {
      ok: false,
      reason: "already_verified",
      nextAttempts: prior.attempts,
      nextStatus: "verified",
    };
  }
  if (prior.status === "cancelled") {
    return {
      ok: false,
      reason: "cancelled",
      nextAttempts: prior.attempts,
      nextStatus: "cancelled",
    };
  }
  if (prior.expiresAt.getTime() < now.getTime()) {
    return {
      ok: false,
      reason: "expired",
      nextAttempts: prior.attempts,
      nextStatus: "expired",
    };
  }
  const nextAttempts = prior.attempts + 1;
  if (nextAttempts > prior.maxAttempts) {
    return {
      ok: false,
      reason: "exhausted",
      nextAttempts,
      nextStatus: "failed",
    };
  }
  const candidateHash = hashVerificationCode(candidateCode, tokenPrefix);
  if (candidateHash === prior.verificationCodeHash) {
    return { ok: true, nextStatus: "verified" };
  }
  return {
    ok: false,
    reason: "invalid_code",
    nextAttempts,
    nextStatus: nextAttempts >= prior.maxAttempts ? "failed" : "pending",
  };
}

/**
 * Pure: given the previous send timestamp + now, return whether the
 * caller may send a fresh code.
 */
export function canResend(
  lastIssuedAt: Date | null,
  now: Date = new Date(),
  cooldownMs: number = VERIFICATION_RESEND_COOLDOWN_MS,
): { allowed: boolean; retryAfterMs: number } {
  if (!lastIssuedAt) return { allowed: true, retryAfterMs: 0 };
  const since = now.getTime() - lastIssuedAt.getTime();
  if (since >= cooldownMs) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: cooldownMs - since };
}

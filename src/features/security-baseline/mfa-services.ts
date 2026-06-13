import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  authMfaFactors,
  authMfaRecoveryCodes,
  type AuthMfaFactor,
} from "@/lib/db/schema/security";
import { mfaIssuer } from "@/lib/env";
import {
  buildOtpauthUrl,
  generateTotpSecret,
  verifyTotpCode,
} from "./totp-pure";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
} from "./recovery-codes-pure";
import { decryptFromStorage, encryptForStorage } from "./crypto";

/**
 * MFA enrolment + verification service layer.
 *
 * Responsibilities:
 *   - Create / fetch the user's TOTP factor.
 *   - Encrypt/decrypt the TOTP secret on every read/write.
 *   - Verify codes with ±1 window tolerance.
 *   - Generate + verify recovery codes.
 *
 * Plaintext secrets are returned exactly once at enrolment time
 * (with the otpauth URL) — never re-issued from storage.
 */

export interface StartEnrolmentResult {
  factorId: string;
  otpauthUrl: string;
  secret: string; // plaintext — show once, never persist
  issuer: string;
  account: string;
}

export async function startMfaEnrolment(input: {
  appUserId: string;
  email: string;
  label?: string;
}): Promise<StartEnrolmentResult | null> {
  const db = getDb();
  if (!db) return null;
  const issuer = mfaIssuer();
  const account = input.email;
  const secret = generateTotpSecret();
  const blob = encryptForStorage(secret);
  // Reset any prior pending factor so the user can restart enrolment
  // cleanly (verified factors stay).
  await db
    .delete(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.appUserId, input.appUserId),
        eq(authMfaFactors.status, "pending"),
      ),
    );
  const [row] = await db
    .insert(authMfaFactors)
    .values({
      appUserId: input.appUserId,
      factorType: "totp",
      status: "pending",
      issuer,
      label: input.label ?? null,
      secretCiphertext: blob.ciphertext,
      secretKeyVersion: blob.keyVersion,
    })
    .returning({ id: authMfaFactors.id });
  return {
    factorId: row!.id,
    otpauthUrl: buildOtpauthUrl({ issuer, account, secret }),
    secret,
    issuer,
    account,
  };
}

export interface VerifyEnrolmentResult {
  ok: boolean;
  reason?:
    | "factor_not_found"
    | "wrong_status"
    | "invalid_code"
    | "no_db"
    | "unknown";
  recoveryCodes?: string[];
  factorId?: string;
}

export async function verifyMfaEnrolment(input: {
  appUserId: string;
  code: string;
}): Promise<VerifyEnrolmentResult> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const [factor] = await db
    .select()
    .from(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.appUserId, input.appUserId),
        eq(authMfaFactors.status, "pending"),
      ),
    )
    .limit(1);
  if (!factor) return { ok: false, reason: "factor_not_found" };
  let secret: string;
  try {
    secret = decryptFromStorage(factor.secretCiphertext);
  } catch {
    return { ok: false, reason: "unknown" };
  }
  const matched = verifyTotpCode(secret, input.code);
  if (matched === null) return { ok: false, reason: "invalid_code" };
  const now = new Date();
  await db
    .update(authMfaFactors)
    .set({ status: "verified", verifiedAt: now, lastUsedAt: now, updatedAt: now })
    .where(eq(authMfaFactors.id, factor.id));
  // Generate recovery codes (only at successful enrolment).
  const codes = generateRecoveryCodes(10);
  // Wipe any prior recovery codes to avoid mixing two sets.
  await db
    .delete(authMfaRecoveryCodes)
    .where(eq(authMfaRecoveryCodes.appUserId, input.appUserId));
  for (const code of codes) {
    await db.insert(authMfaRecoveryCodes).values({
      appUserId: input.appUserId,
      codeHash: hashRecoveryCode(code),
      status: "active",
    });
  }
  return { ok: true, recoveryCodes: codes, factorId: factor.id };
}

export async function verifyMfaChallenge(input: {
  appUserId: string;
  code: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const [factor] = await db
    .select()
    .from(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.appUserId, input.appUserId),
        eq(authMfaFactors.status, "verified"),
      ),
    )
    .limit(1);
  if (!factor) return { ok: false, reason: "factor_not_found" };
  let secret: string;
  try {
    secret = decryptFromStorage(factor.secretCiphertext);
  } catch {
    return { ok: false, reason: "decrypt_failed" };
  }
  const matched = verifyTotpCode(secret, input.code);
  if (matched === null) return { ok: false, reason: "invalid_code" };
  await db
    .update(authMfaFactors)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(authMfaFactors.id, factor.id));
  return { ok: true };
}

export interface UseRecoveryResult {
  ok: boolean;
  reason?: "no_db" | "no_code_found" | "no_codes_active";
  remaining?: number;
}

export async function consumeRecoveryCode(input: {
  appUserId: string;
  code: string;
}): Promise<UseRecoveryResult> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const rows = await db
    .select({
      id: authMfaRecoveryCodes.id,
      codeHash: authMfaRecoveryCodes.codeHash,
    })
    .from(authMfaRecoveryCodes)
    .where(
      and(
        eq(authMfaRecoveryCodes.appUserId, input.appUserId),
        eq(authMfaRecoveryCodes.status, "active"),
      ),
    );
  if (rows.length === 0) return { ok: false, reason: "no_codes_active" };
  const result = verifyRecoveryCodeHash(
    input.code,
    rows.map((r) => r.codeHash),
  );
  if (!result.ok || !result.matchedHash) {
    return { ok: false, reason: "no_code_found" };
  }
  await db
    .update(authMfaRecoveryCodes)
    .set({ status: "used", usedAt: new Date() })
    .where(eq(authMfaRecoveryCodes.codeHash, result.matchedHash));
  const remaining = rows.length - 1;
  return { ok: true, remaining };
}

export interface MfaStatus {
  enrolled: boolean;
  pendingEnrolment: boolean;
  verified: boolean;
  factorId: string | null;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  activeRecoveryCodeCount: number;
  usedRecoveryCodeCount: number;
}

export async function getMfaStatus(appUserId: string): Promise<MfaStatus> {
  const empty: MfaStatus = {
    enrolled: false,
    pendingEnrolment: false,
    verified: false,
    factorId: null,
    verifiedAt: null,
    lastUsedAt: null,
    activeRecoveryCodeCount: 0,
    usedRecoveryCodeCount: 0,
  };
  const db = getDb();
  if (!db) return empty;
  const [factor] = await db
    .select()
    .from(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.appUserId, appUserId),
        inArray(authMfaFactors.status, ["pending", "verified"]),
      ),
    )
    .orderBy(desc(authMfaFactors.createdAt))
    .limit(1);
  const codes = await db
    .select({ status: authMfaRecoveryCodes.status })
    .from(authMfaRecoveryCodes)
    .where(eq(authMfaRecoveryCodes.appUserId, appUserId));
  const active = codes.filter((c) => c.status === "active").length;
  const used = codes.filter((c) => c.status === "used").length;
  if (!factor) {
    return { ...empty, activeRecoveryCodeCount: active, usedRecoveryCodeCount: used };
  }
  return {
    enrolled: factor.status === "verified",
    pendingEnrolment: factor.status === "pending",
    verified: factor.status === "verified",
    factorId: factor.id,
    verifiedAt:
      factor.verifiedAt instanceof Date ? factor.verifiedAt.toISOString() : null,
    lastUsedAt:
      factor.lastUsedAt instanceof Date ? factor.lastUsedAt.toISOString() : null,
    activeRecoveryCodeCount: active,
    usedRecoveryCodeCount: used,
  };
}

export async function disableMfaFactor(input: {
  appUserId: string;
  factorId: string;
  reason: "self" | "admin";
}): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  const now = new Date();
  await db
    .update(authMfaFactors)
    .set({
      status: "disabled",
      disabledAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(authMfaFactors.id, input.factorId),
        eq(authMfaFactors.appUserId, input.appUserId),
      ),
    );
  await db
    .update(authMfaRecoveryCodes)
    .set({ status: "revoked" })
    .where(
      and(
        eq(authMfaRecoveryCodes.appUserId, input.appUserId),
        eq(authMfaRecoveryCodes.status, "active"),
      ),
    );
  return { ok: true };
}

/**
 * Admin-side factor revoke. Shared helper: called both from the request path
 * (revokeMfaFactorAction → must scope to the caller's org) and from the
 * platform super-admin path (cross-org by design → passes null to skip the
 * org guard). When `organizationId` is provided, a factor anchored to a
 * different org is treated as "not found" (NULL org anchor = pre-backfill
 * row, migration 0154 — allowed; set-but-mismatched = rejected).
 */
export async function revokeMfaFactorAsAdmin(input: {
  factorId: string;
  organizationId?: string | null;
}): Promise<{ ok: boolean; appUserId?: string }> {
  const db = getDb();
  if (!db) return { ok: false };
  const scopeOrgId = input.organizationId ?? null;
  const [factor] = await db
    .select({
      id: authMfaFactors.id,
      appUserId: authMfaFactors.appUserId,
      organizationId: authMfaFactors.organizationId,
    })
    .from(authMfaFactors)
    .where(eq(authMfaFactors.id, input.factorId))
    .limit(1);
  if (!factor) return { ok: false };
  // TENANCY — request-path callers scope to their session org; a factor in
  // another org is invisible (do not revoke, do not leak existence).
  if (scopeOrgId && factor.organizationId && factor.organizationId !== scopeOrgId) {
    return { ok: false };
  }
  const now = new Date();
  await db
    .update(authMfaFactors)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(eq(authMfaFactors.id, factor.id));
  await db
    .update(authMfaRecoveryCodes)
    .set({ status: "revoked" })
    .where(
      and(
        eq(authMfaRecoveryCodes.appUserId, factor.appUserId),
        eq(authMfaRecoveryCodes.status, "active"),
      ),
    );
  return { ok: true, appUserId: factor.appUserId };
}

export async function listMfaFactorsForAdmin(): Promise<
  Array<
    Pick<
      AuthMfaFactor,
      "id" | "appUserId" | "status" | "issuer" | "label" | "verifiedAt" | "lastUsedAt" | "createdAt"
    >
  >
> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: authMfaFactors.id,
      appUserId: authMfaFactors.appUserId,
      status: authMfaFactors.status,
      issuer: authMfaFactors.issuer,
      label: authMfaFactors.label,
      verifiedAt: authMfaFactors.verifiedAt,
      lastUsedAt: authMfaFactors.lastUsedAt,
      createdAt: authMfaFactors.createdAt,
    })
    .from(authMfaFactors)
    .orderBy(desc(authMfaFactors.createdAt))
    .limit(200);
  return rows;
}

export async function listSecurityEventsForAdmin(
  limit = 100,
): Promise<
  Array<{
    id: string;
    appUserId: string | null;
    eventType: string;
    severity: string;
    ipHash: string | null;
    metadata: unknown;
    createdAt: string;
  }>
> {
  const db = getDb();
  if (!db) return [];
  const { authSecurityEvents } = await import("@/lib/db/schema/security");
  const rows = await db
    .select()
    .from(authSecurityEvents)
    .orderBy(desc(authSecurityEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    appUserId: r.appUserId,
    eventType: r.eventType,
    severity: r.severity,
    ipHash: r.ipHash,
    metadata: r.metadata,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : "",
  }));
}

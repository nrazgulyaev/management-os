import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  isProduction,
  isStayLinkKmsConfigured,
  stayLinkKmsSecret,
} from "@/lib/env";
import {
  ciphertextKeyVersion,
  decryptWifiPassword as decryptPure,
  encryptWifiPassword as encryptPure,
  looksLikeCiphertext,
} from "./wifi-crypto-pure";
import { villaWifiCredentials } from "@/lib/db/schema/villa-guides";
import { wifiEncryptionKeys } from "@/lib/db/schema/guest-stay-security";
import { recordSecurityEvent } from "@/features/guest-stays/security";

/**
 * Server-only wrapper around the pure crypto helpers. Resolves the
 * platform secret + active key version, fails closed in production
 * when the secret is missing, and warns loudly in dev fallback.
 */

const DEV_FALLBACK_SECRET =
  "arconique:DEV-ONLY:do-not-use-in-prod:32-bytes-minimum";

let warned = false;

function resolveSecret(): string {
  const secret = stayLinkKmsSecret();
  if (secret) return secret;
  if (isProduction()) {
    throw new Error(
      "Wi-Fi encryption refused: STAY_LINK_KMS_SECRET is not configured in production.",
    );
  }
  if (!warned) {
    // eslint-disable-next-line no-console
    console.warn(
      "[wifi-crypto] STAY_LINK_KMS_SECRET is not set — using a deterministic dev fallback. NEVER ship this configuration to production.",
    );
    warned = true;
  }
  return DEV_FALLBACK_SECRET;
}

/**
 * Find or create the active key version. The encrypted_data_key column
 * is reserved for future "wrap an external KEK" flows; for v9G we treat
 * it as a sentinel ("scrypt-v1") so rotation can flip it later.
 */
export async function ensureActiveKeyVersion(): Promise<number> {
  const db = getDb();
  if (!db) return 1;
  const [active] = await db
    .select()
    .from(wifiEncryptionKeys)
    .where(eq(wifiEncryptionKeys.status, "active"))
    .limit(1);
  if (active) return active.keyVersion;
  // Bootstrap: insert v1.
  const [row] = await db
    .insert(wifiEncryptionKeys)
    .values({
      keyVersion: 1,
      encryptedDataKey: "scrypt-v1",
      status: "active",
    })
    .returning({ keyVersion: wifiEncryptionKeys.keyVersion });
  return row?.keyVersion ?? 1;
}

export async function encryptForStorage(
  plaintext: string,
): Promise<{ ciphertext: string; keyVersion: number }> {
  const secret = resolveSecret();
  const keyVersion = await ensureActiveKeyVersion();
  return encryptPure(plaintext, secret, keyVersion);
}

export interface DecryptOutcome {
  ok: boolean;
  plaintext: string | null;
  reason: string | null;
}

/**
 * Server-side decrypt for the guest portal. Caller must already have
 * verified the stay token and verification gate. Returns `{ ok: false }`
 * with a non-leaky reason on failure — the guest UI shows a generic
 * "Contact concierge" message and never the failure mode.
 */
export async function decryptForGuest(
  ciphertext: string | null,
): Promise<DecryptOutcome> {
  if (!ciphertext) return { ok: false, plaintext: null, reason: "missing" };
  if (!isStayLinkKmsConfigured() && isProduction()) {
    return { ok: false, plaintext: null, reason: "kms_missing" };
  }
  const secret = resolveSecret();
  try {
    const plaintext = decryptPure({ ciphertext }, secret);
    return { ok: true, plaintext, reason: null };
  } catch {
    return { ok: false, plaintext: null, reason: "decrypt_failed" };
  }
}

export { ciphertextKeyVersion, looksLikeCiphertext };

// -----------------------------------------------------------------------------
// Migration helper — convert legacy plaintext display_password rows.
// -----------------------------------------------------------------------------

export interface MigrationResult {
  scanned: number;
  migrated: number;
  skipped: number;
  failed: number;
}

/**
 * Sweep `villa_wifi_credentials`: any active row with a `display_password`
 * but no `password_ciphertext` gets encrypted and the plaintext column is
 * cleared. Idempotent — running twice is a no-op.
 *
 * Also logs a `wifi_password_migrated` security event per row so admins
 * can audit the rollout.
 */
export async function migratePlaintextWifiPasswords(opts?: {
  actorAppUserId?: string | null;
}): Promise<MigrationResult> {
  const db = getDb();
  if (!db)
    return { scanned: 0, migrated: 0, skipped: 0, failed: 0 };
  const rows = await db.select().from(villaWifiCredentials);
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.passwordCiphertext) {
      skipped++;
      continue;
    }
    if (!r.displayPassword) {
      skipped++;
      continue;
    }
    try {
      const enc = await encryptForStorage(r.displayPassword);
      await db
        .update(villaWifiCredentials)
        .set({
          passwordCiphertext: enc.ciphertext,
          passwordKeyVersion: enc.keyVersion,
          passwordMigratedAt: new Date(),
          displayPassword: null,
          updatedAt: new Date(),
        })
        .where(eq(villaWifiCredentials.id, r.id));
      migrated++;
      await recordSecurityEvent({
        eventType: "wifi_password_migrated",
        severity: "low",
        metadata: {
          wifiCredentialId: r.id,
          villaId: r.villaId,
          projectId: r.projectId,
          keyVersion: enc.keyVersion,
          actorAppUserId: opts?.actorAppUserId ?? null,
        },
      });
    } catch {
      failed++;
    }
  }
  return { scanned: rows.length, migrated, skipped, failed };
}

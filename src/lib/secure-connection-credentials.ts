/**
 * Trust batch #2 — encryption-at-rest for operator connection credentials.
 *
 * Payment-processor, banking, and marketing connections all persist a
 * provider credentials blob into a JSONB `credentials` column. Until now
 * that blob was stored PLAINTEXT (the create paths inserted
 * `credentials as never` directly) even though the operator UI claims
 * "AES-256-GCM encrypted at rest". This module closes that gap by
 * reusing the same audited envelope the channel-manager already uses
 * (`src/lib/channel-manager/credentials-crypto.ts`), keyed via
 * STAY_LINK_KMS_SECRET.
 *
 * Two entry points:
 *   - `sealCredentials(obj)`  → encrypt before insert/update.
 *   - `openCredentials<T>(raw)` → decrypt on read, with a transparent
 *     fallback for LEGACY plaintext rows (so existing connections keep
 *     working before the one-time backfill script runs, and in dev).
 *
 * Not marked `server-only` so the backfill script + unit tests can
 * round-trip without a request context. The secret resolution still
 * fail-closes in production.
 */

import {
  encryptCredentials,
  decryptCredentials,
  isEncryptedBlob,
  type EncryptedCredentialsBlob,
} from "@/lib/channel-manager/credentials-crypto";
import { stayLinkKmsSecret, isProduction } from "@/lib/env";

/** Dev-only fallback so demo flows work without the platform secret.
 *  Mirrors the channel-manager constant; never reached in production. */
const DEV_FALLBACK_SECRET =
  "arconique:DEV-ONLY:do-not-use-in-prod:32-bytes-minimum";

export function resolveConnectionSecret(): string {
  const s = stayLinkKmsSecret();
  if (s) return s;
  if (isProduction()) {
    throw new Error(
      "Connection credentials encryption refused: STAY_LINK_KMS_SECRET missing in production.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

/** Encrypt a credentials object into the JSONB envelope for storage. */
export function sealCredentials(obj: unknown): EncryptedCredentialsBlob {
  return encryptCredentials(JSON.stringify(obj), resolveConnectionSecret());
}

/**
 * Decrypt a stored credentials column back into its typed object.
 *
 * - `null`/`undefined` → `null` (DryRun connection, no creds).
 * - Already an encrypted envelope → decrypt + parse.
 * - Anything else → treated as LEGACY PLAINTEXT and returned as-is. This
 *   keeps pre-encryption rows readable until the backfill runs; the
 *   backfill (and any subsequent write) upgrades them to ciphertext.
 */
export function openCredentials<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (!isEncryptedBlob(raw)) {
    return raw as T;
  }
  const json = decryptCredentials(raw, resolveConnectionSecret());
  return JSON.parse(json) as T;
}

/** True when a stored value is already an encryption envelope. Re-exported
 *  so the backfill script can skip already-encrypted rows. */
export { isEncryptedBlob };

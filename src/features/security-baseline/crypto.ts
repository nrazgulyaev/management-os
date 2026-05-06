import "server-only";

import {
  encryptSecuritySecret,
  decryptSecuritySecret,
  type EncryptedBlob,
} from "./crypto-pure";
import {
  isProduction,
  securityEncryptionSecret,
} from "@/lib/env";

/**
 * Server wrapper around the pure AES-256-GCM helpers.  Resolves
 * `SECURITY_ENCRYPTION_SECRET` from env and falls closed in
 * production when missing.  In development it falls back to a
 * deterministic dev-only key with a single warn-once log.
 */

const DEV_FALLBACK_SECRET = "arconique-dev-only-fallback-secret-do-not-use-in-production-ever";

let warnedOnce = false;

function resolveSecretOrFallClosed(operation: "encrypt" | "decrypt"): string {
  const secret = securityEncryptionSecret();
  if (secret && secret.length >= 32) return secret;
  if (isProduction()) {
    throw new Error(
      `[security-baseline] SECURITY_ENCRYPTION_SECRET is missing in production — refusing to ${operation}.`,
    );
  }
  if (!warnedOnce) {
    warnedOnce = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[security-baseline] SECURITY_ENCRYPTION_SECRET not set — using dev-only fallback. DO NOT ship this fallback to production.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

export function encryptForStorage(
  plaintext: string,
  keyVersion = 1,
): EncryptedBlob {
  return encryptSecuritySecret(
    plaintext,
    resolveSecretOrFallClosed("encrypt"),
    keyVersion,
  );
}

export function decryptFromStorage(ciphertext: string): string {
  return decryptSecuritySecret(
    ciphertext,
    resolveSecretOrFallClosed("decrypt"),
  );
}

/**
 * Test-only seam — resets the warned-once flag so unit tests can
 * verify the warning fires once per process.
 */
export function __resetWarnedOnce(): void {
  warnedOnce = false;
}

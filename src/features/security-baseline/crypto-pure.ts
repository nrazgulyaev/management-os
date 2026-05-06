/**
 * Prompt 111 — AES-256-GCM secret encryption for MFA TOTP secrets.
 *
 * Mirrors the pattern established by `villa-guides/wifi-crypto-pure.ts`
 * but with a security-specific salt namespace.  Pure — no DB, no
 * `server-only` import.  Server callers wrap this with
 * `securityEncryptionSecret()` from `@/lib/env`.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const FORMAT_VERSION = 1;

export interface EncryptedBlob {
  ciphertext: string;
  keyVersion: number;
}

/**
 * Derive a 32-byte data key from `(secret, keyVersion)` via scrypt.
 * Salt is namespaced with `arconique:security:v<n>` so the same
 * SECURITY_ENCRYPTION_SECRET cannot be confused with the
 * STAY_LINK_KMS_SECRET key chain.
 */
export function deriveSecurityMasterKey(
  secret: string,
  keyVersion: number,
): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error(
      "deriveSecurityMasterKey: secret must be at least 32 chars (set SECURITY_ENCRYPTION_SECRET).",
    );
  }
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 255) {
    throw new Error(
      "deriveSecurityMasterKey: keyVersion must be a positive integer ≤ 255.",
    );
  }
  const salt = Buffer.from(`arconique:security:v${keyVersion}`, "utf8");
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Pure: encrypt an arbitrary plaintext (≤ 4 KiB) with AES-256-GCM.
 * Output: self-describing base64url blob — `[FORMAT_VERSION,
 * keyVersion, iv (12), tag (16), ciphertext]`.
 */
export function encryptSecuritySecret(
  plaintext: string,
  secret: string,
  keyVersion = 1,
): EncryptedBlob {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecuritySecret: plaintext must be non-empty.");
  }
  if (plaintext.length > 4096) {
    throw new Error("encryptSecuritySecret: plaintext exceeds 4 KiB.");
  }
  const key = deriveSecurityMasterKey(secret, keyVersion);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([
    Buffer.from([FORMAT_VERSION, keyVersion]),
    iv,
    tag,
    encrypted,
  ]);
  return { ciphertext: toBase64Url(blob), keyVersion };
}

/**
 * Pure: decrypt a self-describing blob produced by
 * `encryptSecuritySecret`.  Throws on malformed input, version
 * mismatch, or auth-tag failure (wrong secret / tampered blob).
 */
export function decryptSecuritySecret(
  ciphertext: string,
  secret: string,
): string {
  const blob = fromBase64Url(ciphertext);
  if (blob.length < 2 + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("decryptSecuritySecret: blob too short.");
  }
  const formatVersion = blob[0];
  const keyVersion = blob[1];
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `decryptSecuritySecret: unsupported format version ${formatVersion}.`,
    );
  }
  const iv = blob.subarray(2, 2 + IV_LENGTH);
  const tag = blob.subarray(2 + IV_LENGTH, 2 + IV_LENGTH + TAG_LENGTH);
  const ciphertextOnly = blob.subarray(2 + IV_LENGTH + TAG_LENGTH);
  const key = deriveSecurityMasterKey(secret, keyVersion);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertextOnly),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// -----------------------------------------------------------------------------
// base64url encoders (Buffer.from with "base64url" exists in Node 16+
// but we round-trip through "base64" for a deterministic shape).
// -----------------------------------------------------------------------------

export function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

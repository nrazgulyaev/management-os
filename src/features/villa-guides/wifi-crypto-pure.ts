/**
 * Pure AES-256-GCM helpers for Wi-Fi password encryption (v9G).
 *
 * Format: base64url("v" || keyVersion[1B] || iv[12B] || tag[16B] || ciphertext)
 * — single self-describing blob so the column can store any version.
 *
 * No `server-only` import — these helpers are shared with tests. They
 * use `node:crypto` which is available in both Node and Edge Runtime
 * via Next's polyfill.
 *
 * The "data key" is derived from the platform secret + key version using
 * scrypt. We store the key version on the row so future rotation can
 * decrypt old ciphertexts while writing new ones with a fresh version.
 *
 * NEVER log plaintext, the secret, or the derived data key.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const FORMAT_VERSION = 1;
const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive a deterministic 32-byte data key from `(secret, keyVersion)` via
 * scrypt. We bind the version into the salt so two concurrent versions
 * produce different keys even with the same secret.
 */
export function deriveMasterKey(secret: string, keyVersion: number): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error(
      "deriveMasterKey: secret must be at least 32 chars (use STAY_LINK_KMS_SECRET).",
    );
  }
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 255) {
    throw new Error(
      "deriveMasterKey: keyVersion must be a positive integer ≤ 255.",
    );
  }
  const salt = Buffer.from(`arconique:wifi:v${keyVersion}`, "utf8");
  return scryptSync(secret, salt, KEY_LENGTH);
}

export interface EncryptionResult {
  ciphertext: string; // base64url blob
  keyVersion: number;
}

/**
 * Encrypt a Wi-Fi password under (secret, keyVersion). Output is a
 * single self-describing base64url blob suitable for the
 * `password_ciphertext` column.
 */
export function encryptWifiPassword(
  plaintext: string,
  secret: string,
  keyVersion: number,
): EncryptionResult {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptWifiPassword: plaintext must be a non-empty string.");
  }
  if (plaintext.length > 256) {
    throw new Error("encryptWifiPassword: plaintext exceeds 256-char cap.");
  }
  const key = deriveMasterKey(secret, keyVersion);
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
  return {
    ciphertext: toBase64Url(blob),
    keyVersion,
  };
}

export interface DecryptionInput {
  ciphertext: string;
  /**
   * Optional override; if missing we read it from the blob header.
   * Useful for sanity-checks (`decryptWifiPassword(c, secret, expectedVersion)`).
   */
  expectedKeyVersion?: number;
}

/**
 * Decrypt a Wi-Fi ciphertext blob with the platform secret. Throws on
 * malformed input, version mismatch, or auth-tag failure (wrong secret /
 * tampered blob). Callers should treat any thrown error as "could not
 * recover plaintext" — never surface details to a guest.
 */
export function decryptWifiPassword(
  input: DecryptionInput,
  secret: string,
): string {
  const blob = fromBase64Url(input.ciphertext);
  if (blob.length < 2 + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("decryptWifiPassword: blob too short.");
  }
  const formatVersion = blob[0];
  const keyVersion = blob[1];
  if (formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `decryptWifiPassword: unsupported format version ${formatVersion}.`,
    );
  }
  if (
    input.expectedKeyVersion !== undefined &&
    input.expectedKeyVersion !== keyVersion
  ) {
    throw new Error(
      `decryptWifiPassword: key version mismatch (got ${keyVersion}, expected ${input.expectedKeyVersion}).`,
    );
  }
  const iv = blob.subarray(2, 2 + IV_LENGTH);
  const tag = blob.subarray(2 + IV_LENGTH, 2 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(2 + IV_LENGTH + TAG_LENGTH);
  const key = deriveMasterKey(secret, keyVersion);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Pure: tells whether a candidate string looks like a v9G ciphertext blob
 * (length + base64url shape). False negatives are acceptable.
 */
export function looksLikeCiphertext(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const blob = fromBase64Url(value);
    return (
      blob.length > 2 + IV_LENGTH + TAG_LENGTH &&
      blob[0] === FORMAT_VERSION &&
      blob[1] >= 1 &&
      blob[1] <= 255
    );
  } catch {
    return false;
  }
}

/**
 * Pure: never returns the password — only its key version. Useful for
 * guest projection tests + admin "encrypted, key v1" badges.
 */
export function ciphertextKeyVersion(
  ciphertext: string | null,
): number | null {
  if (!ciphertext) return null;
  try {
    const blob = fromBase64Url(ciphertext);
    if (blob.length < 2) return null;
    if (blob[0] !== FORMAT_VERSION) return null;
    const v = blob[1];
    return v >= 1 && v <= 255 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Pure: timing-safe equality for two base64url strings. Used by the
 * verification module to compare hashed codes.
 */
export function safeStringEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

// -----------------------------------------------------------------------------
// base64url helpers
// -----------------------------------------------------------------------------

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(s: string): Buffer {
  const pad = s.length % 4;
  const padded = s + "=".repeat(pad === 0 ? 0 : 4 - pad);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

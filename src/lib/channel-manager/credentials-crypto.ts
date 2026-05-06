/**
 * Stage 6.P1.B — Channel credentials encryption.
 *
 * AES-256-GCM envelope around a JSON-serialized credentials blob, keyed
 * via STAY_LINK_KMS_SECRET (same secret used for guest-stay tokens and
 * Wi-Fi passwords). Mirrors the proven pattern from
 * `src/features/villa-guides/wifi-crypto-pure.ts`.
 *
 * Why a fresh helper instead of reusing the wifi one:
 *   - Different domain (operator credentials vs guest passwords)
 *   - Different output shape (JSONB column → store {ciphertext, keyVersion}
 *     as JSON object, not a single base64url string)
 *   - Easier rotation: channel-manager rotation can move at its own
 *     cadence without touching wifi credentials
 *
 * Pure module — no `server-only` import so tests can exercise round-trip
 * encrypt → decrypt without a runtime context.
 *
 * NEVER log plaintext credentials. NEVER include raw credentials in
 * error messages. All logging goes through `redactCredentials()` which
 * strips secret-bearing fields and leaves only metadata.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const FORMAT_VERSION = 1;
const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface EncryptedCredentialsBlob {
  /** Format marker — bumped if the envelope changes (rotation, new algo). */
  v: number;
  /** Key version — supports rotation without re-encrypting old rows in lockstep. */
  k: number;
  /** Base64url-encoded (iv || tag || ciphertext). */
  c: string;
}

/**
 * Derive a 32-byte data key from `(secret, keyVersion)` via scrypt.
 * Salt binds the version so two key versions produce different keys
 * even with the same platform secret.
 */
export function deriveCredentialsKey(secret: string, keyVersion: number): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error(
      "deriveCredentialsKey: secret must be at least 32 chars (use STAY_LINK_KMS_SECRET).",
    );
  }
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 255) {
    throw new Error(
      "deriveCredentialsKey: keyVersion must be a positive integer ≤ 255.",
    );
  }
  const salt = Buffer.from(`arconique:channel-credentials:v${keyVersion}`, "utf8");
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Encrypt a credentials object. Caller serializes — we don't
 * stringify here so non-JSON-safe fields fail loudly at the call site
 * rather than producing a useless ciphertext.
 */
export function encryptCredentials(
  plaintextJson: string,
  secret: string,
  keyVersion = 1,
): EncryptedCredentialsBlob {
  if (typeof plaintextJson !== "string" || plaintextJson.length === 0) {
    throw new Error("encryptCredentials: plaintextJson must be a non-empty string");
  }
  const key = deriveCredentialsKey(secret, keyVersion);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintextJson, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, encrypted]);
  return {
    v: FORMAT_VERSION,
    k: keyVersion,
    c: toBase64Url(blob),
  };
}

/**
 * Decrypt back to JSON string. Throws on tampering or wrong secret —
 * caller must catch and treat as "credentials unrecoverable" without
 * leaking the failure mode to operators or logs.
 */
export function decryptCredentials(
  blob: EncryptedCredentialsBlob,
  secret: string,
): string {
  if (!blob || typeof blob !== "object") {
    throw new Error("decryptCredentials: blob is required");
  }
  if (blob.v !== FORMAT_VERSION) {
    throw new Error(
      `decryptCredentials: unsupported format version ${blob.v}`,
    );
  }
  const buf = fromBase64Url(blob.c);
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("decryptCredentials: ciphertext too short");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const key = deriveCredentialsKey(secret, blob.k);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Strip secret-bearing fields from a credentials object for safe
 * logging. Whitelist of fields to keep — anything not on the list is
 * dropped. New credential variants must opt in by extending this map.
 *
 * Returned shape is `{ channel, ...metadata }` only.
 */
export function redactCredentials(
  creds: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!creds || typeof creds !== "object") return {};
  const channel = creds["channel"];
  const out: Record<string, unknown> = {};
  if (typeof channel === "string") out.channel = channel;
  // Per-channel metadata that is safe to log. Property/listing IDs are
  // not secrets — they're public to anyone who books on the channel.
  const safeKeys = [
    "hotelId",
    "listingId",
    "partnerId",
    "accountId",
    "environment",
    "expiresAt",
  ];
  for (const k of safeKeys) {
    if (k in creds) out[k] = creds[k];
  }
  return out;
}

/**
 * Type guard — true if `value` looks like an `EncryptedCredentialsBlob`.
 * Used by service-layer code to decide whether a JSONB column already
 * carries an envelope or still has raw credentials (legacy / dev only).
 */
export function isEncryptedBlob(value: unknown): value is EncryptedCredentialsBlob {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.v === "number" &&
    typeof o.k === "number" &&
    typeof o.c === "string" &&
    o.c.length > 0
  );
}

// -----------------------------------------------------------------------------
// base64url helpers (kept private — these aren't a public API)
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

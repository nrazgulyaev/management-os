/**
 * Pure-ish token primitives. The randomBytes call uses Node's `crypto`
 * module which is available in both server (`node:crypto`) and edge
 * (`crypto.subtle`) — we keep this module side-effect free so tests can
 * import it without `server-only`.
 *
 * Token shape:
 *   - 32 random bytes → base64url → 43-character string. URL-safe, no
 *     padding. Entropy = 256 bits.
 *   - We never persist the raw token. SHA-256 hash + `prefix` (first
 *     8 chars of the URL-safe representation) are stored.
 *   - The prefix lets admins identify a token in audit logs without
 *     leaking the secret. 8 chars of base64url ≈ 48 bits, which is
 *     unique enough for ops display.
 */

import {
  randomBytes as _randomBytes,
  createHash,
} from "node:crypto";

/**
 * Generate a fresh URL-safe token. 32 random bytes → base64url (43
 * chars). Uses `node:crypto.randomBytes`; tests can pass an
 * `entropySource` to make output deterministic.
 */
export function generateStayToken(
  entropySource?: () => Buffer,
): string {
  const bytes = entropySource ? entropySource() : _randomBytes(32);
  return toBase64Url(bytes);
}

/** Pure: SHA-256 of the token, hex-encoded. Length is always 64 chars. */
export function hashStayToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Pure: take the first 8 base64url-safe characters as the admin display
 *  prefix. We also strip everything except `[A-Za-z0-9_-]` to be safe. */
export function tokenPrefixFromToken(token: string): string {
  const cleaned = token.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.slice(0, 8);
}

/**
 * Pure: derive the default expiry given a check-out date string
 * (YYYY-MM-DD). Default policy: checkOut + 7 days at 23:59 UTC. The
 * caller can override via `daysAfterCheckOut`.
 */
export function defaultStayTokenExpiresAt(
  checkOutDate: string,
  daysAfterCheckOut = 7,
): Date {
  const base = new Date(`${checkOutDate}T23:59:59.000Z`);
  if (Number.isNaN(base.getTime())) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return new Date(base.getTime() + daysAfterCheckOut * 24 * 60 * 60 * 1000);
}

/**
 * Pure: hash a raw IP into a short, non-reversible label. We salt with
 * a build-time constant so the same IP across processes maps to the
 * same hash but no plaintext is ever persisted. Truncated to 16 hex
 * chars (~64 bits) — enough to spot reuse without enabling lookups.
 */
const IP_HASH_SALT = "arconique:guest-stay:v9e";
export function hashIpForLog(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${IP_HASH_SALT}:${ip}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function toBase64Url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

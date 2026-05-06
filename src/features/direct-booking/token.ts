/**
 * Direct-booking hold tokens — same security posture as guest stay
 * tokens (SHA-256 hash + 8-char prefix, raw token never persisted).
 * Pure module: import-safe from tests; uses `node:crypto`.
 */
import { randomBytes as _randomBytes, createHash } from "node:crypto";

/** Generate a fresh URL-safe hold token (32 bytes → 43-char base64url). */
export function generateHoldToken(
  entropySource?: () => Buffer,
): string {
  const bytes = entropySource ? entropySource() : _randomBytes(32);
  return toBase64Url(bytes);
}

/** SHA-256 hex digest of the raw token (64 chars). */
export function hashHoldToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** First 8 url-safe chars as the admin display prefix. */
export function holdTokenPrefix(token: string): string {
  const cleaned = token.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.slice(0, 8);
}

/** Default expiry — 15 minutes from `now`. */
export function defaultHoldExpiry(
  minutes: number = 15,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() + Math.max(1, minutes) * 60_000);
}

/**
 * Pure: hash a public IP for rate-limiting and audit. Never persists
 * raw IPs — we keep a 16-char salted SHA-256 prefix.
 */
const IP_HASH_SALT = "arconique:direct-booking:p105";
export function hashPublicIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${IP_HASH_SALT}:${ip}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

/** Pure: hash a user-agent. Same shape as `hashPublicIp`. */
export function hashUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return createHash("sha256")
    .update(`${IP_HASH_SALT}:${ua}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

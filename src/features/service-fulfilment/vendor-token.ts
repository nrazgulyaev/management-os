/**
 * Vendor portal tokens — same primitive shape as guest-stay tokens
 * (SHA-256 hash + prefix, raw secret never persisted) but with a
 * shorter default lifetime tied to the fulfilment's scheduled time.
 *
 * Pure module: import-safe from tests; uses `node:crypto`. Server
 * routes call into this from inside `server-only` modules so the
 * raw secret is short-lived per request.
 */
import { randomBytes as _randomBytes, createHash } from "node:crypto";

/** Generate a fresh URL-safe vendor token (32 bytes → 43-char base64url). */
export function generateVendorToken(
  entropySource?: () => Buffer,
): string {
  const bytes = entropySource ? entropySource() : _randomBytes(32);
  return toBase64Url(bytes);
}

/** SHA-256 hex digest of the raw token. */
export function hashVendorToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** First 8 url-safe characters as the admin display prefix. */
export function tokenPrefixFromVendorToken(token: string): string {
  const cleaned = token.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.slice(0, 8);
}

/**
 * Default expiry policy for a vendor portal link.
 *
 * - If `scheduledFor` is in the future: expire 7 days AFTER it so the
 *   vendor can post completion notes / submit an invoice for a
 *   reasonable window after the service.
 * - If `scheduledFor` is past or null: 14 days from now.
 */
export function defaultVendorTokenExpiry(
  scheduledFor: Date | null | undefined,
  now: Date = new Date(),
): Date {
  const base =
    scheduledFor && scheduledFor.getTime() > now.getTime()
      ? scheduledFor
      : now;
  return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

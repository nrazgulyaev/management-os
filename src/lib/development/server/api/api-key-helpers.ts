/**
 * Stage 5.J.3 — Pure API key helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * API keys are high-entropy random tokens, so SHA-256 hashing is
 * sufficient and well-aligned with industry standards (Stripe, GitHub,
 * etc. all use SHA-256 for API keys, not bcrypt). Bcrypt's strength
 * comes from slowing down brute-force on low-entropy inputs (passwords)
 * — not relevant for 256-bit random strings.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface ApiKeyParts {
  /** Full key string (returned only at creation time). */
  fullKey: string;
  /** "arq_live_" or "arq_test_". */
  prefix: string;
  /** Last 4 chars of the key for display (e.g., in UI). */
  last4: string;
  /** SHA-256 hex digest of the full key. */
  hash: string;
}

/**
 * Generate a new API key. Returns the full key (shown once to the user)
 * + the parts to persist (prefix, last4, hash).
 */
export function generateApiKey(keyType: "live" | "test" = "live"): ApiKeyParts {
  const prefix = keyType === "live" ? "arq_live_" : "arq_test_";
  const random = randomBytes(32).toString("base64url");
  const fullKey = `${prefix}${random}`;
  const last4 = fullKey.slice(-4);
  const hash = createHash("sha256").update(fullKey).digest("hex");
  return { fullKey, prefix, last4, hash };
}

/**
 * Compute the SHA-256 hash of an incoming API key, for lookup.
 */
export function hashApiKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}

/**
 * Constant-time compare of two hex digests. Defends against timing
 * attacks during key validation.
 */
export function constantTimeHashCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Parse the prefix from an incoming key string. Returns null on malformed.
 */
export function parseKeyPrefix(fullKey: string): string | null {
  if (fullKey.startsWith("arq_live_")) return "arq_live_";
  if (fullKey.startsWith("arq_test_")) return "arq_test_";
  return null;
}

/**
 * Check whether a request scope is satisfied by the key's granted scopes.
 * "read" is implied by "write" — `leads:write` includes `leads:read`.
 */
export function scopeAllowed(
  required: string,
  granted: string[],
): boolean {
  if (granted.includes(required)) return true;
  if (required.endsWith(":read")) {
    const writeEquivalent = required.replace(/:read$/, ":write");
    if (granted.includes(writeEquivalent)) return true;
  }
  // Wildcard: `*` grants everything.
  if (granted.includes("*")) return true;
  return false;
}

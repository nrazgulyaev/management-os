/**
 * Sprint 3c — Pure (no I/O, no server-only) helpers for the Stripe
 * subscription bridge. Exists separately from `stripe-subscription-
 * bridge.ts` so unit tests can import these decisions without
 * triggering the `server-only` module barrier.
 *
 * Mirror of the lifecycle-pure.ts / lifecycle.ts pattern.
 */

import { PRODUCT_SLUGS, type ProductSlug } from "@/lib/products";

const VALID_SLUGS = new Set<string>(PRODUCT_SLUGS);

/**
 * Parse a comma-separated `products_enabled` metadata string into a
 * validated `ProductSlug[]` array.
 *
 *   "mgmt,dev"  → ["mgmt", "dev"]
 *   "mgmt"      → ["mgmt"]
 *   "mgmt,bad"  → ["mgmt"]  (unknown values silently dropped)
 *   ""          → []
 *   undefined   → null      (signals "metadata absent")
 *
 * Returning `null` (vs `[]`) lets the caller distinguish "Stripe sent
 * us an empty list — apply it" from "Stripe didn't send the field —
 * leave org.products_enabled alone".
 */
export function parseProductsEnabledMetadata(
  raw: unknown,
): ProductSlug[] | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_SLUGS.has(s))
    .map((s) => s as ProductSlug);
}

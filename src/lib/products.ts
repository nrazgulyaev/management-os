/**
 * Stage 10.H — Per-product access enum + helpers.
 *
 * The platform exposes two product surfaces today:
 *   - 'mgmt' → Management OS (/dashboard/*)
 *   - 'dev'  → Development OS (/development-os/*)
 *
 * Each tenant carries `organizations.products_enabled text[]` listing
 * which it has access to. This module is the single source of truth
 * for:
 *   - the closed enum of valid product slugs
 *   - URL-prefix → product mapping
 *   - product → URL-prefix mapping (landing pages)
 *   - helper predicates the per-product middleware will consume
 *
 * Pure module — no React, no DB, no env. Safe to import from
 * server components, client components, edge middleware, and tests.
 */

export const PRODUCT_SLUGS = ["mgmt", "dev"] as const;
export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

export const PRODUCT_LABELS: Record<ProductSlug, string> = {
  mgmt: "Management OS",
  dev: "Development OS",
};

/** Default URL each product lands on after sign-in. */
export const PRODUCT_HOME: Record<ProductSlug, string> = {
  mgmt: "/dashboard",
  dev: "/development-os",
};

/** URL prefixes a product owns. Order matters — longest-first wins. */
const PRODUCT_PREFIXES: Array<[string, ProductSlug]> = [
  ["/development-os", "dev"],
  ["/dashboard", "mgmt"],
];

/**
 * Map a request pathname to the product surface that owns it. Returns
 * null for paths outside any product (auth, public, api, root landing).
 */
export function productForPath(pathname: string): ProductSlug | null {
  for (const [prefix, slug] of PRODUCT_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return slug;
    }
  }
  return null;
}

/** True when the slug is one we recognise. */
export function isValidProductSlug(value: unknown): value is ProductSlug {
  return typeof value === "string" && (PRODUCT_SLUGS as readonly string[]).includes(value);
}

/** Coerce a raw value (DB column, query param) to the typed enum array,
 *  dropping unknown values silently. Returns the empty array for null
 *  / undefined / non-array. */
export function coerceProductSlugs(value: unknown): ProductSlug[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidProductSlug);
}

/** Predicate the per-product middleware uses to gate a request. */
export function orgHasProductAccess(
  productsEnabled: readonly string[] | null | undefined,
  product: ProductSlug,
): boolean {
  if (!productsEnabled) return false;
  return (productsEnabled as readonly ProductSlug[]).includes(product);
}

/** Pick the landing URL for a tenant after sign-in:
 *  - both products → null (caller falls back to last-used cookie or /dashboard)
 *  - one product → that product's home
 *  - zero products → null (caller surfaces "no access" page)
 */
export function pickLandingProduct(
  productsEnabled: readonly string[] | null | undefined,
): ProductSlug | null {
  const valid = coerceProductSlugs(productsEnabled);
  if (valid.length === 1) return valid[0];
  return null;
}

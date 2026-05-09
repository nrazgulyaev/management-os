import {
  orgHasProductAccess,
  pickLandingProduct,
  PRODUCT_HOME,
  type ProductSlug,
} from "@/lib/products";

/**
 * Stage 10.H — Pure (no I/O) decision helpers for the product-access guard.
 *
 * Lives separately from products-access.ts (which is `server-only` and
 * pulls in DB + Next.js redirect()) so tests can import these decisions
 * without hitting the server-only module barrier.
 */

export interface ProductAccessOutcome {
  allowed: boolean;
  reason?:
    | "no_signed_in_user"
    | "no_db"
    | "no_organization"
    | "product_not_enabled"
    | "no_products_enabled";
  alternativeProducts: ProductSlug[];
}

export function decideProductAccess(input: {
  product: ProductSlug;
  productsEnabled: ProductSlug[] | null;
  isSuperAdmin: boolean;
  isDemoMode: boolean;
}): ProductAccessOutcome {
  if (input.isDemoMode || input.isSuperAdmin) {
    return { allowed: true, alternativeProducts: [] };
  }
  if (input.productsEnabled === null) {
    return {
      allowed: false,
      reason: "no_organization",
      alternativeProducts: [],
    };
  }
  if (input.productsEnabled.length === 0) {
    return {
      allowed: false,
      reason: "no_products_enabled",
      alternativeProducts: [],
    };
  }
  if (orgHasProductAccess(input.productsEnabled, input.product)) {
    return { allowed: true, alternativeProducts: [] };
  }
  return {
    allowed: false,
    reason: "product_not_enabled",
    alternativeProducts: input.productsEnabled.filter(
      (p) => p !== input.product,
    ),
  };
}

/** Sign-in / post-login redirect picker. Returns the URL to land the
 *  user on after a successful auth event. */
export function landingPathFor(
  productsEnabled: ProductSlug[] | null,
): string {
  if (productsEnabled === null) return "/dashboard";
  if (productsEnabled.length === 0) return "/no-product-access";
  const single = pickLandingProduct(productsEnabled);
  if (single) return PRODUCT_HOME[single];
  // Both products: default to /dashboard (Mgmt OS) — caller may override
  // with a last-used cookie.
  return "/dashboard";
}

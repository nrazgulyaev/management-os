/**
 * Stage 10.B.4 — Brand resolution.
 *
 * Two products share the codebase today; the umbrella name is "Arconique
 * OS" with two product flavors:
 *   - "Arconique Management OS" inside `/dashboard`
 *   - "Arconique Development OS" inside `/development-os`
 *
 * Public, owner-portal, investor-portal, vendor, guest, and stay routes
 * fall back to the umbrella "Arconique OS" until they pick a side.
 *
 * Use `productBrand(pathname)` from server components or layouts; it
 * returns a stable object the Logo + page metadata can reuse.
 */

export type ProductId = "management" | "development" | "umbrella";

export interface ProductBrand {
  id: ProductId;
  /** Full title for <title> + og:title (e.g. "Arconique Management OS"). */
  title: string;
  /** Sub-name shown under the wordmark (e.g. "Management OS"). */
  subtitle: string;
  /** Where the logo links — usually the product root. */
  href: string;
}

const BRANDS: Record<ProductId, ProductBrand> = {
  management: {
    id: "management",
    title: "Arconique Management OS",
    subtitle: "Management OS",
    href: "/dashboard",
  },
  development: {
    id: "development",
    title: "Arconique Development OS",
    subtitle: "Development OS",
    href: "/development-os",
  },
  umbrella: {
    id: "umbrella",
    title: "Arconique OS",
    subtitle: "Arconique OS",
    href: "/",
  },
};

/**
 * Resolve a product brand from a request path. Stable across server
 * + client renders. `pathname` may be `null` (e.g. server context where
 * headers are unavailable); falls back to umbrella in that case.
 */
export function productBrand(pathname: string | null | undefined): ProductBrand {
  if (!pathname) return BRANDS.umbrella;
  if (pathname.startsWith("/development-os")) return BRANDS.development;
  if (pathname.startsWith("/dashboard")) return BRANDS.management;
  return BRANDS.umbrella;
}

export const PRODUCT_BRANDS = BRANDS;

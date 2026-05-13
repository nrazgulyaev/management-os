/**
 * Sprint 2 — per-product subdomain routing + per-tenant slug routing.
 *
 * Three concerns, layered:
 *
 *  1. Per-product subdomain (this sprint, new)
 *     `<product>.arconique.com` routes the user into one of four
 *     product surfaces (management / development / subscription /
 *     platform). The middleware:
 *       - parses the host
 *       - matches against the PRODUCT_SUBDOMAINS table
 *       - if the pathname is allowed on that product → stamps an
 *         `x-product: <name>` header and passes through
 *       - if the pathname is NOT allowed → 307-redirects to the
 *         product's default landing `/`
 *       - `/api/*` is always allowed (data plane, not UI)
 *
 *  2. Per-tenant slug (Stage 7.E, existing — preserved verbatim)
 *     `<tenant>.arconique.com` (or `<tenant>.localhost` in dev) stamps
 *     an `x-tenant-slug: <slug>` header. The server components do the
 *     DB lookup. Only applies to subdomains that AREN'T product names
 *     and aren't on the reserved pass-through list.
 *
 *  3. Reserved subdomains (Stage 7.E, existing — `admin` removed)
 *     `app, www, api, marketing, status, docs, public, investors`
 *     pass through with no tenant context. Stamps `x-reserved: true`.
 *     `admin` was removed since Sprint 2 introduces `platform` for
 *     the platform-admin workspace.
 *
 * Apex `arconique.com` itself should normally be served by the
 * `capital/` Vercel project (the institutional-investor site), not by
 * this app. During the transition, this app still renders `(public)/*`
 * marketing pages as a fallback when the host is the apex — we'll
 * remove that fallback once `capital/` is fully wired (Sprint 5).
 */

import { type NextRequest, NextResponse } from "next/server";

// ============================================================================
// Product subdomain configuration
// ============================================================================

export interface ProductSubdomainConfig {
  /**
   * Allowed top-level path prefixes on this subdomain. The pathname
   * must start with one of these (or equal `/`) for the request to
   * pass through. Anything else redirects to `defaultLanding`.
   *
   * Pure data-plane (`/api`) and static (`/_next`) are NEVER gated by
   * this list — they're handled separately.
   */
  allowedPrefixes: readonly string[];
  /** Where to send the user when the path is disallowed. */
  defaultLanding: string;
}

export const PRODUCT_SUBDOMAINS = {
  management: {
    allowedPrefixes: [
      "/dashboard",
      "/owner",
      "/field",
      "/stay",
      "/login",
      "/setup",
      "/sign-up",
      "/accept-invitation",
      "/no-product-access",
      "/legal",
    ],
    defaultLanding: "/",
  },
  development: {
    allowedPrefixes: [
      "/development-os",
      "/investor-portal",
      "/buyer-portal",
      "/vendor",
      "/login",
      "/setup",
      "/sign-up",
      "/accept-invitation",
      "/no-product-access",
      "/legal",
    ],
    defaultLanding: "/",
  },
  subscription: {
    // Public sales surface — content lands in Sprint 3. For now the
    // existing marketing pages (currently under (public)/*) are the
    // canonical sales pages, so they're allowed here. Sprint 3 will
    // add /pricing/* etc. and may move a few of these around.
    allowedPrefixes: [
      "/pricing",
      "/signup",
      "/products",
      "/portfolio",
      "/case-studies",
      "/contact",
      "/guest-experience",
      "/operations",
      "/investor-reporting",
      "/owner-portal",
      "/villa-management",
      "/development",
      "/book",
      "/login",
      "/accept-invitation",
      "/no-product-access",
      "/legal",
    ],
    defaultLanding: "/",
  },
  platform: {
    allowedPrefixes: [
      "/platform",
      "/login",
      "/setup",
      "/accept-invitation",
      "/no-product-access",
      "/legal",
    ],
    defaultLanding: "/",
  },
} as const satisfies Record<string, ProductSubdomainConfig>;

export type ProductSubdomain = keyof typeof PRODUCT_SUBDOMAINS;

// ============================================================================
// Reserved subdomains (per-tenant pass-through)
// ============================================================================

const RESERVED_SUBDOMAINS = new Set([
  "app",
  "www",
  "api",
  "marketing",
  "status",
  "docs",
  "public",
  "investors",
  // `admin` removed Sprint 2 — `platform` is the canonical platform-
  // admin subdomain now.
]);

const APEX_DOMAINS = new Set([
  "arconique.com",
  "localhost",
  "127.0.0.1",
  "vercel.app",
]);

// ============================================================================
// Pure helpers — exported for tests
// ============================================================================

/**
 * Parses the host and returns the first sub-label if it's a known
 * product subdomain (e.g. `management.arconique.com` → `"management"`).
 * Returns null otherwise. Handles both production hosts and the
 * `<product>.localhost` dev pattern.
 */
export function detectProductSubdomain(
  host: string,
): ProductSubdomain | null {
  const lower = host.toLowerCase().split(":")[0];
  if (APEX_DOMAINS.has(lower)) return null;
  const parts = lower.split(".");
  if (parts.length < 2) return null;
  const first = parts[0];
  if (first in PRODUCT_SUBDOMAINS) return first as ProductSubdomain;
  return null;
}

/**
 * Returns true if `pathname` is allowed on the given product subdomain.
 * Allowed if:
 *   - pathname === "/"
 *   - pathname starts with one of the product's allowedPrefixes
 *     (with a "/"-boundary or end-of-string after the prefix)
 * Data-plane (`/api/*`) is always allowed; the caller handles that
 * before calling this helper.
 */
export function isPathAllowedOnProduct(
  product: ProductSubdomain,
  pathname: string,
): boolean {
  if (pathname === "/") return true;
  const cfg = PRODUCT_SUBDOMAINS[product];
  for (const prefix of cfg.allowedPrefixes) {
    if (pathname === prefix) return true;
    if (pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}

/**
 * Existing Stage 7.E helper — preserved verbatim except for one new
 * guard: hosts whose first label IS a known product subdomain return
 * null (those are routed by the product layer, not the tenant layer).
 *
 * Parses the host and returns the tenant slug, or null if the host is
 * apex / reserved / a known product subdomain.
 */
export function extractTenantSlug(hostname: string): string | null {
  const lower = hostname.toLowerCase().split(":")[0];
  if (APEX_DOMAINS.has(lower)) return null;
  if (lower.endsWith(".vercel.app")) return null;

  if (lower.endsWith(".localhost")) {
    const slug = lower.replace(/\.localhost$/, "");
    if (RESERVED_SUBDOMAINS.has(slug)) return null;
    if (slug in PRODUCT_SUBDOMAINS) return null;
    return slug || null;
  }

  if (lower.endsWith(".arconique.com")) {
    const slug = lower.replace(/\.arconique\.com$/, "");
    if (RESERVED_SUBDOMAINS.has(slug)) return null;
    if (slug in PRODUCT_SUBDOMAINS) return null;
    return slug || null;
  }

  return null;
}

// ============================================================================
// Middleware entrypoint
// ============================================================================

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;

  // Data plane + static — never gated by product allow-lists. Same
  // matcher excludes _next, but /api/* must reach its route handlers
  // from every subdomain.
  const isApiRoute = pathname === "/api" || pathname.startsWith("/api/");

  // ---- Layer 1: product subdomain ----
  const product = detectProductSubdomain(hostname);
  if (product) {
    const response =
      !isApiRoute && !isPathAllowedOnProduct(product, pathname)
        ? NextResponse.redirect(
            new URL(PRODUCT_SUBDOMAINS[product].defaultLanding, request.url),
            { status: 307 },
          )
        : NextResponse.next();
    response.headers.set("x-product", product);
    response.headers.set("x-tenant-host", hostname);
    return response;
  }

  // ---- Layer 2: reserved pass-through (no tenant context) ----
  const firstLabel = hostname.toLowerCase().split(":")[0].split(".")[0];
  if (RESERVED_SUBDOMAINS.has(firstLabel)) {
    const response = NextResponse.next();
    response.headers.set("x-reserved", "true");
    response.headers.set("x-tenant-host", hostname);
    return response;
  }

  // ---- Layer 3: per-tenant slug (Stage 7.E behaviour) ----
  const tenantSlug = extractTenantSlug(hostname);
  const response = NextResponse.next();
  if (tenantSlug) {
    response.headers.set("x-tenant-slug", tenantSlug);
  }
  response.headers.set("x-tenant-host", hostname);
  return response;
}

export const config = {
  matcher: [
    // Match everything except _next/static, _next/image, and favicon.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

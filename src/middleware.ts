/**
 * Sprint ARCH-1 — host-aware subdomain routing.
 *
 * Layered on top of Sprint 2's per-product subdomain table.
 *
 * Four concerns, layered top → bottom:
 *
 *  0. Cross-product canonicalisation (ARCH-1, new)
 *     If the visitor lands on `management.arconique.com/development-os/…`
 *     (i.e. a path that uniquely belongs to a different product), we
 *     307-redirect to the right product subdomain preserving the
 *     pathname + search. Skipped on localhost / *.vercel.app preview
 *     hosts so dev convenience stays intact.
 *
 *  1. Per-product subdomain (Sprint 2, extended)
 *     `<product>.arconique.com` routes the user into one of four
 *     product surfaces (management / development / subscription /
 *     platform). The middleware:
 *       - parses the host
 *       - matches against the PRODUCT_SUBDOMAINS table
 *       - rewrites `/` to a product-specific landing (mgmt + dev get
 *         placeholder pages under `src/app/landing/*`; subscription
 *         keeps the existing umbrella sales home; platform rewrites
 *         to `/platform` where the layout gates super_admin)
 *       - if the pathname is allowed on that product → stamps an
 *         `x-product: <name>` header and passes through
 *       - if NOT allowed → 307-redirects to the product's defaultLanding
 *       - `/api/*` is always allowed (data plane, not UI)
 *
 *  2. Per-tenant slug (Stage 7.E)
 *     `<tenant>.arconique.com` stamps an `x-tenant-slug: <slug>` header.
 *
 *  3. Reserved subdomains (Stage 7.E)
 *     `app, www, api, marketing, status, docs, public, investors` pass
 *     through with `x-reserved: true`.
 *
 * Platform admin role gate: enforced server-side in
 * `src/app/(platform-app)/layout.tsx` via `getCurrentUserContext()`.
 * Middleware doesn't resolve Supabase sessions (Edge runtime + DB-free)
 * — we only restrict which paths the platform subdomain serves; the
 * layout handles the anonymous→/login and non-admin→/no-product-access
 * redirects on render.
 */

import { type NextRequest, NextResponse } from "next/server";

// ============================================================================
// Product subdomain configuration
// ============================================================================

export interface ProductSubdomainConfig {
  allowedPrefixes: readonly string[];
  defaultLanding: string;
}

export const PRODUCT_SUBDOMAINS = {
  management: {
    allowedPrefixes: [
      "/dashboard",
      "/owner",
      "/field",
      "/stay",
      "/landing/management-os",
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
      "/landing/development-os",
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
    // Public sales surface — content inventory at docs/audits/
    // 2026-05-13-sprint-3a-content-inventory.md.
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
      "/book",
      "/features",
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
]);

const APEX_DOMAINS = new Set([
  "arconique.com",
  "localhost",
  "127.0.0.1",
  "vercel.app",
]);

/** Hosts that get the cross-product redirect skip — we want `localhost:3000`
 *  and preview deploys to render whatever path the dev typed without bouncing
 *  to a real subdomain (which probably isn't even reachable from their
 *  laptop). Product subdomain detection on these hosts still works for the
 *  `<product>.localhost` dev pattern. */
export function isLocalOrPreviewHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().split(":")[0];
  if (lower === "localhost" || lower === "127.0.0.1") return true;
  if (lower.endsWith(".localhost")) return true;
  if (lower.endsWith(".vercel.app")) return true;
  return false;
}

// ============================================================================
// Pure helpers — exported for tests
// ============================================================================

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

/** ARCH-1 — every prefix that appears under exactly one product. Used
 *  to cross-redirect: a request to `management.arconique.com/dashboard`
 *  matches `/dashboard` uniquely under `management`, so a hit at
 *  `/dashboard` from the `development` subdomain bounces to
 *  `management.arconique.com/dashboard`.
 *
 *  Computed once at module load — the PRODUCT_SUBDOMAINS table is a
 *  `const`, so this set is effectively static. */
function buildUniquePrefixMap(): Map<string, ProductSubdomain> {
  const counts = new Map<string, ProductSubdomain[]>();
  for (const product of Object.keys(PRODUCT_SUBDOMAINS) as ProductSubdomain[]) {
    for (const prefix of PRODUCT_SUBDOMAINS[product].allowedPrefixes) {
      const list = counts.get(prefix) ?? [];
      list.push(product);
      counts.set(prefix, list);
    }
  }
  const unique = new Map<string, ProductSubdomain>();
  for (const [prefix, products] of counts) {
    if (products.length === 1) unique.set(prefix, products[0]);
  }
  return unique;
}

const UNIQUE_PREFIX_TO_PRODUCT = buildUniquePrefixMap();

/** Find the product that uniquely owns this pathname's prefix, or null
 *  if the path is shared (`/login`, `/legal`, etc.) or not recognised. */
export function detectPathProduct(
  pathname: string,
): ProductSubdomain | null {
  for (const [prefix, product] of UNIQUE_PREFIX_TO_PRODUCT) {
    if (pathname === prefix) return product;
    if (pathname.startsWith(prefix + "/")) return product;
  }
  return null;
}

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

/** ARCH-1 — rewrite target for `/` on a product subdomain. Returns null
 *  when `/` should pass through (subscription keeps the umbrella sales
 *  home; localhost / preview keeps current behaviour). */
function rootRewriteTarget(product: ProductSubdomain): string | null {
  switch (product) {
    case "management":
      return "/landing/management-os";
    case "development":
      return "/landing/development-os";
    case "platform":
      return "/platform";
    case "subscription":
      return null;
  }
}

// ============================================================================
// Middleware entrypoint
// ============================================================================

function withProductHeaders(
  response: NextResponse,
  product: ProductSubdomain,
  hostname: string,
): NextResponse {
  response.headers.set("x-product", product);
  response.headers.set("x-tenant-host", hostname);
  return response;
}

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;

  const isApiRoute = pathname === "/api" || pathname.startsWith("/api/");

  // ---- Layer 1: product subdomain ----
  const product = detectProductSubdomain(hostname);
  if (product) {
    // /api/* — always pass through, before any rewrite or redirect.
    if (isApiRoute) {
      return withProductHeaders(NextResponse.next(), product, hostname);
    }

    // Root path → product-specific landing rewrite.
    if (pathname === "/") {
      const target = rootRewriteTarget(product);
      if (target) {
        return withProductHeaders(
          NextResponse.rewrite(new URL(target, request.url)),
          product,
          hostname,
        );
      }
      return withProductHeaders(NextResponse.next(), product, hostname);
    }

    // Cross-product canonicalisation — only in production. Localhost +
    // *.vercel.app render the path as-is so devs/previews never need DNS
    // for sibling subdomains.
    if (!isLocalOrPreviewHost(hostname)) {
      const pathProduct = detectPathProduct(pathname);
      if (pathProduct && pathProduct !== product) {
        const canonical = new URL(request.nextUrl.toString());
        canonical.protocol = "https:";
        canonical.host = `${pathProduct}.arconique.com`;
        canonical.port = "";
        return NextResponse.redirect(canonical, { status: 307 });
      }
    }

    // Allowed on this product? If not, bounce to its defaultLanding.
    if (!isPathAllowedOnProduct(product, pathname)) {
      return withProductHeaders(
        NextResponse.redirect(
          new URL(PRODUCT_SUBDOMAINS[product].defaultLanding, request.url),
          { status: 307 },
        ),
        product,
        hostname,
      );
    }

    return withProductHeaders(NextResponse.next(), product, hostname);
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

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
 *     `<product>.arconique.com` routes the user into one of three
 *     product surfaces (management / development / subscription).
 *     The middleware:
 *       - parses the host
 *       - matches against the PRODUCT_SUBDOMAINS table
 *       - rewrites `/` to a product-specific landing (mgmt + dev get
 *         placeholder pages under `src/app/landing/*`; subscription
 *         keeps the existing umbrella sales home)
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
 * PLATFORM-ROUTING-FIX (2026-05-19) — there is no `platform.*`
 * subdomain. `/platform/*` paths serve from whichever subdomain the
 * super_admin signs in on (Mgmt / Dev / tenant); the layout's
 * super_admin gate IS the security boundary, not the hostname. Vercel
 * doesn't have DNS for `platform.arconique.com`, so the previous
 * cross-product redirect produced a "Deployment not found" page.
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
      // HF-13 — canonical Mgmt landing on this subdomain. `/` rewrites
      // here; direct hits at `/products/management-os` must pass the
      // allow-list without bouncing to defaultLanding.
      "/products/management-os",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/auth",
      "/setup",
      "/sign-up",
      "/accept-invitation",
      "/no-product-access",
      "/legal",
      // PLATFORM-ROUTING-HOTFIX-2 — completes 681fd6d. The `platform`
      // subdomain entry was removed but /platform was not added to the
      // surviving subdomains' allow-lists, so super_admin requests were
      // 307'd to `/` by the deny path at the bottom of middleware()
      // before the (platform-app)/layout.tsx role gate could fire. The
      // layout's `isSuperAdminContext()` check is the real security
      // boundary; the host is not.
      "/platform",
    ],
    defaultLanding: "/",
  },
  development: {
    allowedPrefixes: [
      "/development-os",
      "/investor-portal",
      "/buyer-portal",
      "/vendor",
      "/products/development-os",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/auth",
      "/setup",
      "/sign-up",
      "/accept-invitation",
      "/no-product-access",
      "/legal",
      // PLATFORM-ROUTING-HOTFIX-2 — see management entry for rationale.
      "/platform",
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
      "/forgot-password",
      "/reset-password",
      "/auth",
      "/accept-invitation",
      "/no-product-access",
      "/legal",
      // PLATFORM-ROUTING-HOTFIX-2 — see management entry for rationale.
      "/platform",
    ],
    defaultLanding: "/",
  },
  // PLATFORM-ROUTING-FIX (2026-05-19) — `platform` subdomain removed.
  // Vercel doesn't have DNS for `platform.arconique.com`, and the
  // cross-product canonicalisation sweep at line ~384 was 307-redirecting
  // every `/platform/*` request to it, producing "Deployment not found"
  // for super_admins. Solution: keep `/platform/*` as a regular route
  // group inside whichever subdomain the super_admin signed in on. The
  // (platform-app)/layout.tsx already gates super_admin via
  // getCurrentUserContext(); that role check is the actual security
  // boundary, not the hostname.
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

/** ARCH-1 + HF-13 — rewrite target for `/` on a product subdomain.
 *  Returns null when `/` should pass through (subscription keeps the
 *  umbrella sales home; localhost / preview keeps current behaviour).
 *
 *  HF-13: `/` on the mgmt/dev subdomains rewrites to the canonical
 *  `_handoff/` landing (Tasks 3+4) under `/products/<slug>` instead
 *  of the original `/landing/<slug>` placeholders. The placeholder
 *  routes were retired in this hotfix. */
function rootRewriteTarget(product: ProductSubdomain): string | null {
  switch (product) {
    case "management":
      return "/products/management-os";
    case "development":
      return "/products/development-os";
    case "subscription":
      return null;
  }
}

/** HF-13 — direct cross-product landing redirects. Sending the user
 *  who lands on `management.arconique.com/products/development-os` to
 *  `development.arconique.com/` (canonical root) is cleaner than
 *  bouncing to `subscription.arconique.com/products/development-os`,
 *  which is where the generic unique-prefix routing would otherwise
 *  send them (since `/products` is a subscription-owned prefix).
 *
 *  Checked BEFORE the generic `detectPathProduct` so it wins for
 *  these two specific paths. */
const PRODUCT_LANDING_TO_SUBDOMAIN: Record<string, ProductSubdomain> = {
  "/products/management-os": "management",
  "/products/development-os": "development",
};

function landingTargetForPath(
  pathname: string,
): ProductSubdomain | null {
  for (const [prefix, product] of Object.entries(PRODUCT_LANDING_TO_SUBDOMAIN)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return product;
    }
  }
  return null;
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

  // ---- Preview/local `?product=` palette override (dev QA only) ----
  // On *.vercel.app + localhost ONLY, allow forcing the product palette via
  // `?product=management|development|subscription` so a preview deploy
  // can be eyeballed per product. Deliberately IGNORED on real *.arconique.com
  // hosts — there `x-product` comes solely from the subdomain (the security
  // boundary). Reversible: delete this block to remove the override.
  if (!isApiRoute && isLocalOrPreviewHost(hostname)) {
    const forced = request.nextUrl.searchParams.get("product");
    if (
      forced === "management" ||
      forced === "development" ||
      forced === "subscription"
    ) {
      const res = NextResponse.next();
      res.headers.set("x-product", forced);
      res.headers.set("x-tenant-host", hostname);
      return res;
    }
  }

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

    // HF-13 — `/products/<slug>` is authoritative routing. Three cases:
    //
    //   1. current product matches the slug         → pass through,
    //      this is the canonical landing on its own subdomain.
    //   2. current product is subscription          → pass through,
    //      subscription serves /products/* as the marketing umbrella
    //      (don't bounce deep-linked customer URLs).
    //   3. current product is anything else (mgmt, dev) on a different
    //      slug                                     → 307 to the
    //      canonical subdomain ROOT (not the /products path), in
    //      production only (skip on localhost / preview).
    //
    // Runs BEFORE the generic unique-prefix sweep AND short-circuits
    // it for these paths — otherwise the generic sweep would see
    // `/products/management-os` as uniquely management-owned (after
    // adding it to management.allowedPrefixes for HF-13) and bounce
    // subscription's umbrella surface away.
    const landingProduct = landingTargetForPath(pathname);
    if (landingProduct) {
      if (landingProduct === product || product === "subscription") {
        // Fall through to the allow-list check below.
      } else if (!isLocalOrPreviewHost(hostname)) {
        const canonical = new URL(request.nextUrl.toString());
        canonical.protocol = "https:";
        canonical.host = `${landingProduct}.arconique.com`;
        canonical.port = "";
        canonical.pathname = "/";
        canonical.search = "";
        return NextResponse.redirect(canonical, { status: 307 });
      }
      // On localhost / preview: pass through (render the path as-is).
      // Fall through to the allow-list check.
    }

    // Cross-product canonicalisation — only in production. Localhost +
    // *.vercel.app render the path as-is so devs/previews never need DNS
    // for sibling subdomains.
    //
    // HF-13: skip this entire block when the path is `/products/<slug>`
    // — it was already handled definitively above. Without this guard
    // the generic sweep would treat `/products/management-os` as
    // uniquely management-owned (after the HF-13 allowedPrefixes
    // addition) and bounce subscription's umbrella surface to mgmt.
    if (!isLocalOrPreviewHost(hostname) && landingProduct === null) {
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
    // Match everything except static assets served from /public. Without
    // these exclusions the host-aware allow-list bounces requests like
    // /manifest.json or /icons/* to `/` (defaultLanding), so the browser
    // receives HTML when it expects JSON / an image and surfaces a
    // "Manifest: Syntax error" or broken icon.
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icons/|landing/).*)",
  ],
};

/**
 * Stage 7.E — Tenant subdomain resolver middleware.
 *
 * Parses the request hostname for a tenant subdomain (e.g.,
 * `acme.arconique.com` → tenant slug `acme`) and stamps it on a request
 * header (`x-tenant-slug`) that downstream server components can read
 * via `headers()`.
 *
 * Reserved subdomains pass through without tenant context:
 *   - app, www, api, marketing, status, docs, public
 *   - investors  (Stage 7.E future — investor portal subdomain)
 *
 * Apex domain (no subdomain) → no tenant context. The marketing site +
 * sign-up flow live there.
 *
 * Per-org tenant context (resolving slug → org_id from the database)
 * is intentionally NOT done here — the middleware runs on the Edge
 * runtime where DB access is constrained. The header carries only the
 * slug; server components do the resolution + caching.
 */

import { type NextRequest, NextResponse } from "next/server";

const RESERVED_SUBDOMAINS = new Set([
  "app",
  "www",
  "api",
  "marketing",
  "status",
  "docs",
  "public",
  "investors",
  "admin",
]);

const APEX_DOMAINS = new Set([
  "arconique.com",
  "localhost",
  "127.0.0.1",
  "vercel.app",
]);

export function extractTenantSlug(hostname: string): string | null {
  const lower = hostname.toLowerCase().split(":")[0]; // strip port
  if (APEX_DOMAINS.has(lower)) return null;

  // Vercel preview: `<branch>--<project>.vercel.app` — treat as apex.
  if (lower.endsWith(".vercel.app")) return null;

  // Localhost dev — `<slug>.localhost` is supported for testing.
  if (lower.endsWith(".localhost")) {
    const slug = lower.replace(/\.localhost$/, "");
    if (RESERVED_SUBDOMAINS.has(slug)) return null;
    return slug || null;
  }

  // Production: `<slug>.arconique.com`.
  if (lower.endsWith(".arconique.com")) {
    const slug = lower.replace(/\.arconique\.com$/, "");
    if (RESERVED_SUBDOMAINS.has(slug)) return null;
    return slug || null;
  }

  // Custom domains (Pro/Enterprise) — caller-side resolution by exact
  // hostname match against `organizations.custom_domain`. The header
  // carries the full hostname for that case.
  return null;
}

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const tenantSlug = extractTenantSlug(hostname);

  // Always pass the request through; just stamp the header so downstream
  // server components / route handlers can read it.
  const response = NextResponse.next();
  if (tenantSlug) {
    response.headers.set("x-tenant-slug", tenantSlug);
  }
  // Always preserve the raw host for custom-domain resolution.
  response.headers.set("x-tenant-host", hostname);
  return response;
}

export const config = {
  matcher: [
    // Match everything except _next/static, _next/image, and favicon.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

/**
 * Cross-product CTA URLs.
 *
 * Paths uniquely owned by one product subdomain (see `src/middleware.ts`
 * allowedPrefixes) get 307-redirected cross-origin when accessed from a
 * sibling host. When a Next.js `<Link>` triggers an RSC prefetch
 * `fetch()` for one of those paths from the wrong host, the cross-origin
 * redirect is CORS-blocked and the prefetch fails.
 *
 * Resolution: when rendering a CTA that targets a path owned by another
 * product subdomain, use a plain `<a href={subscriptionUrl(path)}>`
 * (or `managementUrl` / `developmentUrl`) instead of `<Link href={path}>`.
 * Top-level navigations follow cross-origin redirects without CORS, and
 * we skip the redirect hop entirely.
 *
 * On the canonical host these still resolve as same-origin navigations —
 * safe to use unconditionally from shared layouts.
 */
const SUBSCRIPTION_ORIGIN = "https://subscription.arconique.com";
const MANAGEMENT_ORIGIN = "https://management.arconique.com";
const DEVELOPMENT_ORIGIN = "https://development.arconique.com";

export function subscriptionUrl(path: string): string {
  return `${SUBSCRIPTION_ORIGIN}${path}`;
}

export function managementUrl(path: string): string {
  return `${MANAGEMENT_ORIGIN}${path}`;
}

export function developmentUrl(path: string): string {
  return `${DEVELOPMENT_ORIGIN}${path}`;
}

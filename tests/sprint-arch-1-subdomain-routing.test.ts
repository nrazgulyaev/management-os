/**
 * Sprint ARCH-1 — host-aware subdomain routing acceptance.
 *
 * Verifies the new pure helpers + the cross-product / root-rewrite /
 * cookie-domain wiring layered on top of Sprint 2.
 *
 * Behaviour of the `middleware()` function itself is exercised through
 * its pure helpers — the edge runtime is hostile to a node:test harness
 * (Sprint 2 closure notes for context), so we test source-inspect
 * invariants for the routing layer + run the helpers directly for the
 * data-layer guarantees.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// ============================================================================
// detectPathProduct — unique-prefix routing
// ============================================================================

test("arch-1 — detectPathProduct routes unique paths to the canonical product", async () => {
  const { detectPathProduct } = await import("../src/middleware");
  assert.equal(detectPathProduct("/dashboard"), "management");
  assert.equal(detectPathProduct("/dashboard/finance/expenses"), "management");
  assert.equal(detectPathProduct("/owner"), "management");
  assert.equal(detectPathProduct("/field"), "management");
  assert.equal(detectPathProduct("/stay/abc"), "management");
  assert.equal(detectPathProduct("/development-os"), "development");
  assert.equal(detectPathProduct("/development-os/cabinets/x"), "development");
  assert.equal(detectPathProduct("/investor-portal"), "development");
  assert.equal(detectPathProduct("/buyer-portal"), "development");
  assert.equal(detectPathProduct("/vendor/service/abc"), "development");
  assert.equal(detectPathProduct("/pricing"), "subscription");
  assert.equal(detectPathProduct("/products"), "subscription");
  assert.equal(detectPathProduct("/portfolio"), "subscription");
  assert.equal(detectPathProduct("/case-studies"), "subscription");
  assert.equal(detectPathProduct("/platform"), "platform");
  assert.equal(detectPathProduct("/platform/organizations"), "platform");
});

test("arch-1 — detectPathProduct returns null for shared paths (login, legal, etc.)", async () => {
  const { detectPathProduct } = await import("../src/middleware");
  // /login appears under all 4 products → shared, no canonical owner.
  assert.equal(detectPathProduct("/login"), null);
  assert.equal(detectPathProduct("/legal"), null);
  assert.equal(detectPathProduct("/legal/terms"), null);
  assert.equal(detectPathProduct("/accept-invitation"), null);
  assert.equal(detectPathProduct("/no-product-access"), null);
});

test("arch-1 — detectPathProduct returns null for unrecognised paths", async () => {
  const { detectPathProduct } = await import("../src/middleware");
  assert.equal(detectPathProduct("/random-route"), null);
  assert.equal(detectPathProduct("/foo/bar"), null);
});

// ============================================================================
// isLocalOrPreviewHost — cross-product redirect bypass
// ============================================================================

test("arch-1 — isLocalOrPreviewHost matches localhost + 127.0.0.1 + *.localhost + *.vercel.app", async () => {
  const { isLocalOrPreviewHost } = await import("../src/middleware");
  assert.equal(isLocalOrPreviewHost("localhost"), true);
  assert.equal(isLocalOrPreviewHost("localhost:3000"), true);
  assert.equal(isLocalOrPreviewHost("127.0.0.1"), true);
  assert.equal(isLocalOrPreviewHost("management.localhost"), true);
  assert.equal(isLocalOrPreviewHost("management.localhost:3000"), true);
  assert.equal(isLocalOrPreviewHost("arconique-management-git-abc.vercel.app"), true);
  assert.equal(isLocalOrPreviewHost("preview.vercel.app"), true);
});

test("arch-1 — isLocalOrPreviewHost rejects production hosts", async () => {
  const { isLocalOrPreviewHost } = await import("../src/middleware");
  assert.equal(isLocalOrPreviewHost("arconique.com"), false);
  assert.equal(isLocalOrPreviewHost("management.arconique.com"), false);
  assert.equal(isLocalOrPreviewHost("development.arconique.com"), false);
  assert.equal(isLocalOrPreviewHost("subscription.arconique.com"), false);
  assert.equal(isLocalOrPreviewHost("platform.arconique.com"), false);
  assert.equal(isLocalOrPreviewHost("acme.arconique.com"), false);
});

// ============================================================================
// Source-inspect invariants — middleware shape
// ============================================================================

test("arch-1 — middleware rewrites `/` on management to /landing/management-os", () => {
  const src = read("src/middleware.ts");
  assert.match(src, /case "management":\s*return "\/landing\/management-os"/);
});

test("arch-1 — middleware rewrites `/` on development to /landing/development-os", () => {
  const src = read("src/middleware.ts");
  assert.match(src, /case "development":\s*return "\/landing\/development-os"/);
});

test("arch-1 — middleware rewrites `/` on platform to /platform (layout enforces super_admin)", () => {
  const src = read("src/middleware.ts");
  assert.match(src, /case "platform":\s*return "\/platform"/);
});

test("arch-1 — middleware preserves subscription `/` (umbrella sales home)", () => {
  const src = read("src/middleware.ts");
  // Subscription returns null from rootRewriteTarget — falls through to
  // NextResponse.next() and renders (public)/page.tsx.
  assert.match(src, /case "subscription":\s*return null/);
});

test("arch-1 — middleware does cross-product canonical redirect only off localhost/preview", () => {
  const src = read("src/middleware.ts");
  // Cross-product block must be gated on isLocalOrPreviewHost.
  assert.match(
    src,
    /if \(!isLocalOrPreviewHost\(hostname\)\)[\s\S]{0,400}NextResponse\.redirect/,
  );
});

test("arch-1 — middleware preserves /api/* pass-through before any rewrite/redirect", () => {
  const src = read("src/middleware.ts");
  // Find the middleware() entrypoint and scan only its body.
  const entry = src.indexOf("export function middleware(");
  assert.ok(entry > 0, "middleware() entrypoint not found");
  const body = src.slice(entry);
  const apiIdx = body.indexOf("if (isApiRoute)");
  const rootIdx = body.indexOf('if (pathname === "/")');
  const crossIdx = body.indexOf("isLocalOrPreviewHost(hostname)");
  assert.ok(apiIdx > 0 && rootIdx > 0 && crossIdx > 0, "blocks missing");
  assert.ok(apiIdx < rootIdx, "/api/* must short-circuit before root rewrite");
  assert.ok(apiIdx < crossIdx, "/api/* must short-circuit before cross-product redirect");
});

// ============================================================================
// Placeholder landing pages exist
// ============================================================================

test("arch-1 — placeholder landing pages exist for mgmt + dev OS", () => {
  assert.ok(
    existsSync(resolve(ROOT, "src/app/landing/management-os/page.tsx")),
    "missing src/app/landing/management-os/page.tsx",
  );
  assert.ok(
    existsSync(resolve(ROOT, "src/app/landing/development-os/page.tsx")),
    "missing src/app/landing/development-os/page.tsx",
  );
});

test("arch-1 — landing routes added to management+development allowedPrefixes (so the rewrite target passes the allow-list)", () => {
  const src = read("src/middleware.ts");
  // The rewrite target route must itself be allowed on the matching
  // product, or a follow-up direct hit on /landing/management-os from
  // the management subdomain would 307 to /.
  const mgmtBlock = src.match(/management:\s*\{[\s\S]+?defaultLanding/)?.[0] ?? "";
  const devBlock = src.match(/development:\s*\{[\s\S]+?defaultLanding/)?.[0] ?? "";
  assert.match(mgmtBlock, /\/landing\/management-os/);
  assert.match(devBlock, /\/landing\/development-os/);
});

// ============================================================================
// Cookie domain SSO
// ============================================================================

test("arch-1 — Supabase server client sets Domain=.arconique.com when VERCEL_ENV=production", () => {
  const src = read("src/lib/supabase/server.ts");
  assert.match(src, /VERCEL_ENV.*===.*"production"/);
  assert.match(src, /domain:\s*"\.arconique\.com"/);
  // Must adjust options inside setAll so the domain applies to both
  // session refresh AND signOut clears.
  assert.match(src, /setAll[\s\S]{0,200}adjustCookieOptions/);
});

test("arch-1 — cookie domain NOT applied on preview/localhost (VERCEL_ENV != production)", () => {
  const src = read("src/lib/supabase/server.ts");
  // The adjust helper returns options unchanged when shouldUseRootDomain
  // is false → preview cookies stay host-scoped to *.vercel.app.
  assert.match(
    src,
    /shouldUseRootDomain\(\)[\s\S]{0,200}return options/,
  );
});

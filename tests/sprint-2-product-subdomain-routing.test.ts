/**
 * Sprint 2 — per-product subdomain routing acceptance.
 *
 * Tests the pure helpers exported by `src/middleware.ts`:
 *   - detectProductSubdomain(host) → "management" | "development" | …
 *   - isPathAllowedOnProduct(product, pathname) → boolean
 *   - extractTenantSlug(host) → tenant string | null (no false positives
 *     on product subdomains)
 *
 * Pure-function tests run in node:test without spinning up Next.js.
 * Behavioural tests of the middleware function itself are out of scope
 * here — Next 15 ships its NextRequest/NextResponse types but the
 * runtime requires the edge bundle, which is hostile to a node:test
 * harness. End-to-end host-routing verification happens in the Sprint 2
 * smoke-curl step (see closure notes), not here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const MIDDLEWARE = "src/middleware.ts";

// ============================================================================
// Source-inspection invariants
// ============================================================================

test("sprint-2 — middleware exports PRODUCT_SUBDOMAINS table for all 4 products", () => {
  const src = read(MIDDLEWARE);
  assert.match(src, /export const PRODUCT_SUBDOMAINS = \{/);
  for (const product of ["management", "development", "subscription", "platform"]) {
    assert.match(
      src,
      new RegExp(`\\b${product}:\\s*\\{[\\s\\S]{0,800}allowedPrefixes:`),
      `missing product subdomain entry: ${product}`,
    );
  }
});

test("sprint-2 — middleware exports detectProductSubdomain + isPathAllowedOnProduct helpers", () => {
  const src = read(MIDDLEWARE);
  assert.match(src, /export function detectProductSubdomain\(/);
  assert.match(src, /export function isPathAllowedOnProduct\(/);
});

test("sprint-2 — extractTenantSlug excludes product subdomains (so tenant `management` cannot exist)", () => {
  const src = read(MIDDLEWARE);
  // Both production + localhost branches must consult PRODUCT_SUBDOMAINS.
  // The exact paren/quote boundary varies — match the semantic shape
  // (endsWith(".localhost") → ... slug in PRODUCT_SUBDOMAINS, same for
  // .arconique.com) rather than a brittle char-by-char regex.
  assert.match(
    src,
    /endsWith\("\.localhost"\)[\s\S]{0,600}slug in PRODUCT_SUBDOMAINS/,
  );
  assert.match(
    src,
    /endsWith\("\.arconique\.com"\)[\s\S]{0,600}slug in PRODUCT_SUBDOMAINS/,
  );
});

test("sprint-2 — `admin` is no longer a reserved subdomain", () => {
  const src = read(MIDDLEWARE);
  // The reserved set should list app/www/api/marketing/status/docs/public/investors
  // but not `admin` (Sprint 2 removes it; `platform` supersedes it).
  const reservedBlock =
    src.match(/RESERVED_SUBDOMAINS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
  assert.ok(
    !/\"admin\"/.test(reservedBlock),
    "RESERVED_SUBDOMAINS still contains `admin`",
  );
  for (const r of ["app", "www", "api", "marketing"]) {
    assert.match(
      reservedBlock,
      new RegExp(`\"${r}\"`),
      `RESERVED_SUBDOMAINS missing \`${r}\``,
    );
  }
});

// ============================================================================
// detectProductSubdomain — behaviour
// ============================================================================

test("sprint-2 — detectProductSubdomain matches each of 4 products on .arconique.com", async () => {
  const { detectProductSubdomain } = await import("../src/middleware");
  assert.equal(detectProductSubdomain("management.arconique.com"), "management");
  assert.equal(detectProductSubdomain("development.arconique.com"), "development");
  assert.equal(detectProductSubdomain("subscription.arconique.com"), "subscription");
  assert.equal(detectProductSubdomain("platform.arconique.com"), "platform");
});

test("sprint-2 — detectProductSubdomain matches on *.localhost (dev pattern)", async () => {
  const { detectProductSubdomain } = await import("../src/middleware");
  assert.equal(detectProductSubdomain("management.localhost"), "management");
  assert.equal(detectProductSubdomain("development.localhost:3000"), "development");
  assert.equal(detectProductSubdomain("platform.localhost"), "platform");
});

test("sprint-2 — detectProductSubdomain returns null for apex / tenant / reserved", async () => {
  const { detectProductSubdomain } = await import("../src/middleware");
  assert.equal(detectProductSubdomain("arconique.com"), null);
  assert.equal(detectProductSubdomain("localhost"), null);
  assert.equal(detectProductSubdomain("acme.arconique.com"), null); // tenant slug
  assert.equal(detectProductSubdomain("www.arconique.com"), null); // reserved
  assert.equal(detectProductSubdomain("api.arconique.com"), null); // reserved
});

test("sprint-2 — detectProductSubdomain is case-insensitive", async () => {
  const { detectProductSubdomain } = await import("../src/middleware");
  assert.equal(detectProductSubdomain("MANAGEMENT.arconique.com"), "management");
  assert.equal(detectProductSubdomain("Platform.LocalHost"), "platform");
});

// ============================================================================
// isPathAllowedOnProduct — behaviour
// ============================================================================

test("sprint-2 — management subdomain allows /dashboard/* but not /development-os/*", async () => {
  const { isPathAllowedOnProduct } = await import("../src/middleware");
  assert.equal(isPathAllowedOnProduct("management", "/"), true);
  assert.equal(isPathAllowedOnProduct("management", "/dashboard"), true);
  assert.equal(isPathAllowedOnProduct("management", "/dashboard/finance"), true);
  assert.equal(isPathAllowedOnProduct("management", "/owner"), true);
  assert.equal(isPathAllowedOnProduct("management", "/field"), true);
  assert.equal(isPathAllowedOnProduct("management", "/stay/abc"), true);
  assert.equal(isPathAllowedOnProduct("management", "/login"), true);
  assert.equal(isPathAllowedOnProduct("management", "/development-os"), false);
  assert.equal(isPathAllowedOnProduct("management", "/platform"), false);
  assert.equal(isPathAllowedOnProduct("management", "/pricing"), false);
});

test("sprint-2 — development subdomain allows /development-os/* but not /dashboard/*", async () => {
  const { isPathAllowedOnProduct } = await import("../src/middleware");
  assert.equal(isPathAllowedOnProduct("development", "/development-os"), true);
  assert.equal(
    isPathAllowedOnProduct("development", "/development-os/cabinets/cfo-accountant"),
    true,
  );
  assert.equal(isPathAllowedOnProduct("development", "/investor-portal"), true);
  assert.equal(isPathAllowedOnProduct("development", "/buyer-portal"), true);
  assert.equal(isPathAllowedOnProduct("development", "/vendor/service/abc"), true);
  assert.equal(isPathAllowedOnProduct("development", "/dashboard"), false);
  assert.equal(isPathAllowedOnProduct("development", "/platform"), false);
});

// PLATFORM-ROUTING-FIX (2026-05-19) — `platform` subdomain removed. The
// /platform/* tree now serves on whichever subdomain the super_admin
// signs in on; the (platform-app)/layout.tsx role gate IS the
// security boundary. Vercel doesn't have DNS for platform.arconique.com,
// and the cross-product canonicalisation sweep was redirecting every
// /platform/* request there → "Deployment not found". No test for a
// `platform` subdomain now — the case can't be constructed.

test("sprint-2 — subscription subdomain allows sales paths but not product apps", async () => {
  const { isPathAllowedOnProduct } = await import("../src/middleware");
  assert.equal(isPathAllowedOnProduct("subscription", "/pricing"), true);
  assert.equal(isPathAllowedOnProduct("subscription", "/products"), true);
  assert.equal(isPathAllowedOnProduct("subscription", "/case-studies"), true);
  assert.equal(isPathAllowedOnProduct("subscription", "/portfolio"), true);
  assert.equal(isPathAllowedOnProduct("subscription", "/signup"), true);
  assert.equal(isPathAllowedOnProduct("subscription", "/contact"), true);
  assert.equal(isPathAllowedOnProduct("subscription", "/dashboard"), false);
  assert.equal(isPathAllowedOnProduct("subscription", "/development-os"), false);
  assert.equal(isPathAllowedOnProduct("subscription", "/platform"), false);
});

test("sprint-2 — prefix matching respects path boundaries (no /developmentXYZ false match)", async () => {
  const { isPathAllowedOnProduct } = await import("../src/middleware");
  // /development is a subscription prefix; /development-os is on dev subdomain.
  // /development on subscription must NOT match /development-os path
  // segment-incorrectly, but /development/anything-else SHOULD match.
  assert.equal(
    isPathAllowedOnProduct("subscription", "/developmentXYZ"),
    false,
    "raw substring match would let /developmentXYZ through",
  );
});

// ============================================================================
// extractTenantSlug — Sprint-2 product-subdomain guard
// ============================================================================

test("sprint-2 — extractTenantSlug returns null for product subdomains", async () => {
  const { extractTenantSlug } = await import("../src/middleware");
  assert.equal(extractTenantSlug("management.arconique.com"), null);
  assert.equal(extractTenantSlug("development.arconique.com"), null);
  assert.equal(extractTenantSlug("subscription.arconique.com"), null);
  assert.equal(extractTenantSlug("platform.arconique.com"), null);
  assert.equal(extractTenantSlug("management.localhost"), null);
});

test("sprint-2 — extractTenantSlug preserves Stage 7.E behaviour for true tenants", async () => {
  const { extractTenantSlug } = await import("../src/middleware");
  assert.equal(extractTenantSlug("acme.arconique.com"), "acme");
  assert.equal(extractTenantSlug("acme.localhost"), "acme");
  assert.equal(extractTenantSlug("acme.localhost:3000"), "acme");
  assert.equal(extractTenantSlug("arconique.com"), null);
  assert.equal(extractTenantSlug("www.arconique.com"), null); // reserved
});

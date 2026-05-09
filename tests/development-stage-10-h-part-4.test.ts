/**
 * Stage 10.H Part 4 — Per-product routing + auth acceptance tests.
 *
 * Covers:
 *   - src/lib/products.ts pure helpers (URL→slug, predicate, landing pick)
 *   - decideProductAccess() pure decision function (16 matrix cases)
 *   - sign-in redirect (signInAction → landingPathFor)
 *   - layout guards (Mgmt OS + Dev OS layouts call enforceProductAccess)
 *   - WorkspaceSwitcher gating (client prop drives visibility)
 *   - Brand split (Mgmt sidebar Logo subtitle vs Dev sidebar Logo subtitle)
 *   - /no-product-access page exists
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCT_SLUGS,
  PRODUCT_LABELS,
  PRODUCT_HOME,
  productForPath,
  isValidProductSlug,
  coerceProductSlugs,
  orgHasProductAccess,
  pickLandingProduct,
  type ProductSlug,
} from "../src/lib/products";

import {
  decideProductAccess,
  landingPathFor,
} from "../src/features/auth/products-access-pure";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

const DASH_LAYOUT = "src/app/(dashboard)/layout.tsx";
const DEV_LAYOUT = "src/app/(development-app)/layout.tsx";
const MGMT_SIDEBAR = "src/components/layout/dashboard-sidebar.tsx";
const DEV_SIDEBAR = "src/components/development/development-app-sidebar.tsx";
const SWITCHER = "src/components/shared/workspace-switcher.tsx";
const SIGN_IN_ACTION = "src/features/auth/actions.ts";
const NO_ACCESS_PAGE = "src/app/(public)/no-product-access/page.tsx";
const DASH_SHELL = "src/components/layout/dashboard-shell.tsx";
const DEV_SHELL = "src/components/development/development-app-shell.tsx";
const DASH_TOPBAR = "src/components/layout/dashboard-topbar.tsx";
const DEV_TOPBAR = "src/components/development/development-app-topbar.tsx";

// ============================================================================
// src/lib/products.ts — pure helpers
// ============================================================================

test("10.H Part 4 — PRODUCT_SLUGS is the closed enum ['mgmt','dev']", () => {
  assert.deepEqual([...PRODUCT_SLUGS], ["mgmt", "dev"]);
});

test("10.H Part 4 — PRODUCT_LABELS + PRODUCT_HOME both cover every slug", () => {
  for (const slug of PRODUCT_SLUGS) {
    assert.ok(PRODUCT_LABELS[slug], `label missing for ${slug}`);
    assert.ok(PRODUCT_HOME[slug], `home missing for ${slug}`);
  }
});

test("10.H Part 4 — productForPath maps URL prefixes to the correct product", () => {
  assert.equal(productForPath("/dashboard"), "mgmt");
  assert.equal(productForPath("/dashboard/inventory/items"), "mgmt");
  assert.equal(productForPath("/development-os"), "dev");
  assert.equal(productForPath("/development-os/projects/foo"), "dev");
  // Outside both products
  assert.equal(productForPath("/"), null);
  assert.equal(productForPath("/login"), null);
  assert.equal(productForPath("/api/cron/warm-routes"), null);
  // Edge: longest-match — /development-os doesn't get matched as /dashboard
  assert.equal(productForPath("/development-os"), "dev");
});

test("10.H Part 4 — isValidProductSlug + coerceProductSlugs are typed gates", () => {
  assert.equal(isValidProductSlug("mgmt"), true);
  assert.equal(isValidProductSlug("dev"), true);
  assert.equal(isValidProductSlug("ops"), false);
  assert.equal(isValidProductSlug(null), false);
  assert.equal(isValidProductSlug(123), false);
  assert.deepEqual(coerceProductSlugs(["mgmt", "dev"]), ["mgmt", "dev"]);
  assert.deepEqual(coerceProductSlugs(["mgmt", "ops", "dev"]), ["mgmt", "dev"]);
  assert.deepEqual(coerceProductSlugs(null), []);
  assert.deepEqual(coerceProductSlugs("mgmt"), []);
});

test("10.H Part 4 — orgHasProductAccess + pickLandingProduct cover the basic cases", () => {
  assert.equal(orgHasProductAccess(["mgmt", "dev"], "mgmt"), true);
  assert.equal(orgHasProductAccess(["mgmt", "dev"], "dev"), true);
  assert.equal(orgHasProductAccess(["mgmt"], "dev"), false);
  assert.equal(orgHasProductAccess([], "mgmt"), false);
  assert.equal(orgHasProductAccess(null, "mgmt"), false);
  assert.equal(pickLandingProduct(["mgmt"]), "mgmt");
  assert.equal(pickLandingProduct(["dev"]), "dev");
  assert.equal(pickLandingProduct(["mgmt", "dev"]), null, "both → caller picks");
  assert.equal(pickLandingProduct([]), null);
  assert.equal(pickLandingProduct(null), null);
});

// ============================================================================
// decideProductAccess — pure decision matrix
// ============================================================================

test("10.H Part 4 — decideProductAccess: super_admin always allowed", () => {
  for (const productsEnabled of [null, [] as ProductSlug[], ["mgmt"] as ProductSlug[], ["dev"] as ProductSlug[]]) {
    for (const product of PRODUCT_SLUGS) {
      const r = decideProductAccess({
        product,
        productsEnabled,
        isSuperAdmin: true,
        isDemoMode: false,
      });
      assert.equal(r.allowed, true);
    }
  }
});

test("10.H Part 4 — decideProductAccess: demo mode always allowed", () => {
  const r = decideProductAccess({
    product: "dev",
    productsEnabled: ["mgmt"],
    isSuperAdmin: false,
    isDemoMode: true,
  });
  assert.equal(r.allowed, true);
});

test("10.H Part 4 — decideProductAccess: null productsEnabled (no org) → no_organization", () => {
  const r = decideProductAccess({
    product: "mgmt",
    productsEnabled: null,
    isSuperAdmin: false,
    isDemoMode: false,
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "no_organization");
});

test("10.H Part 4 — decideProductAccess: empty productsEnabled → no_products_enabled", () => {
  const r = decideProductAccess({
    product: "mgmt",
    productsEnabled: [],
    isSuperAdmin: false,
    isDemoMode: false,
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "no_products_enabled");
});

test("10.H Part 4 — decideProductAccess: org has product → allowed", () => {
  const r = decideProductAccess({
    product: "mgmt",
    productsEnabled: ["mgmt", "dev"],
    isSuperAdmin: false,
    isDemoMode: false,
  });
  assert.equal(r.allowed, true);
});

test("10.H Part 4 — decideProductAccess: org missing product, has alt → product_not_enabled + alts populated", () => {
  const r = decideProductAccess({
    product: "dev",
    productsEnabled: ["mgmt"],
    isSuperAdmin: false,
    isDemoMode: false,
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "product_not_enabled");
  assert.deepEqual(r.alternativeProducts, ["mgmt"]);
});

// ============================================================================
// landingPathFor — sign-in redirect picker
// ============================================================================

test("10.H Part 4 — landingPathFor: null → /dashboard fallback (auth lookup soft-fail)", () => {
  assert.equal(landingPathFor(null), "/dashboard");
});

test("10.H Part 4 — landingPathFor: empty → /no-product-access", () => {
  assert.equal(landingPathFor([]), "/no-product-access");
});

test("10.H Part 4 — landingPathFor: single-product → that product's home", () => {
  assert.equal(landingPathFor(["mgmt"]), "/dashboard");
  assert.equal(landingPathFor(["dev"]), "/development-os");
});

test("10.H Part 4 — landingPathFor: dual-product → /dashboard default", () => {
  assert.equal(landingPathFor(["mgmt", "dev"]), "/dashboard");
});

// ============================================================================
// Layout guards — both layouts call enforceProductAccess at request time
// ============================================================================

test("10.H Part 4 — Mgmt OS layout calls enforceProductAccess('mgmt')", () => {
  const src = read(DASH_LAYOUT);
  assert.match(src, /enforceProductAccess\("mgmt"\)/);
  assert.match(src, /from "@\/features\/auth\/products-access"/);
  assert.match(src, /export default async function DashboardLayout/);
});

test("10.H Part 4 — Dev OS layout calls enforceProductAccess('dev')", () => {
  const src = read(DEV_LAYOUT);
  assert.match(src, /enforceProductAccess\("dev"\)/);
  assert.match(src, /from "@\/features\/auth\/products-access"/);
});

// ============================================================================
// Brand split — sidebars surface per-product Logo subtitle
// ============================================================================

test("10.H Part 4 — Mgmt OS sidebar Logo carries 'Management OS' subtitle", () => {
  const src = read(MGMT_SIDEBAR);
  assert.match(src, /subtitle="Management OS"/);
  assert.match(src, /title="Arconique Management OS"/);
  assert.match(src, /href="\/dashboard"/);
});

test("10.H Part 4 — Dev OS sidebar Logo carries 'Development OS' subtitle", () => {
  const src = read(DEV_SIDEBAR);
  assert.match(src, /subtitle="Development OS"/);
  assert.match(src, /title="Arconique Development OS"/);
  assert.match(src, /href="\/development-os"/);
});

// ============================================================================
// WorkspaceSwitcher gating
// ============================================================================

test("10.H Part 4 — WorkspaceSwitcher accepts enabledProducts prop", () => {
  const src = read(SWITCHER);
  assert.match(src, /enabledProducts\?:\s*ProductSlug\[\]\s*\|\s*null/);
  assert.match(
    src,
    /export type ProductSlug|import type \{[\s\S]*?ProductSlug[\s\S]*?\} from "@\/lib\/products"/,
    "must import ProductSlug from the central enum",
  );
});

test("10.H Part 4 — WorkspaceSwitcher: visibleWorkspaces filters by requiresProduct", () => {
  const src = read(SWITCHER);
  // The Mgmt + Dev workspaces must declare requiresProduct.
  assert.match(src, /requiresProduct:\s*"mgmt"/);
  assert.match(src, /requiresProduct:\s*"dev"/);
  // The pure filter exists.
  assert.match(src, /function visibleWorkspaces/);
  // Hide the switcher entirely when only one workspace is reachable.
  assert.match(src, /workspaces\.length\s*<=\s*1/);
});

// ============================================================================
// Topbars + shells thread enabledProducts through
// ============================================================================

test("10.H Part 4 — DashboardShell fetches productsEnabled + passes to topbar", () => {
  const src = read(DASH_SHELL);
  assert.match(src, /getProductsEnabledForCurrentUser/);
  assert.match(src, /enabledProducts=\{enabledProducts\}/);
});

test("10.H Part 4 — DevelopmentAppShell fetches productsEnabled + passes to topbar", () => {
  const src = read(DEV_SHELL);
  assert.match(src, /getProductsEnabledForCurrentUser/);
  assert.match(src, /enabledProducts=\{enabledProducts\}/);
  assert.match(src, /export async function DevelopmentAppShell/);
});

test("10.H Part 4 — both topbars forward enabledProducts to WorkspaceSwitcher", () => {
  for (const f of [DASH_TOPBAR, DEV_TOPBAR]) {
    const src = read(f);
    assert.match(
      src,
      /WorkspaceSwitcher\s+enabledProducts=\{enabledProducts\}/,
      `${f} must forward the prop`,
    );
  }
});

// ============================================================================
// Sign-in redirect logic
// ============================================================================

test("10.H Part 4 — signInAction picks landing via products-access", () => {
  const src = read(SIGN_IN_ACTION);
  assert.match(src, /getProductsEnabledForCurrentUser/);
  assert.match(src, /landingPathFor/);
  // No more hardcoded "/dashboard" redirect after sign-in success — must be
  // dynamic via landingPath variable.
  assert.match(src, /redirect\(landingPath\)/);
  assert.doesNotMatch(
    src,
    /\bredirect\("\/dashboard"\);?\s*\n\}/,
    "old hardcoded redirect must be removed from signInAction",
  );
});

// ============================================================================
// /no-product-access page
// ============================================================================

test("10.H Part 4 — /no-product-access page exists with sign-out CTA", () => {
  assert.ok(exists(NO_ACCESS_PAGE), `Missing ${NO_ACCESS_PAGE}`);
  const src = read(NO_ACCESS_PAGE);
  assert.match(src, /No product access/i);
  assert.match(src, /signOutAction/);
});

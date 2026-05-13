/**
 * Sprint 2 — product landing skeleton + product-aware login.
 *
 * Source-inspection invariants for:
 *   - the ProductLanding component (per-product copy + branding tones)
 *   - (public)/page.tsx short-circuit on x-product header
 *   - (auth)/login/page.tsx reads x-product + passes to LoginForm
 *   - LoginForm threads `product` into the form as a hidden input
 *   - signInAction parses the hidden field and prefers the
 *     PRODUCT_LANDING path over the Stage-10.H products_enabled lookup
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

const LANDING = "src/components/product-landing/product-landing.tsx";
const APEX = "src/app/(public)/page.tsx";
const LOGIN_PAGE = "src/app/(auth)/login/page.tsx";
const LOGIN_FORM = "src/app/(auth)/login/form.tsx";
const AUTH_ACTIONS = "src/features/auth/actions.ts";

// ============================================================================
// ProductLanding component
// ============================================================================

test("sprint-2 — ProductLanding component ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, LANDING)));
});

test("sprint-2 — ProductLanding exports the kind type and the component", () => {
  const src = read(LANDING);
  assert.match(src, /export type ProductLandingKind/);
  assert.match(src, /export function ProductLanding\(/);
});

test("sprint-2 — ProductLanding has per-product copy for mgmt/dev/subscription", () => {
  const src = read(LANDING);
  for (const k of ["management", "development", "subscription"]) {
    assert.match(
      src,
      new RegExp(`\\b${k}:\\s*\\{[\\s\\S]{0,1200}eyebrow`),
      `missing CONTENT entry for ${k}`,
    );
  }
});

test("sprint-2 — ProductLanding maps each product to a hero gradient tone token", () => {
  const src = read(LANDING);
  assert.match(src, /bg-gradient-emerald-soft/);
  assert.match(src, /bg-gradient-gold-soft/);
  assert.match(src, /bg-gradient-coral-soft/);
});

// ============================================================================
// Apex page — header-driven short-circuit
// ============================================================================

test("sprint-2 — (public)/page.tsx reads x-product header and branches", () => {
  const src = read(APEX);
  assert.match(src, /from "next\/headers"/);
  assert.match(src, /x-product/);
  assert.match(src, /<ProductLanding/);
});

test("sprint-2 — (public)/page.tsx redirects platform subdomain to /platform", () => {
  const src = read(APEX);
  assert.match(
    src,
    /product === "platform"[\s\S]{0,200}redirect\("\/platform"\)/,
  );
});

test("sprint-2 — (public)/page.tsx is dynamic (headers() forces SSR)", () => {
  const src = read(APEX);
  assert.match(src, /export const dynamic = "force-dynamic"/);
});

// ============================================================================
// Login page — product-aware copy + form prop
// ============================================================================

test("sprint-2 — login page reads x-product and threads it into LoginForm", () => {
  const src = read(LOGIN_PAGE);
  assert.match(src, /from "next\/headers"/);
  assert.match(src, /x-product/);
  assert.match(src, /<LoginForm[\s\S]{0,200}product=\{product\}/);
});

test("sprint-2 — login page has per-product copy table for all 4 products", () => {
  const src = read(LOGIN_PAGE);
  for (const k of ["management", "development", "platform", "subscription"]) {
    assert.match(
      src,
      new RegExp(`\\b${k}:\\s*\\{[\\s\\S]{0,400}workspaceLabel`),
      `missing PRODUCT_COPY entry for ${k}`,
    );
  }
});

// ============================================================================
// LoginForm — hidden product input
// ============================================================================

test("sprint-2 — LoginForm accepts `product` prop", () => {
  const src = read(LOGIN_FORM);
  assert.match(src, /product\?: string/);
});

test("sprint-2 — LoginForm renders a hidden product input when prop is set", () => {
  const src = read(LOGIN_FORM);
  assert.match(
    src,
    /type="hidden" name="product" value=\{product\}/,
  );
});

// ============================================================================
// signInAction — product-aware post-login redirect
// ============================================================================

test("sprint-2 — signInAction's credSchema accepts an optional product enum", () => {
  const src = read(AUTH_ACTIONS);
  // The enum must list all four products. Tolerate any whitespace
  // between `z` and `.enum` (the formatter chain-wraps the expression).
  assert.match(
    src,
    /product:[\s\S]{0,200}z\s*\.\s*enum\(\["management", "development", "subscription", "platform"\]\)/,
  );
});

test("sprint-2 — signInAction has a PRODUCT_LANDING table for the post-login redirect", () => {
  const src = read(AUTH_ACTIONS);
  assert.match(src, /PRODUCT_LANDING/);
  assert.match(src, /management:\s*"\/dashboard"/);
  assert.match(src, /development:\s*"\/development-os"/);
  assert.match(src, /platform:\s*"\/platform"/);
  assert.match(src, /subscription:\s*"\/pricing"/);
});

test("sprint-2 — signInAction prefers PRODUCT_LANDING over Stage-10.H fallback when product set", () => {
  const src = read(AUTH_ACTIONS);
  // Product-hint branch executes before products_enabled lookup.
  assert.match(
    src,
    /if \(parsed\.data\.product\)[\s\S]{0,200}PRODUCT_LANDING\[parsed\.data\.product\]/,
  );
});

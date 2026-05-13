/**
 * Sprint 3b — pricing reconciliation acceptance.
 *
 * Source-inspection + behavioural tests covering:
 *   - marketing-mapping module invariants (all 12 cells resolve, tier
 *     spine, annual discount math)
 *   - migration 0096 shape + seed correctness (price math matches
 *     marketing-tiers values)
 *   - stripe-provision script structure (dry-run default, idempotency
 *     filter, packaging metadata)
 *   - checkout endpoint wiring (packaging_key input + stripe metadata)
 *   - upgrade page wiring (planPackaging + sortOrder + current detection)
 *   - pricing page wiring (cycle toggle + per-cycle CTAs)
 *   - .env.example documents the three Stripe envs
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

const MAPPING = "src/lib/billing/marketing-mapping.ts";
const TIERS = "src/lib/marketing/pricing-tiers.ts";
const MIGRATION = "drizzle/0096_plan_packaging.sql";
const SCHEMA = "src/lib/db/schema/subscriptions.ts";
const SCRIPT = "scripts/stripe-provision.ts";
const CHECKOUT = "src/app/api/billing/checkout/route.ts";
const UPGRADE = "src/app/(dashboard)/dashboard/billing/upgrade/page.tsx";
const UPGRADE_BTN =
  "src/app/(dashboard)/dashboard/billing/upgrade/upgrade-button.tsx";
const PRICING = "src/app/(public)/pricing/page.tsx";
const CYCLE_TOGGLE = "src/components/marketing/pricing-cycle-toggle.tsx";
const ENV_EXAMPLE = ".env.example";
const PACKAGE_JSON = "package.json";

// ============================================================================
// Marketing-mapping module
// ============================================================================

test("sprint-3b — marketing-mapping module ships", () => {
  assert.ok(existsSync(resolve(ROOT, MAPPING)));
});

test("sprint-3b — all 12 cells resolve to a packaging mapping", async () => {
  const { ALL_MARKETING_MAPPINGS, resolveMarketingMapping } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  assert.equal(ALL_MARKETING_MAPPINGS.length, 12);
  // Spot-check: each plan kind has 4 tiers.
  for (const planKind of [
    "management-only",
    "development-only",
    "bundle",
  ] as const) {
    const count = ALL_MARKETING_MAPPINGS.filter(
      (m) => m.planKind === planKind,
    ).length;
    assert.equal(count, 4, `${planKind} should have 4 tiers`);
  }
  // Spine: tier → plan_code is shared across all three kinds.
  for (const planKind of [
    "management-only",
    "development-only",
    "bundle",
  ] as const) {
    assert.equal(resolveMarketingMapping(planKind, "starter").planCode, "basic");
    assert.equal(resolveMarketingMapping(planKind, "pro").planCode, "standard");
    assert.equal(resolveMarketingMapping(planKind, "scale").planCode, "pro");
    assert.equal(
      resolveMarketingMapping(planKind, "enterprise").planCode,
      "enterprise",
    );
  }
});

test("sprint-3b — products_enabled per plan kind is correct", async () => {
  const { resolveMarketingMapping } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  assert.deepEqual(
    resolveMarketingMapping("management-only", "pro").productsEnabled,
    ["mgmt"],
  );
  assert.deepEqual(
    resolveMarketingMapping("development-only", "pro").productsEnabled,
    ["dev"],
  );
  assert.deepEqual(
    [...resolveMarketingMapping("bundle", "pro").productsEnabled].sort(),
    ["dev", "mgmt"],
  );
});

test("sprint-3b — packagingKeyFor derives stable ids", async () => {
  const { packagingKeyFor } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  assert.equal(packagingKeyFor("management-only", "pro"), "mgmt-only-pro");
  assert.equal(packagingKeyFor("development-only", "scale"), "dev-only-scale");
  assert.equal(packagingKeyFor("bundle", "starter"), "bundle-starter");
});

test("sprint-3b — annualPriceFromMonthly applies -15% discount × 12 months", async () => {
  const { annualPriceFromMonthly } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  // monthly $100 → annual = round(100 × 12 × 0.85) = $1020
  assert.equal(annualPriceFromMonthly(100), 1020);
  // Sprint-3a Bundle Pro: monthly $499 → annual = round(499 × 12 × 0.85) = 5090
  assert.equal(annualPriceFromMonthly(499), 5090);
});

test("sprint-3b — mappingByPackagingKey reverse lookup", async () => {
  const { mappingByPackagingKey } = await import(
    "../src/lib/billing/marketing-mapping"
  );
  const m = mappingByPackagingKey("bundle-scale");
  assert.ok(m);
  assert.equal(m!.planKind, "bundle");
  assert.equal(m!.tierKey, "scale");
  assert.equal(m!.planCode, "pro");
  assert.deepEqual([...m!.productsEnabled].sort(), ["dev", "mgmt"]);
  assert.equal(mappingByPackagingKey("does-not-exist"), null);
});

// ============================================================================
// Migration 0096 + seed
// ============================================================================

test("sprint-3b — migration 0096 ships with all 12 seed rows", () => {
  const src = read(MIGRATION);
  assert.match(src, /CREATE TABLE IF NOT EXISTS "plan_packaging"/);
  for (const key of [
    "mgmt-only-starter",
    "mgmt-only-pro",
    "mgmt-only-scale",
    "mgmt-only-enterprise",
    "dev-only-starter",
    "dev-only-pro",
    "dev-only-scale",
    "dev-only-enterprise",
    "bundle-starter",
    "bundle-pro",
    "bundle-scale",
    "bundle-enterprise",
  ]) {
    assert.match(
      src,
      new RegExp(`'${key}'`),
      `migration 0096 missing seed row: ${key}`,
    );
  }
});

test("sprint-3b — migration 0096 seed prices match Sprint-3a marketing tiers", () => {
  const src = read(MIGRATION);
  // Spot-check: bundle-pro = $499/mo, annual = round(499 × 12 × 0.85) = $5090
  // In minor units: monthly 49900, annual 508980.
  assert.match(
    src,
    /'bundle-pro'[\s\S]{0,200}49900,\s*508980/,
  );
  // mgmt-only-starter = $79/mo, annual = round(79 × 12 × 0.85) = $806 = 80580 minor.
  assert.match(
    src,
    /'mgmt-only-starter'[\s\S]{0,200}7900,\s*80580/,
  );
});

test("sprint-3b — Drizzle schema exposes planPackaging table", () => {
  const src = read(SCHEMA);
  assert.match(src, /export const planPackaging = pgTable\(/);
  assert.match(src, /packagingKey: text\("packaging_key"\)/);
  assert.match(src, /stripeProductId: text\("stripe_product_id"\)/);
  assert.match(src, /stripeMonthlyPriceId: text\("stripe_monthly_price_id"\)/);
  assert.match(src, /stripeAnnualPriceId: text\("stripe_annual_price_id"\)/);
});

// ============================================================================
// Stripe provisioning script
// ============================================================================

test("sprint-3b — stripe-provision script defaults to dry-run", () => {
  const src = read(SCRIPT);
  // `apply` is `true` only when --apply flag is present; otherwise
  // the script does no Stripe / DB writes.
  assert.match(src, /const apply = args\.includes\("--apply"\)/);
  assert.match(src, /if \(!apply\)[\s\S]{0,200}dry-run/);
});

test("sprint-3b — stripe-provision filters to un-provisioned paid rows", () => {
  const src = read(SCRIPT);
  // Idempotency: only rows with NULL stripe_product_id AND
  // monthly_price_minor > 0 get processed.
  assert.match(src, /isNull\(planPackaging\.stripeProductId\)/);
  assert.match(src, /gt\(planPackaging\.monthlyPriceMinor, 0n\)/);
});

test("sprint-3b — stripe-provision creates 3 Stripe entities per row", () => {
  const src = read(SCRIPT);
  // One product + monthly price + annual price.
  assert.match(src, /stripePost\("\/v1\/products"/);
  // Two POST /v1/prices calls in the apply branch.
  const priceCalls = (src.match(/stripePost\("\/v1\/prices"/g) ?? []).length;
  assert.ok(
    priceCalls >= 2,
    `expected ≥2 POST /v1/prices calls, got ${priceCalls}`,
  );
});

test("sprint-3b — stripe-provision stamps packaging metadata onto Stripe objects", () => {
  const src = read(SCRIPT);
  assert.match(src, /packaging_key:\s*row\.packagingKey/);
  assert.match(src, /plan_code:\s*row\.planCode/);
  assert.match(src, /products_enabled:\s*row\.productsEnabled\.join\(","\)/);
});

test("sprint-3b — package.json wires :provision (dry-run) and :provision:apply", () => {
  const pkg = JSON.parse(read(PACKAGE_JSON)) as {
    scripts: Record<string, string>;
  };
  assert.ok(pkg.scripts["stripe:provision"]);
  assert.ok(pkg.scripts["stripe:provision:apply"]);
  assert.match(
    pkg.scripts["stripe:provision:apply"],
    /scripts\/stripe-provision\.ts --apply/,
  );
});

// ============================================================================
// Checkout endpoint
// ============================================================================

test("sprint-3b — checkout accepts packaging_key + cycle, looks up plan_packaging", () => {
  const src = read(CHECKOUT);
  assert.match(src, /packaging_key:\s*z\.enum\(PACKAGING_KEYS\)/);
  assert.match(src, /\.from\(planPackaging\)/);
  assert.match(src, /packaging_not_found/);
  assert.match(src, /packaging_not_purchasable/);
});

test("sprint-3b — checkout stamps packaging metadata on session AND subscription", () => {
  const src = read(CHECKOUT);
  // session.metadata
  assert.match(src, /metadata\[packaging_key\]/);
  assert.match(src, /metadata\[products_enabled\]/);
  // subscription_data.metadata — Stripe doesn't copy session→sub
  // automatically, so we mirror packaging context for the webhook bridge.
  assert.match(src, /subscription_data\[metadata\]\[packaging_key\]/);
  assert.match(src, /subscription_data\[metadata\]\[products_enabled\]/);
});

// ============================================================================
// Upgrade page
// ============================================================================

test("sprint-3b — upgrade page reads plan_packaging + compares products_enabled for current", () => {
  const src = read(UPGRADE);
  assert.match(src, /\.from\(planPackaging\)/);
  assert.match(src, /asc\(planPackaging\.sortOrder\)/);
  // Current-packaging detection requires both plan_code AND
  // products_enabled to match.
  assert.match(src, /arraysEqualAsSet/);
  assert.match(src, /productsEnabled/);
});

test("sprint-3b — upgrade button posts packaging_key", () => {
  const src = read(UPGRADE_BTN);
  assert.match(src, /packaging_key:\s*packagingKey/);
  assert.match(src, /billing_cycle:\s*billingCycle/);
});

// ============================================================================
// Pricing page — cycle toggle wiring
// ============================================================================

test("sprint-3b — pricing-cycle-toggle component ships", () => {
  assert.ok(existsSync(resolve(ROOT, CYCLE_TOGGLE)));
  const src = read(CYCLE_TOGGLE);
  assert.match(src, /^"use client";/m);
  assert.match(src, /export function PricingCycleToggle\(/);
  // Reflects cycle on the closest grid ancestor and broadcasts a
  // CustomEvent so siblings can subscribe.
  assert.match(src, /data-pricing-grid="root"/);
  assert.match(src, /pricing-cycle-change/);
});

test("sprint-3b — /pricing page mounts the toggle + renders per-cycle CTAs", () => {
  const src = read(PRICING);
  assert.match(src, /<PricingCycleToggle/);
  // Grid carries `group` + data-cycle so Tailwind variants pick it up.
  assert.match(src, /data-pricing-grid="root"/);
  assert.match(src, /data-cycle="monthly"/);
  // CTAs encode packaging_key + per-cycle hrefs.
  assert.match(src, /\?packaging_key=\$\{packagingKey\}&cycle=monthly/);
  assert.match(src, /\?packaging_key=\$\{packagingKey\}&cycle=annual/);
  // Both CTAs render server-side; Tailwind reveals one.
  assert.match(src, /data-cycle-cta="monthly"/);
  assert.match(src, /data-cycle-cta="annual"/);
});

// ============================================================================
// .env.example
// ============================================================================

test("sprint-3b — .env.example documents the Stripe env vars", () => {
  const src = read(ENV_EXAMPLE);
  assert.match(src, /^STRIPE_SECRET_KEY=/m);
  assert.match(src, /^STRIPE_PUBLISHABLE_KEY=/m);
  assert.match(src, /^STRIPE_BILLING_WEBHOOK_SECRET=/m);
  // Mentions the test-key safety guidance.
  assert.match(src, /sk_test_/);
});

// ============================================================================
// next.config.mjs — retired pages redirect
// ============================================================================

test("sprint-3b — next.config.mjs redirects retired /pricing/{mgmt,dev}-os → /pricing", () => {
  const src = read("next.config.mjs");
  assert.match(
    src,
    /source:\s*"\/pricing\/management-os"\s*,\s*destination:\s*"\/pricing"/,
  );
  assert.match(
    src,
    /source:\s*"\/pricing\/development-os"\s*,\s*destination:\s*"\/pricing"/,
  );
});

/**
 * Sprint 3a — Sales hub + consolidated /pricing acceptance.
 *
 * Source-inspection tests (no React render harness) following the
 * same pattern as the Sprint 1/2 acceptance suites.
 *
 * Verifies:
 *   - pricing-tiers module exports PRICING_PLANS (3 columns × 4 tiers)
 *   - PRICING_FAQ ships with 5+ entries (spec says 5–8)
 *   - SalesHub component exports + uses the hero tokens
 *   - (public)/page.tsx subscription arm renders <SalesHub>
 *   - new /pricing page reads PRICING_PLANS + PRICING_FAQ
 *   - middleware subscription allow-list drops stale routes
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

const TIERS = "src/lib/marketing/pricing-tiers.ts";
const SALES_HUB = "src/components/marketing/sales-hub.tsx";
const APEX = "src/app/(public)/page.tsx";
const PRICING = "src/app/(public)/pricing/page.tsx";
const MIDDLEWARE = "src/middleware.ts";

// ============================================================================
// Pricing tiers module
// ============================================================================

test("sprint-3a — pricing-tiers module ships at documented path", () => {
  assert.ok(existsSync(resolve(ROOT, TIERS)));
});

test("sprint-3a — pricing-tiers exports PlanKind, TierKey, and PRICING_PLANS", () => {
  const src = read(TIERS);
  assert.match(src, /export type PlanKind/);
  assert.match(src, /export type TierKey/);
  assert.match(src, /export const PRICING_PLANS:\s*PlanColumn\[\]/);
});

test("sprint-3a — PRICING_PLANS has all three column kinds", () => {
  const src = read(TIERS);
  for (const k of ["management-only", "development-only", "bundle"]) {
    assert.match(
      src,
      new RegExp(`key:\\s*"${k}"`),
      `missing PRICING_PLANS column: ${k}`,
    );
  }
});

test("sprint-3a — each column carries four tier keys (starter / pro / scale / enterprise)", () => {
  const src = read(TIERS);
  // The four tier keys must all appear (case-sensitive) at least once
  // in each tier list. Source-level check — we count occurrences of
  // `key: "starter"` etc. against the three columns × one occurrence
  // per column = 3 each.
  for (const k of ["starter", "pro", "scale", "enterprise"]) {
    const matches = src.match(new RegExp(`key:\\s*"${k}"`, "g")) ?? [];
    assert.ok(
      matches.length >= 3,
      `expected ${k} to appear in all 3 columns (got ${matches.length})`,
    );
  }
});

test("sprint-3a — PRICING_COPY ships trial banner + AI overage + annual discount", () => {
  const src = read(TIERS);
  assert.match(src, /trialDays:\s*14/);
  assert.match(src, /trialBanner:[\s\S]{0,200}No credit card/);
  assert.match(src, /annualDiscountPct:\s*15/);
  assert.match(src, /aiOverageNote:/);
});

test("sprint-3a — PRICING_FAQ exports 5+ entries", () => {
  const src = read(TIERS);
  assert.match(src, /export const PRICING_FAQ:\s*FaqEntry\[\]/);
  const qCount = (src.match(/^\s*q:\s*"/gm) ?? []).length;
  assert.ok(qCount >= 5, `PRICING_FAQ should have 5+ entries, got ${qCount}`);
});

test("sprint-3a — Bundle Pro tier highlights as recommended at $499", () => {
  const src = read(TIERS);
  // The Bundle Pro tier should be marked highlight: true.
  // Source-level: find the BUNDLE_TIERS block, then the pro tier.
  assert.match(
    src,
    /BUNDLE_TIERS[\s\S]{0,2000}key:\s*"pro"[\s\S]{0,400}monthlyUsd:\s*499[\s\S]{0,400}highlight:\s*true/,
  );
});

// ============================================================================
// SalesHub component
// ============================================================================

test("sprint-3a — SalesHub component ships", () => {
  assert.ok(existsSync(resolve(ROOT, SALES_HUB)));
});

test("sprint-3a — SalesHub exports component + uses 10.6.C.1 hero tokens", () => {
  const src = read(SALES_HUB);
  assert.match(src, /export function SalesHub\(/);
  // All three hero gradient tones (mgmt = emerald, dev = gold, trial = coral)
  assert.match(src, /bg-gradient-emerald-soft/);
  assert.match(src, /bg-gradient-gold-soft/);
  assert.match(src, /bg-gradient-coral-soft/);
  assert.match(src, /shadow-soft-card/);
  assert.match(src, /rounded-3xl/);
});

test("sprint-3a — SalesHub links to existing /products detail pages, not new /management-os", () => {
  const src = read(SALES_HUB);
  // Per the deviation plan in the content-inventory doc, the SalesHub
  // CTAs link into /products/* (existing 290+285 LOC pages) rather
  // than building duplicate /management-os and /development-os routes.
  assert.match(src, /\/products\/management-os/);
  assert.match(src, /\/products\/development-os/);
  // And NOT to the spec's original URL choices, which would have
  // collided with the Dev OS app's /development-os.
  assert.doesNotMatch(src, /href="\/development-os/);
});

test("sprint-3a — SalesHub trial CTA carries the 14-days-no-card pitch", () => {
  const src = read(SALES_HUB);
  assert.match(src, /14 days\. No credit card/);
});

// ============================================================================
// Apex page subscription arm
// ============================================================================

test("sprint-3a — (public)/page.tsx renders <SalesHub> when product=subscription", () => {
  const src = read(APEX);
  assert.match(src, /import \{ SalesHub \} from "@\/components\/marketing\/sales-hub";/);
  assert.match(
    src,
    /product === "subscription"[\s\S]{0,200}<SalesHub/,
  );
});

// ============================================================================
// /pricing page
// ============================================================================

test("sprint-3a — top-level /pricing page ships", () => {
  assert.ok(existsSync(resolve(ROOT, PRICING)));
});

test("sprint-3a — /pricing imports PRICING_PLANS + PRICING_FAQ from the new tiers module", () => {
  const src = read(PRICING);
  assert.match(
    src,
    /from "@\/lib\/marketing\/pricing-tiers"/,
  );
  assert.match(src, /PRICING_PLANS/);
  assert.match(src, /PRICING_FAQ/);
});

test("sprint-3a — /pricing uses gradient hero tones (per column) + 14-day trial banner", () => {
  const src = read(PRICING);
  // Trial-banner section uses the coral-soft gradient hero token
  assert.match(src, /bg-gradient-coral-soft/);
  // Card geometry uses 10.6.C.1 tokens
  assert.match(src, /rounded-3xl/);
  assert.match(src, /shadow-soft-card/);
});

test("sprint-3a — /pricing tier CTAs carry plan + tier query params for the existing signup flow", () => {
  const src = read(PRICING);
  // Each non-enterprise tier links into the existing /signup flow with
  // ?plan=... + tier=... appended. The base path comes from
  // PRICING_COPY.defaultStartCta.href so the source carries the
  // interpolation pattern (not the literal "/signup" prefix).
  assert.match(
    src,
    /\?plan=\$\{planKey\}&tier=\$\{tier\.key\}/,
  );
  // And the base path on PRICING_COPY is /signup.
  const tiers = read(TIERS);
  assert.match(tiers, /defaultStartCta:\s*\{[\s\S]{0,200}href:\s*"\/signup"/);
});

// ============================================================================
// Middleware allow-list update
// ============================================================================

test("sprint-3a — middleware subscription allow-list drops /villa-management + /development", () => {
  const src = read(MIDDLEWARE);
  // Find the subscription block and assert the stale routes are gone.
  const block =
    src.match(/subscription:\s*\{[\s\S]{0,2000}?\}/)?.[0] ?? "";
  assert.ok(
    !/"\/villa-management"/.test(block),
    "subscription allowedPrefixes still references /villa-management",
  );
  assert.ok(
    !/"\/development"(?!-os)/.test(block),
    "subscription allowedPrefixes still references /development (the bare path)",
  );
  // /products + /pricing + /signup still allowed.
  assert.match(block, /"\/products"/);
  assert.match(block, /"\/pricing"/);
  assert.match(block, /"\/signup"/);
});

/**
 * Stage 10.I.2 + 10.I.3 + 10.I.4 — Public marketing surface acceptance tests.
 *
 * 10.I.2 — umbrella homepage rebuild (/page.tsx)
 * 10.I.3 — /products/management-os + /products/development-os + retired
 *          /villa-management + /development pages (now 308 redirects)
 * 10.I.4 — /pricing/management-os + /pricing/development-os + retired
 *          /pricing page (now 308 redirect to /pricing/management-os)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Sprint 3b retired the Stage-10.I.4 per-product pricing config
// (`src/lib/billing/pricing.ts`) and replaced it with the
// `plan_packaging` table + `src/lib/marketing/pricing-tiers.ts` +
// `src/lib/billing/marketing-mapping.ts`. The 10.I.4-era assertions
// below are kept as historical retirement checks (they now assert
// the *absence* of the old surface and the presence of the 308
// redirects to /pricing).
import {
  resolveMarketingMapping,
  ALL_MARKETING_MAPPINGS,
} from "../src/lib/billing/marketing-mapping";

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

const HOMEPAGE = "src/app/(public)/page.tsx";
const MGMT_PRODUCT_PAGE =
  "src/app/(public)/products/management-os/page.tsx";
const DEV_PRODUCT_PAGE =
  "src/app/(public)/products/development-os/page.tsx";
const MGMT_PRICING_PAGE =
  "src/app/(public)/pricing/management-os/page.tsx";
const DEV_PRICING_PAGE =
  "src/app/(public)/pricing/development-os/page.tsx";
const PRICING_PAGE_LIB = "src/components/marketing/pricing-page.tsx";
const PRICING_CONFIG = "src/lib/billing/pricing.ts";
const NAV_CONFIG = "src/config/navigation.ts";
const PUBLIC_HEADER = "src/components/layout/public-header.tsx";
const PUBLIC_FOOTER = "src/components/layout/public-footer.tsx";
const NEXT_CONFIG = "next.config.mjs";

// ============================================================================
// 10.I.2 — Umbrella homepage
// ============================================================================

test("10.I.2 — homepage shows BOTH products as equal options", () => {
  const src = read(HOMEPAGE);
  // Both product cards must be referenced
  assert.match(src, /Arconique Management OS/);
  assert.match(src, /Arconique Development OS/);
  // Cross-cutting features section
  assert.match(src, /Multi-tenant by construction/);
  assert.match(src, /AI agents integrated/);
  // Primary CTA → /signup
  assert.match(src, /href:\s*"\/signup"/);
});

test("10.I.2 — homepage links to /signup with product hints + /products/* deep links", () => {
  const src = read(HOMEPAGE);
  assert.match(src, /\/signup\?product=mgmt/);
  assert.match(src, /\/signup\?product=dev/);
  assert.match(src, /\/products\/management-os/);
  assert.match(src, /\/products\/development-os/);
  assert.match(src, /\/pricing\/management-os/);
  assert.match(src, /\/pricing\/development-os/);
});

test("10.I.2 — homepage uses investor-grade brand voice (no friendly-tone leak)", () => {
  const src = read(HOMEPAGE);
  // Professional-voice anchor phrases.
  assert.match(src, /investment-grade|investor-grade|reconciled/i);
});

// ============================================================================
// 10.I.3 — Product pages + retired URLs
// ============================================================================

test("10.I.3 — /products/management-os exists with use-cases + features + CTA", () => {
  // Sprint LD-1 — page rebuilt as a photographic landing.
  // "Bali villa portfolios" trust signal survives; legacy
  // "/signup?product=mgmt" and "/pricing/management-os" links
  // moved to "/onboarding" + "/pricing". The cabinet rail copy
  // covers the per-feature stand-in for "Bookings + channel
  // manager" via the "Multi-channel sync" feature card.
  assert.ok(exists(MGMT_PRODUCT_PAGE));
  const src = read(MGMT_PRODUCT_PAGE);
  assert.match(src, /Bali villa portfolios/);
  assert.match(src, /Multi-channel sync/);
  assert.match(src, /\/onboarding/);
  assert.match(src, /\/pricing/);
});

test("10.I.3 — /products/development-os exists with use-cases + features + CTA", () => {
  // Sprint LD-1 — page rebuilt as a photographic landing.
  // "Real estate developers" trust signal subsumed by the rating
  // chip ("Bali developers using Arconique today"); "BOQ + drawings"
  // collapsed into the "BOQ live tracking" feature card.
  assert.ok(exists(DEV_PRODUCT_PAGE));
  const src = read(DEV_PRODUCT_PAGE);
  assert.match(src, /Bali developers using Arconique/);
  assert.match(src, /BOQ live tracking/);
  assert.match(src, /\/onboarding/);
  assert.match(src, /\/pricing/);
});

test("10.I.3 — old /villa-management + /development pages retired", () => {
  assert.equal(
    exists("src/app/(public)/villa-management/page.tsx"),
    false,
    "old /villa-management page should be removed (308 redirect takes over)",
  );
  assert.equal(
    exists("src/app/(public)/development/page.tsx"),
    false,
    "old /development page should be removed",
  );
});

test("10.I.3 — next.config.mjs adds 308 redirects for retired URLs", () => {
  const src = read(NEXT_CONFIG);
  assert.match(
    src,
    /source:\s*"\/villa-management"\s*,\s*destination:\s*"\/products\/management-os"/,
  );
  assert.match(
    src,
    /source:\s*"\/development"\s*,\s*destination:\s*"\/products\/development-os"/,
  );
});

test("10.I.3 — marketingNav points at the new /products/* + /pricing/management-os routes", () => {
  const src = read(NAV_CONFIG);
  assert.match(src, /href:\s*"\/products\/management-os"/);
  assert.match(src, /href:\s*"\/products\/development-os"/);
  assert.match(src, /href:\s*"\/pricing\/management-os"/);
  // Old hrefs should be gone from the nav.
  assert.doesNotMatch(
    src,
    /href:\s*"\/villa-management"/,
    "marketingNav must not list the retired /villa-management URL",
  );
  assert.doesNotMatch(src, /href:\s*"\/development"\s*,/);
});

test("10.I.3 — public header CTA flipped Apply → Get started free", () => {
  const src = read(PUBLIC_HEADER);
  assert.match(src, />Get started free</);
  assert.doesNotMatch(src, />Apply</);
  assert.match(src, /href="\/signup"/);
});

test("10.I.3 — public footer surfaces Products + Resources + Access groups", () => {
  const src = read(PUBLIC_FOOTER);
  assert.match(src, /label:\s*"Products"/);
  assert.match(src, /label:\s*"Resources"/);
  assert.match(src, /label:\s*"Access"/);
  assert.match(src, /href:\s*"\/products\/management-os"/);
  assert.match(src, /href:\s*"\/signup"/);
});

// ============================================================================
// 10.I.4 — Retired surface (Sprint 3b)
//
// The Stage-10.I.4 per-product pricing config + per-product pages
// (/pricing/management-os, /pricing/development-os) were retired in
// Sprint 3b. Their content was incompatible with the
// Sprint-3a/3b plan_packaging model. Both former URLs now 308 to the
// consolidated /pricing.
// ============================================================================

test("10.I.4 retired by Sprint 3b — old per-product pricing config removed", () => {
  assert.equal(
    exists(PRICING_CONFIG),
    false,
    "src/lib/billing/pricing.ts should have been deleted in Sprint 3b",
  );
});

test("10.I.4 retired by Sprint 3b — old per-product pricing pages removed", () => {
  assert.equal(exists(MGMT_PRICING_PAGE), false);
  assert.equal(exists(DEV_PRICING_PAGE), false);
});

test("10.I.4 retired by Sprint 3b — shared PricingPage component removed", () => {
  assert.equal(exists(PRICING_PAGE_LIB), false);
});

test("Sprint 3b — next.config.mjs 308-redirects /pricing/{management,development}-os to /pricing", () => {
  const src = read(NEXT_CONFIG);
  assert.match(
    src,
    /source:\s*"\/pricing\/management-os"\s*,\s*destination:\s*"\/pricing"/,
  );
  assert.match(
    src,
    /source:\s*"\/pricing\/development-os"\s*,\s*destination:\s*"\/pricing"/,
  );
});

test("Sprint 3b — consolidated /pricing page still exists (post-3a)", () => {
  assert.equal(
    exists("src/app/(public)/pricing/page.tsx"),
    true,
    "Sprint 3a's consolidated /pricing page survives Sprint 3b",
  );
});

test("Sprint 3b — marketing-mapping module replaces the Stage-10.I.4 config", () => {
  // All 12 (planKind × tierKey) cells resolve to a DB plan_code +
  // products_enabled.
  assert.equal(ALL_MARKETING_MAPPINGS.length, 12);
  // Spot-check a few canonical resolutions.
  const bundlePro = resolveMarketingMapping("bundle", "pro");
  assert.equal(bundlePro.planCode, "standard");
  assert.deepEqual([...bundlePro.productsEnabled].sort(), ["dev", "mgmt"]);
  const mgmtScale = resolveMarketingMapping("management-only", "scale");
  assert.equal(mgmtScale.planCode, "pro");
  assert.deepEqual(mgmtScale.productsEnabled, ["mgmt"]);
  const devEnt = resolveMarketingMapping("development-only", "enterprise");
  assert.equal(devEnt.planCode, "enterprise");
});

test("Sprint 3b inherits 10.I.4 — trial messaging now lives on the new marketing-tiers module", () => {
  // The Stage-10.I.4 PRICING_CONFIG file was deleted; the trial copy
  // moved to src/lib/marketing/pricing-tiers.ts (Sprint 3a, retained
  // through Sprint 3b).
  const src = read("src/lib/marketing/pricing-tiers.ts");
  assert.match(src, /14-day free trial|14 days/);
  assert.match(src, /No credit card/);
});

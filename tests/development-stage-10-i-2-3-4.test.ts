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

import {
  MANAGEMENT_OS_PRICING,
  DEVELOPMENT_OS_PRICING,
  pricingFor,
  formatTierPrice,
  TRIAL_DURATION_DAYS,
} from "../src/lib/billing/pricing";

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
  assert.ok(exists(MGMT_PRODUCT_PAGE));
  const src = read(MGMT_PRODUCT_PAGE);
  assert.match(src, /Bali villa portfolios/);
  assert.match(src, /Bookings \+ channel manager/);
  assert.match(src, /\/signup\?product=mgmt/);
  assert.match(src, /\/pricing\/management-os/);
});

test("10.I.3 — /products/development-os exists with use-cases + features + CTA", () => {
  assert.ok(exists(DEV_PRODUCT_PAGE));
  const src = read(DEV_PRODUCT_PAGE);
  assert.match(src, /Real estate developers/);
  assert.match(src, /BOQ \+ drawings/);
  assert.match(src, /\/signup\?product=dev/);
  assert.match(src, /\/pricing\/development-os/);
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
// 10.I.4 — Pricing pages + config
// ============================================================================

test("10.I.4 — pricing config exposes both products via pricingFor()", () => {
  assert.equal(MANAGEMENT_OS_PRICING.product, "mgmt");
  assert.equal(DEVELOPMENT_OS_PRICING.product, "dev");
  assert.equal(pricingFor("mgmt"), MANAGEMENT_OS_PRICING);
  assert.equal(pricingFor("dev"), DEVELOPMENT_OS_PRICING);
});

test("10.I.4 — pricing tiers match operator-decision values ($99/$299/$199/$499)", () => {
  const mgmt = MANAGEMENT_OS_PRICING.tiers;
  assert.equal(mgmt.find((t) => t.key === "starter")?.monthlyUsd, 99);
  assert.equal(mgmt.find((t) => t.key === "professional")?.monthlyUsd, 299);
  assert.equal(mgmt.find((t) => t.key === "enterprise")?.monthlyUsd, null);

  const dev = DEVELOPMENT_OS_PRICING.tiers;
  assert.equal(dev.find((t) => t.key === "starter")?.monthlyUsd, 199);
  assert.equal(dev.find((t) => t.key === "professional")?.monthlyUsd, 499);
  assert.equal(dev.find((t) => t.key === "enterprise")?.monthlyUsd, null);
});

test("10.I.4 — Professional tier is highlighted in both products", () => {
  for (const product of [MANAGEMENT_OS_PRICING, DEVELOPMENT_OS_PRICING]) {
    const pro = product.tiers.find((t) => t.key === "professional");
    assert.equal(pro?.highlight, true);
    const enterprise = product.tiers.find((t) => t.key === "enterprise");
    assert.equal(enterprise?.highlight, undefined);
  }
});

test("10.I.4 — formatTierPrice formats correctly for paid + enterprise", () => {
  assert.equal(
    formatTierPrice(MANAGEMENT_OS_PRICING.tiers[0]),
    "$99",
  );
  assert.equal(
    formatTierPrice(MANAGEMENT_OS_PRICING.tiers[2]),
    "Contact sales",
  );
});

test("10.I.4 — TRIAL_DURATION_DAYS exported as 14 (operator decision)", () => {
  assert.equal(TRIAL_DURATION_DAYS, 14);
});

test("10.I.4 — both pricing pages exist + import shared PricingPage", () => {
  for (const f of [MGMT_PRICING_PAGE, DEV_PRICING_PAGE]) {
    assert.ok(exists(f));
    const src = read(f);
    assert.match(src, /PricingPage/);
    assert.match(src, /MANAGEMENT_OS_PRICING|DEVELOPMENT_OS_PRICING/);
  }
});

test("10.I.4 — shared PricingPage component renders comparison table + FAQ + tier cards", () => {
  assert.ok(exists(PRICING_PAGE_LIB));
  const src = read(PRICING_PAGE_LIB);
  assert.match(src, /Feature matrix/);
  assert.match(src, /FAQ/);
  assert.match(src, /TierCard/);
  // Each tier CTA must deep-link signup.
  assert.match(src, /signup\?product=/);
});

test("10.I.4 — old /pricing page retired (308 redirect to /pricing/management-os)", () => {
  assert.equal(
    exists("src/app/(public)/pricing/page.tsx"),
    false,
    "old /pricing/page.tsx should be removed (replaced by 308 redirect)",
  );
  const src = read(NEXT_CONFIG);
  assert.match(
    src,
    /source:\s*"\/pricing"\s*,\s*destination:\s*"\/pricing\/management-os"/,
  );
});

test("10.I.4 — pricing config FAQ surfaces the trial messaging", () => {
  assert.ok(exists(PRICING_CONFIG));
  const src = read(PRICING_CONFIG);
  assert.match(src, /14-day free trial|14 days/);
  assert.match(src, /No credit card/);
});

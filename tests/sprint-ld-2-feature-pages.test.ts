/**
 * Sprint LD-2 — Feature deep-dive page acceptance.
 *
 * Source-inspection tests for:
 *   - <FeatureDeepDive> + <FeatureTOC> primitives
 *   - /features/management-os: 6 anchored sections + TOC + closing CTA
 *   - /features/development-os: 6 anchored sections + TOC + closing CTA
 *   - 12 product-landing "Learn more →" hrefs point to valid anchors
 *   - 12 new placeholder feature-mockup assets ship in /public/landing/
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
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

const FDD = "src/components/landing/feature-deep-dive.tsx";
const TOC = "src/components/landing/feature-toc.tsx";
const MGMT_FEATURES_PAGE = "src/app/(public)/features/management-os/page.tsx";
const DEV_FEATURES_PAGE = "src/app/(public)/features/development-os/page.tsx";
const MGMT_LANDING = "src/app/(public)/products/management-os/page.tsx";
const DEV_LANDING = "src/app/(public)/products/development-os/page.tsx";

// ============================================================================
// FeatureDeepDive primitive
// ============================================================================

test("ld-2 — FeatureDeepDive ships with id, eyebrow, title, bullets, cabinet CTA + mockup", () => {
  assert.ok(exists(FDD));
  const src = read(FDD);
  assert.match(src, /export function FeatureDeepDive\(/);
  for (const p of [
    "id",
    "eyebrow",
    "title",
    "description",
    "bullets",
    "cabinetHref",
    "mockupSrc",
    "reverse",
  ]) {
    assert.match(src, new RegExp(`\\b${p}\\b`));
  }
});

test("ld-2 — FeatureDeepDive supports the reverse-layout prop for alternating sections", () => {
  const src = read(FDD);
  assert.match(src, /reverse &&/);
  assert.match(src, /lg:\[&>\*:first-child\]:order-2/);
});

test("ld-2 — FeatureTOC ships sticky-top with anchor links", () => {
  assert.ok(exists(TOC));
  const src = read(TOC);
  assert.match(src, /sticky top-0/);
  assert.match(src, /href=\{`#\$\{it\.id\}`/);
});

// ============================================================================
// /features/management-os
// ============================================================================

const MGMT_SECTIONS = [
  "channel-manager",
  "owner-statements",
  "concierge-ai",
  "cleaner-pwa",
  "direct-booking",
  "security",
];

test("ld-2 — /features/management-os exists with the LD-1 primitives + 6 deep-dives + closing CTA", () => {
  assert.ok(exists(MGMT_FEATURES_PAGE));
  const src = read(MGMT_FEATURES_PAGE);
  assert.match(src, /<PhotographicHero/);
  assert.match(src, /<FeatureTOC/);
  assert.match(src, /<ActionPillButton/);
  // Six <FeatureDeepDive> sections.
  const matches = src.match(/<FeatureDeepDive\n/g) ?? [];
  assert.equal(matches.length, 6, "expected 6 FeatureDeepDive sections");
});

for (const s of MGMT_SECTIONS) {
  test(`ld-2 — /features/management-os renders the #${s} anchored section`, () => {
    const src = read(MGMT_FEATURES_PAGE);
    assert.match(src, new RegExp(`id="${s}"`));
  });
}

test("ld-2 — /features/management-os surfaces the spec headlines verbatim", () => {
  const src = read(MGMT_FEATURES_PAGE);
  assert.match(src, /One inbox for Booking, Airbnb, Agoda\./);
  assert.match(src, /Monthly statements, generated in one click\./);
  assert.match(src, /A 24\/7 concierge that speaks your guest's language\./);
  assert.match(src, /Built for cleaners, security, and supervisors\./);
  assert.match(src, /Your villa, your URL, your margin\./);
  assert.match(src, /Patrols, incidents, access control\./);
});

test("ld-2 — /features/management-os cabinet CTAs point at the real cabinet apexes", () => {
  const src = read(MGMT_FEATURES_PAGE);
  for (const href of [
    "/dashboard/front-office",
    "/owner",
    "/dashboard/concierge",
    "/dashboard/housekeeping",
    "/dashboard/security",
  ]) {
    assert.match(src, new RegExp(href.replace(/\//g, "\\/")));
  }
});

// ============================================================================
// /features/development-os
// ============================================================================

const DEV_SECTIONS = [
  "boq-live-tracking",
  "ai-cost-analyst",
  "qa-qc",
  "procurement-rfq",
  "investor-portal",
  "site-supervisor-pwa",
];

test("ld-2 — /features/development-os exists with the LD-1 primitives + 6 deep-dives + closing CTA", () => {
  assert.ok(exists(DEV_FEATURES_PAGE));
  const src = read(DEV_FEATURES_PAGE);
  assert.match(src, /<PhotographicHero/);
  assert.match(src, /<FeatureTOC/);
  assert.match(src, /<ActionPillButton/);
  const matches = src.match(/<FeatureDeepDive\n/g) ?? [];
  assert.equal(matches.length, 6, "expected 6 FeatureDeepDive sections");
});

for (const s of DEV_SECTIONS) {
  test(`ld-2 — /features/development-os renders the #${s} anchored section`, () => {
    const src = read(DEV_FEATURES_PAGE);
    assert.match(src, new RegExp(`id="${s}"`));
  });
}

test("ld-2 — /features/development-os cabinet CTAs point at the real Dev-OS cabinet apexes", () => {
  const src = read(DEV_FEATURES_PAGE);
  for (const href of [
    "/development-os/cabinets/qs",
    "/development-os/cabinets/site-supervisor",
    "/development-os/cabinets/procurement-manager",
    "/investor-portal/dashboard",
  ]) {
    assert.match(src, new RegExp(href.replace(/\//g, "\\/")));
  }
});

// ============================================================================
// Landing → features anchor wiring (12 hrefs)
// ============================================================================

test("ld-2 — /products/management-os feature grid wires all 6 'Learn more' hrefs to the new anchor targets", () => {
  const src = read(MGMT_LANDING);
  for (const slug of MGMT_SECTIONS) {
    assert.match(
      src,
      new RegExp(`/features/management-os#${slug}`),
      `expected /features/management-os#${slug} href in the landing`,
    );
  }
  // None of the legacy "/features/<slug>" hrefs survived.
  assert.doesNotMatch(src, /href: "\/features\/channel-manager"/);
  assert.doesNotMatch(src, /href: "\/features\/mobile-pwa"/);
});

test("ld-2 — /products/development-os feature grid wires all 6 'Learn more' hrefs to the new anchor targets", () => {
  const src = read(DEV_LANDING);
  for (const slug of DEV_SECTIONS) {
    assert.match(
      src,
      new RegExp(`/features/development-os#${slug}`),
      `expected /features/development-os#${slug} href in the landing`,
    );
  }
  assert.doesNotMatch(src, /href: "\/features\/boq"/);
  assert.doesNotMatch(src, /href: "\/features\/qs-cost-analyst"/);
});

// ============================================================================
// Placeholder assets
// ============================================================================

test("ld-2 — 12 new feature-mockup placeholder assets ship in /public/landing/", () => {
  for (const slug of [
    "channel-manager",
    "owner-statements",
    "concierge-ai",
    "cleaner-pwa",
    "direct-booking",
    "security",
    "boq-tracking",
    "ai-cost-analyst",
    "qa-qc",
    "procurement-rfq",
    "investor-portal",
    "site-supervisor-pwa",
  ]) {
    assert.ok(
      exists(`public/landing/feature-${slug}.webp`),
      `expected placeholder at /public/landing/feature-${slug}.webp`,
    );
  }
});

test("ld-2 — README.md catalogues the 12 new feature-mockup entries", () => {
  const readme = read("public/landing/README.md");
  for (const slug of [
    "feature-channel-manager.webp",
    "feature-owner-statements.webp",
    "feature-concierge-ai.webp",
    "feature-cleaner-pwa.webp",
    "feature-direct-booking.webp",
    "feature-security.webp",
    "feature-boq-tracking.webp",
    "feature-ai-cost-analyst.webp",
    "feature-qa-qc.webp",
    "feature-procurement-rfq.webp",
    "feature-investor-portal.webp",
    "feature-site-supervisor-pwa.webp",
  ]) {
    assert.match(readme, new RegExp(slug.replace(/\./g, "\\.")));
  }
});

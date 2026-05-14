/**
 * Sprint LD-1 — Landing page composition acceptance.
 *
 * Source-inspection tests for /products/management-os and
 * /products/development-os: the new primitives are consumed, the
 * documented sections are present, copy from the spec is exact,
 * pricing reads from pricing-tiers.ts, and placeholder assets ship.
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

const MGMT_PAGE = "src/app/(public)/products/management-os/page.tsx";
const DEV_PAGE = "src/app/(public)/products/development-os/page.tsx";

// ============================================================================
// /products/management-os
// ============================================================================

test("ld-1 — management-os page imports the 4 new landing primitives", () => {
  const src = read(MGMT_PAGE);
  assert.match(src, /PhotographicHero/);
  assert.match(src, /ActionPillButton/);
  assert.match(src, /ConcentricRings/);
  assert.match(src, /DotGridStreak/);
});

test("ld-1 — management-os hero band carries 4 floating cards + 5-star rating", () => {
  const src = read(MGMT_PAGE);
  assert.match(src, /<PhotographicHero/);
  assert.match(src, /floatingCards=\{/);
  assert.match(src, /Tonight occupancy/);
  assert.match(src, /Owner statement/);
  assert.match(src, /Concierge AI/);
  assert.match(src, /Today's arrivals/);
  assert.match(src, /rating=\{/);
});

test("ld-1 — management-os AI band has Hey, need help? headline + 4 agent cards", () => {
  const src = read(MGMT_PAGE);
  assert.match(src, /Hey, need help\?/);
  for (const a of [
    "Concierge AI",
    "Tax Assistant",
    "Front-Office Copilot",
    "Housekeeping Scheduler",
  ]) {
    assert.match(src, new RegExp(a));
  }
});

test("ld-1 — management-os cabinet rail surfaces 5 cabinet preview cards", () => {
  const src = read(MGMT_PAGE);
  for (const c of [
    "Front Office",
    "Concierge",
    "Owner Portal",
    "Housekeeping",
    "Security",
  ]) {
    assert.match(src, new RegExp(c));
  }
});

test("ld-1 — management-os feature grid covers the 6 enumerated capabilities", () => {
  const src = read(MGMT_PAGE);
  for (const f of [
    "Multi-channel sync",
    "Owner statements automation",
    "AI Concierge for guests",
    "Mobile cleaner PWA",
    "Direct booking website",
    "Security & access control",
  ]) {
    assert.match(src, new RegExp(f));
  }
});

test("ld-1 — management-os reads pricing teaser from pricing-tiers.ts", () => {
  const src = read(MGMT_PAGE);
  assert.match(src, /from "@\/lib\/marketing\/pricing-tiers"/);
  assert.match(src, /PRICING_PLANS/);
});

test("ld-1 — management-os surfaces trust signals via DotGridStreak + ConcentricRings", () => {
  const src = read(MGMT_PAGE);
  assert.match(src, /<DotGridStreak/);
  assert.match(src, /<ConcentricRings/);
});

test("ld-1 — management-os final CTA band uses ActionPillButton to onboarding", () => {
  const src = read(MGMT_PAGE);
  assert.match(src, /<ActionPillButton/);
  assert.match(src, /\/onboarding/);
});

// ============================================================================
// /products/development-os
// ============================================================================

test("ld-1 — development-os page imports the 4 new landing primitives", () => {
  const src = read(DEV_PAGE);
  assert.match(src, /PhotographicHero/);
  assert.match(src, /ActionPillButton/);
  assert.match(src, /ConcentricRings/);
  assert.match(src, /DotGridStreak/);
});

test("ld-1 — development-os hero band carries dev-specific floating cards", () => {
  const src = read(DEV_PAGE);
  for (const c of [
    "Project budget",
    "BOQ variance",
    "QS anomalies",
    "Investor IRR",
  ]) {
    assert.match(src, new RegExp(c));
  }
});

test("ld-1 — development-os AI band lists the 4 live dev-side agents", () => {
  const src = read(DEV_PAGE);
  for (const a of [
    "QS Cost Analyst",
    "Procurement Analyst",
    "Daily Construction Digest",
    "Weekly Construction Plan",
  ]) {
    assert.match(src, new RegExp(a));
  }
});

test("ld-1 — development-os cabinet rail surfaces 6 dev-side cabinets", () => {
  const src = read(DEV_PAGE);
  for (const c of [
    "CFO Bookkeeper",
    "QS",
    "Project Manager",
    "Procurement",
    "Site Supervisor",
    "Investor Portal",
  ]) {
    assert.match(src, new RegExp(c));
  }
});

test("ld-1 — development-os feature grid covers the 6 dev-side capabilities", () => {
  const src = read(DEV_PAGE);
  for (const f of [
    "BOQ live tracking",
    "AI cost analyst",
    "Photo-evidence QA",
    "Procurement RFQ matrix",
    "Investor portal",
    "Mobile site supervisor PWA",
  ]) {
    assert.match(src, new RegExp(f));
  }
});

test("ld-1 — development-os pricing teaser reads from pricing-tiers.ts (Dev tiers)", () => {
  const src = read(DEV_PAGE);
  assert.match(src, /from "@\/lib\/marketing\/pricing-tiers"/);
  assert.match(src, /development-only/);
});

test("ld-1 — development-os investor preview band names IRR + Distribution copy", () => {
  const src = read(DEV_PAGE);
  assert.match(src, /Distribution Oct 2025/);
  assert.match(src, /IRR YTD/);
});

// ============================================================================
// Placeholder asset registry
// ============================================================================

test("ld-1 — /public/landing/ ships a README + placeholder assets", () => {
  assert.ok(exists("public/landing/README.md"));
  for (const f of [
    "hero-villa-golden.webp",
    "hero-construction-sunrise.webp",
    "phone-housekeeping.webp",
    "laptop-investor.webp",
    "cabinet-preview-frontoffice.webp",
    "cabinet-preview-investor.webp",
  ]) {
    assert.ok(
      exists(`public/landing/${f}`),
      `expected placeholder asset at /public/landing/${f}`,
    );
  }
});

/**
 * Stage 10.6 / Phase 10.6.C.4 — public pages + auth polish.
 *
 * Verifies the 10.6.C token system (rounded-3xl, gradient cards,
 * shadow-soft-card / shadow-elevated-card, larger display headlines)
 * has been applied to the conversion-critical public + auth surfaces:
 *
 *   - / homepage             (ProductCard now gradient + rounded-3xl;
 *                             FeatureTile rounded-3xl; closing CTA
 *                             gradient-emerald-soft)
 *   - /pricing/*             (TierCard highlighted variant uses
 *                             gradient-emerald-soft + bigger 48-56pt
 *                             price; comparison table rounded-3xl;
 *                             FAQ rounded-2xl; closing CTA gradient)
 *   - /products/management-os (closing CTA gradient-emerald-soft;
 *                             feature/pillar cards rounded-3xl)
 *   - /products/development-os (closing CTA gradient-gold-soft;
 *                             feature/pillar cards rounded-3xl)
 *   - /signup                (form card rounded-3xl + shadow-elevated-card;
 *                             headline bumped to 56pt)
 *   - /login                 (headline bumped to 56pt; demo links
 *                             rounded-2xl + hover shadow-soft-card)
 *   - /sign-up               (auth flow — headline bumped to 56pt)
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

// ============================================================================
// Homepage
// ============================================================================

test("10.6.C.4.1 — homepage closing CTA uses gradient-emerald-soft + rounded-3xl + shadow-elevated-card", () => {
  const src = read("src/app/(public)/page.tsx");
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-elevated-card/,
  );
});

test("10.6.C.4.1 — homepage ProductCard tone branches to gradient-emerald-soft / gradient-gold-soft + rounded-3xl", () => {
  const src = read("src/app/(public)/page.tsx");
  assert.match(src, /tone === "accent"\s*\?\s*"bg-gradient-emerald-soft"/);
  assert.match(src, /:\s*"bg-gradient-gold-soft"/);
  // ProductCard wrapper now rounded-3xl with shadow-soft-card hover-elevated
  assert.match(
    src,
    /rounded-3xl border border-line-soft \$\{toneBg\}[\s\S]{0,400}shadow-soft-card transition-shadow hover:shadow-elevated-card/,
  );
});

test("10.6.C.4.1 — homepage FeatureTile bumped to rounded-3xl + shadow-soft-card + p-7", () => {
  const src = read("src/app/(public)/page.tsx");
  assert.match(
    src,
    /FeatureTile[\s\S]{0,800}rounded-3xl border border-line-soft bg-surface p-7[\s\S]{0,200}shadow-soft-card hover:shadow-elevated-card/,
  );
});

// ============================================================================
// Pricing
// ============================================================================

test("10.6.C.4.3 — pricing TierCard highlighted variant uses gradient-emerald-soft + rounded-3xl + shadow-elevated-card", () => {
  const src = read("src/components/marketing/pricing-page.tsx");
  assert.match(
    src,
    /isHighlighted[\s\S]{0,200}border-line-soft bg-gradient-emerald-soft shadow-elevated-card/,
  );
});

test("10.6.C.4.3 — pricing TierCard non-highlighted variant uses rounded-3xl + shadow-soft-card hover", () => {
  const src = read("src/components/marketing/pricing-page.tsx");
  assert.match(
    src,
    /border-line-soft bg-surface shadow-soft-card hover:shadow-elevated-card/,
  );
});

test("10.6.C.4.3 — pricing TierCard price bumped to 48-56pt display", () => {
  const src = read("src/components/marketing/pricing-page.tsx");
  assert.match(
    src,
    /font-display text-\[48px\] md:text-\[56px\]/,
  );
});

test("10.6.C.4.3 — pricing comparison table wrapped in rounded-3xl + shadow-soft-card", () => {
  const src = read("src/components/marketing/pricing-page.tsx");
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-surface overflow-x-auto shadow-soft-card/,
  );
});

test("10.6.C.4.3 — pricing FAQ details bumped to rounded-2xl + shadow-soft-card", () => {
  const src = read("src/components/marketing/pricing-page.tsx");
  assert.match(
    src,
    /<details className="group rounded-2xl border border-line-soft bg-surface px-6 py-5 shadow-soft-card"/,
  );
});

test("10.6.C.4.3 — pricing closing CTA uses gradient-emerald-soft", () => {
  const src = read("src/components/marketing/pricing-page.tsx");
  // The closing CTA section's div uses the gradient
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-elevated-card/,
  );
});

test("10.6.C.4.3 — pricing TierCard 'Recommended' pill is rounded-full", () => {
  const src = read("src/components/marketing/pricing-page.tsx");
  assert.match(
    src,
    /text-ink-inverse bg-ink rounded-full px-3 py-1[\s\S]{0,80}Recommended/,
  );
});

// ============================================================================
// Products pages
// ============================================================================

test("10.6.C.4.2 — products/management-os closing CTA gradient-emerald-soft", () => {
  const src = read("src/app/(public)/products/management-os/page.tsx");
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-elevated-card/,
  );
});

test("10.6.C.4.2 — products/development-os closing CTA gradient-gold-soft", () => {
  const src = read("src/app/(public)/products/development-os/page.tsx");
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-gradient-gold-soft shadow-elevated-card/,
  );
});

test("10.6.C.4.2 — products/management-os feature cards rounded-3xl + shadow-soft-card", () => {
  const src = read("src/app/(public)/products/management-os/page.tsx");
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-surface p-7[\s\S]{0,200}shadow-soft-card/,
  );
});

test("10.6.C.4.2 — products/development-os feature cards rounded-3xl + shadow-soft-card", () => {
  const src = read("src/app/(public)/products/development-os/page.tsx");
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-surface p-7[\s\S]{0,200}shadow-soft-card/,
  );
});

// ============================================================================
// Signup + auth pages
// ============================================================================

test("10.6.C.4.4 — /signup form card uses rounded-3xl + shadow-elevated-card + p-8", () => {
  const src = read("src/app/(public)/signup/page.tsx");
  assert.match(
    src,
    /rounded-3xl border border-line-soft bg-surface shadow-elevated-card p-8 md:p-10/,
  );
});

test("10.6.C.4.4 — /signup headline bumped to 40-56pt display", () => {
  const src = read("src/app/(public)/signup/page.tsx");
  assert.match(
    src,
    /font-display text-\[40px\] md:text-\[56px\]/,
  );
});

test("10.6.C.4.5 — /login headline bumped to 44-56pt display", () => {
  const src = read("src/app/(auth)/login/page.tsx");
  assert.match(
    src,
    /text-display text-\[44px\] md:text-\[56px\]/,
  );
});

test("10.6.C.4.5 — /login demo links rounded-2xl + hover shadow-soft-card", () => {
  const src = read("src/app/(auth)/login/page.tsx");
  assert.match(
    src,
    /rounded-2xl border border-line-soft bg-surface hover:bg-muted hover:shadow-soft-card/,
  );
});

test("10.6.C.4.5 — /sign-up auth flow headline bumped to 44-56pt display", () => {
  const src = read("src/app/(auth)/sign-up/page.tsx");
  assert.match(
    src,
    /text-display text-\[44px\] md:text-\[56px\]/,
  );
});

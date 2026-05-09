/**
 * Stage 10.I.1 — Brand voice + pricing + design tokens decisions sub-phase.
 *
 * 10.I.1 is genuinely a "decisions + audit + lock contract" sub-phase —
 * the (public)/ route group already exists with substantial marketing
 * content (homepage, 10 marketing pages, header, footer, marketingNav).
 * Tests pin the existing surface contract so the rest of 10.I (which
 * rebuilds + extends) doesn't accidentally regress what's already there.
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

const DECISIONS_DOC = "tmp/stage-10-i-1-decisions.md";
const PUBLIC_LAYOUT = "src/app/(public)/layout.tsx";
const PUBLIC_HEADER = "src/components/layout/public-header.tsx";
const PUBLIC_FOOTER = "src/components/layout/public-footer.tsx";
const NAV_CONFIG = "src/config/navigation.ts";
const HOMEPAGE = "src/app/(public)/page.tsx";

test("10.I.1 — decisions doc captures all 4 operator answers", () => {
  assert.ok(exists(DECISIONS_DOC), `Missing ${DECISIONS_DOC}`);
  const doc = read(DECISIONS_DOC);
  // Brand voice: Professional / investor-grade
  assert.match(doc, /Professional \/ investor-grade/);
  // Pricing: master-plan tiers (look for the concrete numbers)
  assert.match(doc, /\$99/);
  assert.match(doc, /\$299/);
  assert.match(doc, /\$199/);
  assert.match(doc, /\$499/);
  // Trial duration
  assert.match(doc, /14 days/);
  // Trial mechanics: no Stripe / no Resend
  assert.match(doc, /no Stripe.*no Resend/i);
});

test("10.I.1 — decisions doc plans the 10.I.2-6 routing structure", () => {
  const doc = read(DECISIONS_DOC);
  for (const route of [
    "/products/management-os",
    "/products/development-os",
    "/pricing/management-os",
    "/pricing/development-os",
    "/signup",
  ]) {
    assert.ok(
      doc.includes(route),
      `decisions doc must surface planned route ${route}`,
    );
  }
});

test("10.I.1 — decisions doc sketches migration 0092 (trial state)", () => {
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /0092/);
  assert.match(doc, /trial_started_at/);
  assert.match(doc, /trial_ends_at/);
  assert.match(doc, /trial_status/);
});

test("10.I.1 — public layout (anonymous access) wraps header + footer", () => {
  assert.ok(exists(PUBLIC_LAYOUT), `Missing ${PUBLIC_LAYOUT}`);
  const src = read(PUBLIC_LAYOUT);
  assert.match(src, /PublicHeader/);
  assert.match(src, /PublicFooter/);
  // The (public) layout MUST NOT call enforceProductAccess — anonymous
  // visitors must reach marketing pages without auth.
  assert.doesNotMatch(
    src,
    /enforceProductAccess/,
    "public layout must NOT gate on per-product access (anonymous visitors)",
  );
});

test("10.I.1 — public header surfaces Sign in CTA + Apply CTA + marketingNav", () => {
  const src = read(PUBLIC_HEADER);
  // Sign in link goes to /login (Supabase auth flow).
  assert.match(src, /href="\/login"/);
  // Apply / Get started CTA exists (current copy is "Apply"; flips to
  // "Get started free" → /signup in 10.I.5).
  assert.match(src, /Apply|Get started/);
  assert.match(src, /marketingNav/);
});

test("10.I.1 — marketingNav is non-empty (reshaped in 10.I.3)", () => {
  // Note: the original 10.I.1 contract pinned the pre-10.I.3 nav (8 items
  // including /villa-management + /development). 10.I.3 retired those URLs
  // (308-redirected) and replaced the nav with /products/* + /pricing/*.
  // Locked in tests/development-stage-10-i-2-3-4.test.ts.
  const src = read(NAV_CONFIG);
  assert.match(src, /marketingNav.*=/);
  assert.match(src, /href:\s*"\/case-studies"/);
});

test("10.I.1 — homepage uses HeroSection + TrustStrip (10.I.2 rebuild keeps the vocab)", () => {
  const src = read(HOMEPAGE);
  // 10.I.2 rebuild kept HeroSection + TrustStrip; EditorialSection moved
  // to /products/management-os in 10.I.3 alongside the deeper Mgmt OS copy.
  for (const cmp of ["HeroSection", "TrustStrip"]) {
    assert.ok(src.includes(cmp), `homepage must use <${cmp}>`);
  }
});

test("10.I.1 — public footer carries the investor-grade brand line", () => {
  const src = read(PUBLIC_FOOTER);
  assert.match(
    src,
    /investor-grade operating system/i,
    "footer brand line must reflect Professional voice",
  );
});

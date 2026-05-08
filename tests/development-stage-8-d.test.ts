/**
 * Stage 8.D — Empty-state copy + CTA sweep acceptance tests.
 *
 * Stage 7.G found 21 Tier-3 dashboard / digest / executive pages
 * where the empty state lacked an actionable CTA. Phase 8.D added
 * `action={...}` props with operator-friendly CTAs (mostly "View jobs"
 * for cron-driven pages, plus targeted links for workflow pages).
 *
 * Tests guard against regression on:
 *   1. Each of the 15 EmptyState pages — action prop present + CTA href
 *   2. The 3 inline-text pages where copy was upgraded
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

function pathFor(url: string): string {
  const p = url
    .replace(/^\/dashboard/, "/(dashboard)/dashboard")
    .replace(/^\/development-os/, "/(development-app)/development-os");
  return `src/app${p}/page.tsx`;
}

// ===========================================================================
// 8.D — 15 EmptyState pages now have action= props pointing at meaningful CTAs
// ===========================================================================

const EMPTY_STATE_PAGES: Array<{ url: string; href: string; label: string }> = [
  { url: "/development-os/risk-radar", href: "/dashboard/jobs", label: "View jobs" },
  { url: "/development-os/cashflow-forecast", href: "/dashboard/jobs", label: "View jobs" },
  { url: "/development-os/project-cycle", href: "/dashboard/jobs", label: "View jobs" },
  { url: "/development-os/dashboard", href: "/dashboard/jobs", label: "View jobs" },
  { url: "/development-os/digests", href: "/dashboard/jobs", label: "View jobs" },
  { url: "/development-os/distributions", href: "/development-os/distributions", label: "View distributions" },
  { url: "/development-os/commitments", href: "/development-os/commitments", label: "View commitments" },
  { url: "/development-os/finance", href: "/dashboard/jobs", label: "View jobs" },
  {
    url: "/development-os/finance/document-extractions",
    href: "/dashboard/jobs",
    label: "View jobs",
  },
  {
    url: "/development-os/finance/shared-costs",
    href: "/development-os/finance",
    label: "View finance hub",
  },
  {
    url: "/development-os/marketing/campaigns",
    href: "/development-os/marketing/connections",
    label: "Configure connections",
  },
  {
    url: "/development-os/marketing/content",
    href: "/development-os/marketing/connections",
    label: "Configure connections",
  },
  {
    url: "/development-os/marketing/dashboard",
    href: "/development-os/marketing/connections",
    label: "Configure connections",
  },
  {
    url: "/development-os/marketing/manager-performance",
    href: "/dashboard/jobs",
    label: "View jobs",
  },
  {
    url: "/development-os/procurement/quotations",
    href: "/development-os/procurement/purchase-requests",
    label: "View purchase requests",
  },
];

test("8.D: every Tier-3 EmptyState page has action= prop + CTA Link", () => {
  for (const { url, href, label } of EMPTY_STATE_PAGES) {
    const path = pathFor(url);
    assert.ok(exists(path), `route file missing: ${path}`);
    const src = read(path);
    // Action prop is wired.
    assert.match(src, /action=\{/, `${url}: must have action= prop`);
    // Link points at the documented href.
    assert.ok(
      src.includes(`href="${href}"`),
      `${url}: CTA href should be ${href}`,
    );
    // Label text is in the file.
    assert.ok(
      src.includes(`>${label}<`) || src.includes(`>${label}</Link>`),
      `${url}: CTA label should be "${label}"`,
    );
  }
});

// ===========================================================================
// 8.D — 3 inline-text pages — copy upgraded
// ===========================================================================

test("8.D: /dashboard/notifications/inbox empty copy explains where notifications come from + Deliveries link", () => {
  const src = read("src/app/(dashboard)/dashboard/notifications/inbox/page.tsx");
  assert.match(src, /Notifications arrive when actions you triggered complete/);
  assert.match(src, /\/dashboard\/notifications\/deliveries/);
});

test("8.D: /dashboard/guest-ai/handoffs/metrics empty copy explains the rollup", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/guest-ai/handoffs/metrics/page.tsx",
  );
  assert.match(src, /Guest AI handoff metrics roll up from concierge sessions/);
});

test("8.D: /dashboard/guest-stays/security/verifications empty copy explains the issuance + expiry", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/guest-stays/security/verifications/page.tsx",
  );
  assert.match(src, /Issued automatically when a guest first scans their stay link/);
  assert.match(src, /expires after 10 minutes/);
});

// ===========================================================================
// Phase 8.D closure
// ===========================================================================

test("Phase 8.D: no new migrations", () => {
  assert.ok(
    !exists("drizzle/0087_development_os_stage_8_d.sql"),
    "Phase 8.D is copy-only — no migration expected",
  );
});

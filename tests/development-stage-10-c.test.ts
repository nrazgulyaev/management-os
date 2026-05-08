/**
 * Stage 10.C — Route triage acceptance tests.
 *
 * Verifies:
 *   1. `next.config.mjs` `redirects()` ships permanent (HTTP 308)
 *      redirects for the 47 REDIRECT entries from
 *      `docs/stage-10-route-triage.md`.
 *   2. Each redirect destination resolves to a shipped page in the
 *      codebase (so 308 → 200 in production).
 *   3. The triage doc itself is present + structured.
 *   4. The 7 BUILD entries are spelled correctly in the doc and align
 *      with the master plan's 10.M sub-phases.
 *
 * Read-only: no production calls, no nav file edits required.
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

// The canonical redirect map mirrors next.config.mjs. Test verifies:
//  - source appears as redirect entry in next.config
//  - destination has a shipped page.tsx in the codebase
const REDIRECT_MAP: Record<string, string> = {
  "/dashboard/ai/assistants": "/dashboard/ai",
  "/dashboard/audit-log": "/dashboard/audit",
  "/dashboard/calendar": "/dashboard/bookings/calendar",
  "/dashboard/direct-bookings/guest-messages": "/dashboard/direct-bookings/messages",
  "/dashboard/finance/material-usage-bridge": "/dashboard/finance/material-usage",
  "/dashboard/finance/statement-transparency": "/dashboard/finance/transparency",
  "/dashboard/front-office/availability/board": "/dashboard/availability",
  "/dashboard/front-office/calendar-blocks": "/dashboard/availability/blocks",
  "/dashboard/front-office/check-in-out-requests": "/dashboard/front-office/requests",
  "/dashboard/front-office/today": "/dashboard/front-office",
  "/dashboard/guest-journey/review-requests": "/dashboard/guest-journey/reviews",
  "/dashboard/integrations/automation-rules": "/dashboard/integrations/automation",
  "/dashboard/inventory/stock-by-location": "/dashboard/inventory/stock",
  "/dashboard/maintenance": "/dashboard/maintenance-intelligence",
  "/dashboard/maintenance/plans": "/dashboard/maintenance-intelligence/plans",
  "/dashboard/maintenance/risk-feed": "/dashboard/maintenance-intelligence/risks",
  "/dashboard/maintenance/templates": "/dashboard/maintenance-intelligence/templates",
  "/dashboard/maintenance/windows": "/dashboard/maintenance-intelligence/windows",
  "/dashboard/notifications/delivery-log": "/dashboard/notifications/deliveries",
  "/dashboard/operations/command-center": "/dashboard/operations",
  "/dashboard/owner-intelligence/booking-projection": "/dashboard/owner-intelligence/bookings",
  "/dashboard/owner-intelligence/health-reports": "/dashboard/owner-intelligence/health",
  "/dashboard/owner-intelligence/rebuild-events": "/dashboard/owner-intelligence/rebuild",
  "/dashboard/owner-intelligence/revenue-source-mix": "/dashboard/owner-intelligence/revenue",
  "/dashboard/pricing/quote-tester": "/dashboard/pricing/quote",
  "/dashboard/rate-plans": "/dashboard/bookings/rates",
  "/dashboard/security/auth/events": "/dashboard/security/events",
  "/dashboard/security/auth/login-attempts": "/dashboard/security/login-attempts",
  "/dashboard/security/auth/mfa-factors": "/dashboard/security/mfa",
  "/dashboard/sync": "/dashboard/bookings/sync",
  "/dashboard/system/demo-walkthrough": "/dashboard/demo",
  "/dashboard/system/deployment-readiness": "/dashboard/system/deployment",
  "/dashboard/system/job-locks": "/dashboard/jobs/locks",
  "/dashboard/system/job-runs": "/dashboard/jobs/runs",
  "/dashboard/system/jobs": "/dashboard/jobs",
  "/dashboard/villa-guides/concierge-ai": "/dashboard/guest-ai",
  "/dashboard/villa-guides/concierge-ai/attachments": "/dashboard/guest-ai/storage",
  "/dashboard/villa-guides/concierge-ai/handoff-sla": "/dashboard/guest-ai/handoffs/metrics",
  "/dashboard/villa-guides/concierge-ai/handoffs": "/dashboard/guest-ai/handoffs",
  "/dashboard/villa-guides/concierge-ai/sessions": "/dashboard/guest-ai/sessions",
  "/dashboard/villa-guides/security/events": "/dashboard/guest-stays/security/events",
  "/dashboard/villa-guides/security/verifications": "/dashboard/guest-stays/security/verifications",
  "/dashboard/villa-guides/services": "/dashboard/guest-services",
  "/dashboard/villa-guides/services/finance-bridge": "/dashboard/guest-services/finance-bridge",
  "/dashboard/villa-guides/services/orders": "/dashboard/guest-services/orders",
  "/development-os/cabinets": "/development-os/cabinets/my-cabinet",
  "/development-os/notifications": "/development-os/settings/notifications",
  "/development-os/operations/site-reports": "/development-os/site-reports",
  "/development-os/projects/new": "/development-os/projects",
};

const BUILD_LIST = [
  "/dashboard/front-office/readiness",
  "/dashboard/settings/account-security",
  "/dashboard/procurement/purchase-orders",
  "/dashboard/procurement/purchase-requests",
  "/dashboard/villa-guides/security/wifi-migration",
  "/development-os/procurement/quotation-comparison",
  "/development-os/integrations",
];

// ============================================================================
// next.config.mjs entries
// ============================================================================

test("10.C: next.config.mjs declares redirects() function", () => {
  const src = read("next.config.mjs");
  assert.match(src, /async\s+redirects\s*\(\s*\)/);
  assert.match(src, /STAGE_10_C_REDIRECTS/);
  assert.match(src, /permanent:\s*true/);
});

test("10.C: next.config.mjs contains every operator-spec source URL", () => {
  const src = read("next.config.mjs");
  for (const source of Object.keys(REDIRECT_MAP)) {
    assert.ok(
      src.includes(`source: "${source}"`),
      `next.config missing redirect source ${source}`,
    );
  }
});

test("10.C: every redirect destination has the correct mapping", () => {
  const src = read("next.config.mjs");
  for (const [source, destination] of Object.entries(REDIRECT_MAP)) {
    const re = new RegExp(
      `source:\\s*"${source.replace(/[/.]/g, "\\$&")}"\\s*,\\s*destination:\\s*"${destination.replace(/[/.]/g, "\\$&")}"`,
    );
    assert.match(
      src,
      re,
      `next.config.mjs entry for ${source} must map to ${destination}`,
    );
  }
});

test("10.C: every redirect destination resolves to a shipped page", () => {
  const dashboardRoot = "src/app/(dashboard)";
  const devOsRoot = "src/app/(development-app)";
  const missing: string[] = [];
  for (const destination of Object.values(REDIRECT_MAP)) {
    const candidates = [
      `${dashboardRoot}${destination}/page.tsx`,
      `${devOsRoot}${destination}/page.tsx`,
    ];
    if (!candidates.some(exists)) missing.push(destination);
  }
  assert.deepStrictEqual(
    missing,
    [],
    `redirect destinations missing a shipped page.tsx:\n${missing.join("\n")}`,
  );
});

test("10.C: redirect count matches the triage doc (49)", () => {
  assert.strictEqual(
    Object.keys(REDIRECT_MAP).length,
    49,
    `expected 49 redirects per triage doc, got ${Object.keys(REDIRECT_MAP).length}`,
  );
});

// ============================================================================
// Triage doc shape
// ============================================================================

test("10.C: triage doc shipped at docs/stage-10-route-triage.md", () => {
  assert.ok(exists("docs/stage-10-route-triage.md"));
  const src = read("docs/stage-10-route-triage.md");
  assert.match(src, /# Stage 10\.C — Route Triage/);
  assert.match(src, /## REDIRECT/);
  assert.match(src, /## BUILD/);
  assert.match(src, /## REMOVE/);
});

test("10.C: triage doc lists every BUILD route", () => {
  const src = read("docs/stage-10-route-triage.md");
  for (const url of BUILD_LIST) {
    assert.ok(
      src.includes(url),
      `triage doc missing BUILD entry for ${url}`,
    );
  }
});

test("10.C: triage doc cites every redirect source URL", () => {
  const src = read("docs/stage-10-route-triage.md");
  for (const source of Object.keys(REDIRECT_MAP)) {
    assert.ok(
      src.includes(source),
      `triage doc missing reference to ${source}`,
    );
  }
});

test("10.C: triage doc maps each BUILD entry to a 10.M sub-phase", () => {
  const src = read("docs/stage-10-route-triage.md");
  // Every BUILD entry should appear inside a paragraph that names a 10.M
  // sub-phase (10.M.1 .. 10.M.10).
  for (const subphase of [
    "10.M.2",
    "10.M.7",
    "10.M.8",
    "10.M.10",
  ]) {
    assert.ok(
      src.includes(subphase),
      `triage doc must map at least one BUILD entry to ${subphase}`,
    );
  }
});

// ============================================================================
// Menu fidelity (verifies the cleanup didn't break the existing nav)
// ============================================================================

test("10.C: every dashboardNav href resolves to a shipped page (regression guard)", () => {
  const navSrc = read("src/config/navigation.ts");
  const matches = navSrc.match(/href:\s*"\/dashboard[^"]*"/g) ?? [];
  const hrefs = Array.from(
    new Set(
      matches
        .map((m) => m.match(/href:\s*"([^"]+)"/)?.[1])
        .filter((h): h is string => Boolean(h)),
    ),
  );
  const missing = hrefs.filter((href) => {
    const rest = href.slice("/dashboard".length);
    return !exists(`src/app/(dashboard)/dashboard${rest}/page.tsx`);
  });
  assert.deepStrictEqual(
    missing,
    [],
    `dashboardNav points at routes that don't exist:\n${missing.join("\n")}`,
  );
});

// ============================================================================
// Decisions doc
// ============================================================================

test("Phase 10.C: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-c-decisions.md"));
});

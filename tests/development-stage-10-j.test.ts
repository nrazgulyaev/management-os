/**
 * Stage 10.J — Owner intelligence + investor portal modernization.
 *
 * Three sub-sweeps:
 *   - 10.J.1 — Owner portal (5 pages): empty state inline → <NoItemsYet>
 *   - 10.J.2 — Investor portal (4 pages): stone-themed inline polish
 *     (KEPT in-theme — pulling ink-themed primitives into a stone-themed
 *      shell would visually contaminate two design systems)
 *   - 10.J.3 — Owner-intelligence admin: <DashboardKpi> swap on hub +
 *     revenue + <NoItemsYet> on health
 *
 * No migrations, no new schema, no new client behaviour. Pure
 * presentational uplift driven by the Stage 10.D primitives barrel.
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
// 10.J.1 — Owner portal sweep
// ============================================================================

const OWNER_BOOKINGS = "src/app/(owner)/owner/bookings/page.tsx";
const OWNER_STAYS = "src/app/(owner)/owner/stays/page.tsx";
const OWNER_REVENUE = "src/app/(owner)/owner/revenue/page.tsx";
const OWNER_INBOX = "src/app/(owner)/owner/inbox/page.tsx";
const OWNER_CALENDAR = "src/app/(owner)/owner/calendar/page.tsx";

test("10.J.1 — owner/bookings: NoItemsYet + NoMatchingResults wired (filter-aware)", () => {
  const src = read(OWNER_BOOKINGS);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /NoMatchingResults/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
  // Filter-aware branch: empty + (any filter active) → NoMatchingResults
  assert.match(
    src,
    /source !== "all" \|\| status !== "all" \|\| sp\.villa/,
    "must distinguish filtered-empty from truly-empty",
  );
});

test("10.J.1 — owner/stays: NoItemsYet replaces inline dashed empty", () => {
  const src = read(OWNER_STAYS);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /entityLabel="owner-stay requests"/);
  assert.doesNotMatch(
    src,
    /border-dashed border-line-soft bg-muted\/20 px-5 py-6 text-sm text-ink-tertiary/,
    "inline dashed empty must be removed",
  );
});

test("10.J.1 — owner/revenue: NoItemsYet covers source-mix + monthly-buckets empties", () => {
  const src = read(OWNER_REVENUE);
  // Both empty branches must use NoItemsYet
  const matches = src.match(/<NoItemsYet/g) ?? [];
  assert.ok(matches.length >= 2, `expected ≥2 NoItemsYet usages, got ${matches.length}`);
  assert.match(src, /entityLabel="revenue rows"/);
  assert.match(src, /entityLabel="monthly buckets"/);
});

test("10.J.1 — owner/inbox: NoItemsYet replaces inline dashed empty", () => {
  const src = read(OWNER_INBOX);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /entityLabel="notifications"/);
});

test("10.J.1 — owner/calendar: NoItemsYet for the 'no linked villas' branch", () => {
  const src = read(OWNER_CALENDAR);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /entityLabel="linked villas"/);
});

test("10.J.1 — owner-portal pages drop the inline 'border-dashed bg-muted py-8' empty pattern", () => {
  // The filter-empty + per-villa-window-empty cases legitimately keep an
  // inline message (NoMatchingResults handles filter-empty; per-villa is
  // contextual, not a true empty state). Spot-check 3 pages that should
  // be fully clean of the legacy pattern at the page-level.
  for (const f of [OWNER_STAYS, OWNER_INBOX, OWNER_REVENUE]) {
    const src = read(f);
    assert.doesNotMatch(
      src,
      /border-dashed border-line-soft bg-muted\/20.*py-(?:6|8) text-sm text-ink-tertiary/,
      `${f} must not retain the legacy inline-empty pattern`,
    );
  }
});

// ============================================================================
// 10.J.2 — Investor portal (stone-themed in-theme polish)
// ============================================================================

const INV_DASHBOARD =
  "src/app/(investor-portal)/investor-portal/dashboard/page.tsx";
const INV_COMMITMENTS =
  "src/app/(investor-portal)/investor-portal/commitments/page.tsx";
const INV_REQUESTS =
  "src/app/(investor-portal)/investor-portal/requests/page.tsx";
const INV_DOCUMENTS =
  "src/app/(investor-portal)/investor-portal/documents/page.tsx";

test("10.J.2 — investor portal stays in stone theme (no ink-palette primitives bleed)", () => {
  // Pulling ink-themed <NoItemsYet> into a stone-themed PortalShell would
  // visually contaminate two design systems. Test verifies we did NOT.
  for (const f of [INV_DASHBOARD, INV_COMMITMENTS, INV_REQUESTS, INV_DOCUMENTS]) {
    const src = read(f);
    assert.doesNotMatch(
      src,
      /from "@\/components\/ui\/primitives"/,
      `${f} must NOT pull ink-themed primitives into the stone-themed portal shell`,
    );
  }
});

test("10.J.2 — investor portal empties upgraded to dashed + headline + subline (in-theme)", () => {
  for (const [f, label] of [
    [INV_DASHBOARD, "investor dashboard"],
    [INV_COMMITMENTS, "investor commitments"],
    [INV_REQUESTS, "investor requests"],
    [INV_DOCUMENTS, "investor documents"],
  ] as const) {
    const src = read(f);
    assert.match(
      src,
      /border-dashed border-stone-300 bg-white px-6 py-10 text-center/,
      `${label}: empty state must use stone-themed dashed centered layout`,
    );
    assert.match(
      src,
      /text-sm font-medium text-stone-700/,
      `${label}: empty state must surface a stone-themed headline`,
    );
  }
});

// ============================================================================
// 10.J.3 — Owner-intelligence admin
// ============================================================================

const OI_HUB = "src/app/(dashboard)/dashboard/owner-intelligence/page.tsx";
const OI_HEALTH =
  "src/app/(dashboard)/dashboard/owner-intelligence/health/page.tsx";
const OI_REVENUE =
  "src/app/(dashboard)/dashboard/owner-intelligence/revenue/page.tsx";

test("10.J.3 — owner-intelligence hub: MetricCard → DashboardKpi", () => {
  const src = read(OI_HUB);
  assert.match(src, /DashboardKpi/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
  assert.doesNotMatch(
    src,
    /<MetricCard\b/,
    "MetricCard must be removed from the hub (replaced by DashboardKpi)",
  );
  // status flags drive the side-border tone
  assert.match(src, /status=\{attention\.length > 0 \? "bad" : "good"\}/);
});

test("10.J.3 — owner-intelligence/health: NoItemsYet replaces inline empty", () => {
  const src = read(OI_HEALTH);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /entityLabel="health snapshots"/);
});

test("10.J.3 — owner-intelligence/revenue: MetricCard → DashboardKpi (4 cards)", () => {
  const src = read(OI_REVENUE);
  assert.match(src, /DashboardKpi/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
  // 4 KPI cards across the strip
  const matches = src.match(/<DashboardKpi/g) ?? [];
  assert.ok(matches.length >= 4, `expected ≥4 DashboardKpi cards, got ${matches.length}`);
  assert.doesNotMatch(src, /<MetricCard\b/);
});

// ============================================================================
// Cross-cutting: Stage 10.D primitives barrel adoption count
// ============================================================================

test("10.J — primitives barrel imported by ≥6 owner / owner-intel pages", () => {
  // Aggregate adoption check — 10.J pulls primitives into 6+ surfaces.
  const targets = [
    OWNER_BOOKINGS,
    OWNER_STAYS,
    OWNER_REVENUE,
    OWNER_INBOX,
    OWNER_CALENDAR,
    OI_HUB,
    OI_HEALTH,
    OI_REVENUE,
  ];
  let count = 0;
  for (const f of targets) {
    const src = read(f);
    if (/from "@\/components\/ui\/primitives"/.test(src)) count += 1;
  }
  assert.ok(count >= 6, `expected ≥6 pages importing primitives, got ${count}`);
});

test("10.J — decisions doc shipped + acceptance gate present", () => {
  const doc = read("tmp/stage-10-j-decisions.md");
  assert.match(doc, /STAGE 10 \/ PHASE 10\.J ACCEPTED/);
  // Theme-isolation rationale captured.
  assert.match(doc, /Stone-theme in-place polish|theme isolation|stone-themed/i);
});

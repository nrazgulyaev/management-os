/**
 * Stage 10.M.3 — Procurement pages acceptance tests.
 *
 * Closes audit BUILD #3 + #4. The audit's URLs
 *   /dashboard/procurement/purchase-orders
 *   /dashboard/procurement/purchase-requests
 * were 404 because the canonical Mgmt OS routes are
 *   /dashboard/procurement/orders
 *   /dashboard/procurement/requests
 *
 * Two-part fix:
 *   A) Add HTTP 308 redirects so the audit's aliased URLs resolve
 *      (10.C-style — bookmarks + external doc links keep working).
 *   B) Modernize the canonical pages with 10.D primitives:
 *      <DashboardKpi> KPI strip, <NoItemsYet> empty state with
 *      addAction, status filter pills.
 *
 * No schema changes; reuses the existing Mgmt OS purchase_orders +
 * purchase_requests tables (Stage 7+).
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

const ORDERS_PAGE =
  "src/app/(dashboard)/dashboard/procurement/orders/page.tsx";
const REQUESTS_PAGE =
  "src/app/(dashboard)/dashboard/procurement/requests/page.tsx";
const NEXT_CONFIG = "next.config.mjs";
const DECISIONS_DOC = "tmp/stage-10-m-3-decisions.md";

// Part A — alias redirects.

test("10.M.3 — next.config.mjs redirects /procurement/purchase-orders → /procurement/orders", () => {
  const src = read(NEXT_CONFIG);
  assert.match(
    src,
    /source:\s*"\/dashboard\/procurement\/purchase-orders"\s*,\s*destination:\s*"\/dashboard\/procurement\/orders"/,
  );
});

test("10.M.3 — next.config.mjs redirects /procurement/purchase-requests → /procurement/requests", () => {
  const src = read(NEXT_CONFIG);
  assert.match(
    src,
    /source:\s*"\/dashboard\/procurement\/purchase-requests"\s*,\s*destination:\s*"\/dashboard\/procurement\/requests"/,
  );
});

test("10.M.3 — alias redirect destinations resolve to shipped pages", () => {
  assert.ok(
    exists(ORDERS_PAGE),
    "/dashboard/procurement/orders must exist as the canonical page",
  );
  assert.ok(
    exists(REQUESTS_PAGE),
    "/dashboard/procurement/requests must exist as the canonical page",
  );
});

// Part B — orders modernization.

test("10.M.3 — orders page uses 10.D primitives", () => {
  const src = read(ORDERS_PAGE);
  assert.match(src, /DashboardKpi/);
  assert.match(src, /NoItemsYet/);
  assert.match(
    src,
    /from "@\/components\/ui\/primitives"/,
    "must import from 10.D primitives barrel",
  );
});

test("10.M.3 — orders page renders 4 KPI cards (open/awaiting/partial/received)", () => {
  const src = read(ORDERS_PAGE);
  assert.match(src, /label="Open POs"/);
  assert.match(src, /label="Awaiting delivery"/);
  assert.match(src, /label="Partially received"/);
  assert.match(src, /label="Received"/);
});

test("10.M.3 — orders page wires NoItemsYet with addAction (true empty state only)", () => {
  const src = read(ORDERS_PAGE);
  assert.match(
    src,
    /addAction=\{[\s\S]*?\/dashboard\/procurement\/orders\/new[\s\S]*?\}/,
    "NoItemsYet must surface a New PO CTA",
  );
});

test("10.M.3 — orders page accepts ?status= filter + force-dynamic", () => {
  const src = read(ORDERS_PAGE);
  assert.match(
    src,
    /searchParams.*Promise<\{\s*status\?:\s*string\s*\}>/,
    "must accept ?status= via Next.js searchParams",
  );
  assert.match(src, /export const dynamic = "force-dynamic"/);
  // The 6 PO statuses + "All" pill.
  assert.match(src, /STATUS_FILTERS/);
});

// Part B — requests modernization.

test("10.M.3 — requests page uses 10.D primitives", () => {
  const src = read(REQUESTS_PAGE);
  assert.match(src, /DashboardKpi/);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
});

test("10.M.3 — requests page renders 4 KPI cards (drafts/awaiting/approved/ordered)", () => {
  const src = read(REQUESTS_PAGE);
  assert.match(src, /label="Drafts"/);
  assert.match(src, /label="Awaiting approval"/);
  assert.match(src, /label="Approved"/);
  assert.match(src, /label="Ordered"/);
});

test("10.M.3 — requests page wires NoItemsYet with addAction", () => {
  const src = read(REQUESTS_PAGE);
  assert.match(
    src,
    /addAction=\{[\s\S]*?\/dashboard\/procurement\/requests\/new[\s\S]*?\}/,
  );
});

test("10.M.3 — requests page accepts ?status= filter + force-dynamic", () => {
  const src = read(REQUESTS_PAGE);
  assert.match(
    src,
    /searchParams.*Promise<\{\s*status\?:\s*string\s*\}>/,
  );
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /STATUS_FILTERS/);
});

test("10.M.3 — both pages re-use existing services (no new query helpers)", () => {
  const orders = read(ORDERS_PAGE);
  const requests = read(REQUESTS_PAGE);
  assert.match(orders, /listPurchaseOrders/);
  assert.match(orders, /from "@\/features\/procurement\/services"/);
  assert.match(requests, /listPurchaseRequests/);
  assert.match(requests, /from "@\/features\/procurement\/services"/);
});

test("10.M.3 — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC), `Missing ${DECISIONS_DOC}`);
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10 \/ PHASE 10\.M\.3 ACCEPTED/);
});

/**
 * Stage 10.M.5 — Dev OS routes acceptance tests (Track B closure).
 *
 * PART A — /development-os/integrations was HTTP 500. Root cause was a
 * dead `void CHANNEL_LABELS` import that pulled a "use client" module
 * into this server component. Fix:
 *   - dropped the dead import
 *   - wrapped every db query in safeQuery (graceful degradation)
 *   - swapped StatTile → 10.D <DashboardKpi>
 *
 * PART B — /development-os/procurement/quotation-comparison was a 404
 * (the directory only had a [requestCode] subroute). New list page
 * surfaces every PR with at least one quotation + an "approved-but-no-
 * quotes" warning section. Reuses the existing detail page for
 * vendor-by-vendor comparison + selection.
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

const INTEGRATIONS_PAGE =
  "src/app/(development-app)/development-os/integrations/page.tsx";
const COMPARISON_LIST =
  "src/app/(development-app)/development-os/procurement/quotation-comparison/page.tsx";
const COMPARISON_DETAIL =
  "src/app/(development-app)/development-os/procurement/quotation-comparison/[requestCode]/page.tsx";
const COMPARISON_QUERIES =
  "src/lib/development/server/procurement/quotation-comparison-queries.ts";
const DECISIONS_DOC = "tmp/stage-10-m-5-decisions.md";

// ============================================================================
// PART A — integrations page (was 500)
// ============================================================================

test("10.M.5 PART A — integrations page no longer imports CHANNEL_LABELS from a client module", () => {
  const src = read(INTEGRATIONS_PAGE);
  // Strip JSDoc / line comments before checking — the fix-rationale comment
  // legitimately mentions CHANNEL_LABELS by name.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[\t ]*\/\/.*$/gm, "");
  assert.doesNotMatch(
    code,
    /\bCHANNEL_LABELS\b/,
    "dead 'use client' import (root cause of the 500) must be removed",
  );
  assert.doesNotMatch(
    code,
    /from "@\/components\/development\/channels\/connect-channel-modal"/,
    "the source module is 'use client'; server pages must not import it",
  );
});

test("10.M.5 PART A — integrations page wraps every db query in safeQuery", () => {
  const src = read(INTEGRATIONS_PAGE);
  assert.match(src, /safeQuery/);
  // 3 queries → ≥ 3 safeQuery wrappers.
  const count = (src.match(/safeQuery\(/g) ?? []).length;
  assert.ok(
    count >= 3,
    `expected ≥3 safeQuery wraps, got ${count} — graceful degradation needs all 3 queries protected`,
  );
});

test("10.M.5 PART A — integrations page uses 10.D DashboardKpi (was StatTile)", () => {
  const src = read(INTEGRATIONS_PAGE);
  assert.match(src, /DashboardKpi/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
  assert.doesNotMatch(
    src,
    /function StatTile\(/,
    "old bespoke StatTile helper must be removed",
  );
});

// ============================================================================
// PART B — quotation-comparison list page (was 404)
// ============================================================================

test("10.M.5 PART B — quotation-comparison list page exists", () => {
  assert.ok(exists(COMPARISON_LIST), `Missing ${COMPARISON_LIST}`);
});

test("10.M.5 PART B — list-page query helpers exist + expose comparison + awaiting reads", () => {
  assert.ok(exists(COMPARISON_QUERIES), `Missing ${COMPARISON_QUERIES}`);
  const src = read(COMPARISON_QUERIES);
  assert.match(src, /export async function listQuotationComparisons/);
  assert.match(src, /export async function listPurchaseRequestsAwaitingQuotations/);
  assert.match(src, /export function summarizeQuotationComparisons/);
});

test("10.M.5 PART B — query helper aggregates per-PR via groupBy on procurementQuotations", () => {
  const src = read(COMPARISON_QUERIES);
  assert.match(
    src,
    /\.groupBy\(procurementQuotations\.purchaseRequestId\)/,
    "must aggregate quotes per PR in a single round-trip",
  );
  assert.match(
    src,
    /MIN\(\$\{procurementQuotations\.totalAmountMinor\}\)/,
    "must compute lowest price per PR",
  );
  assert.match(
    src,
    /MAX\(\$\{procurementQuotations\.totalAmountMinor\}\)/,
    "must compute highest price per PR for spread calc",
  );
});

test("10.M.5 PART B — list page uses 10.D primitives (DashboardKpi + NoItemsYet)", () => {
  const src = read(COMPARISON_LIST);
  assert.match(src, /DashboardKpi/);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
});

test("10.M.5 PART B — list page renders 4 KPI cards (RFQs / awaiting / decided / quotes)", () => {
  const src = read(COMPARISON_LIST);
  assert.match(src, /label="RFQs total"/);
  assert.match(src, /label="Awaiting decision"/);
  assert.match(src, /label="Decided"/);
  assert.match(src, /label="Quotes received"/);
});

test("10.M.5 PART B — list page links each row to the existing comparison detail", () => {
  const src = read(COMPARISON_LIST);
  assert.match(
    src,
    /\/development-os\/procurement\/quotation-comparison\/\$\{encodeURIComponent\(r\.requestCode\)\}/,
    "Compare button must deep-link to the detail page using requestCode",
  );
  // Detail page must still exist (no regression).
  assert.ok(
    exists(COMPARISON_DETAIL),
    "the [requestCode] detail page must still exist",
  );
});

test("10.M.5 PART B — list page surfaces a warning section for approved PRs without quotations", () => {
  const src = read(COMPARISON_LIST);
  assert.match(src, /listPurchaseRequestsAwaitingQuotations/);
  assert.match(src, /awaiting quotations/i);
});

test("10.M.5 PART B — list page is read-only (no mutation server-action import)", () => {
  const src = read(COMPARISON_LIST);
  assert.doesNotMatch(
    src,
    /selectQuotationAction|rejectQuotationAction|addQuotationAction/,
    "selection/rejection live on the detail page; list page is read-only",
  );
});

test("10.M.5 PART B — list page wraps queries in safeQuery (graceful degradation)", () => {
  const src = read(COMPARISON_LIST);
  assert.match(src, /safeQuery/);
  const count = (src.match(/safeQuery\(/g) ?? []).length;
  assert.ok(
    count >= 2,
    `expected ≥2 safeQuery wraps, got ${count}`,
  );
});

// ============================================================================
// Track B closure
// ============================================================================

test("10.M.5 — decisions doc shipped + Track B closure documented", () => {
  assert.ok(exists(DECISIONS_DOC), `Missing ${DECISIONS_DOC}`);
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10 \/ PHASE 10\.M\.5 ACCEPTED/);
  assert.match(doc, /Track B/i, "must document Track B closure");
});

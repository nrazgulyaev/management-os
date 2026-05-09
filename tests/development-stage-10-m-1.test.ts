/**
 * Stage 10.M.1 — Front-office arrival readiness page acceptance tests.
 *
 * Closes the audit's BUILD #1 (`/dashboard/front-office/readiness`,
 * previously 404). New surface aggregates today's arrivals with the
 * villa's current readiness state + open housekeeping / maintenance /
 * service-request blockers so the front desk can clear the worst
 * blockers before guests arrive.
 *
 * Pure read-only — the existing operations actions own every readiness
 * transition (see /dashboard/readiness for the org-wide setter).
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

const READINESS_PAGE =
  "src/app/(dashboard)/dashboard/front-office/readiness/page.tsx";
const READINESS_SERVICE = "src/features/front-office/readiness-services.ts";
const FRONT_OFFICE_LANDING =
  "src/app/(dashboard)/dashboard/front-office/page.tsx";
const DECISIONS_DOC = "tmp/stage-10-m-1-decisions.md";

test("10.M.1 — readiness page file exists", () => {
  assert.ok(exists(READINESS_PAGE), `Missing ${READINESS_PAGE}`);
});

test("10.M.1 — readiness query helper exists + exports the public surface", () => {
  assert.ok(exists(READINESS_SERVICE), `Missing ${READINESS_SERVICE}`);
  const src = read(READINESS_SERVICE);
  assert.match(src, /export async function listArrivalReadiness/);
  assert.match(src, /export function summarizeReadiness/);
  assert.match(src, /export interface ReadinessRow/);
  assert.match(src, /export interface ReadinessSummary/);
});

test("10.M.1 — query helper joins arrivals + readiness states + tasks + service requests", () => {
  const src = read(READINESS_SERVICE);
  // Must touch each of the 4 source tables.
  assert.match(src, /from\(bookings\)/, "joins bookings");
  assert.match(src, /villaReadinessStates/, "queries readiness states");
  assert.match(src, /operationTasks/, "queries operation tasks");
  assert.match(src, /serviceRequests/, "queries service requests");
});

test("10.M.1 — query helper filters open readiness rows via isNull(effectiveTo)", () => {
  const src = read(READINESS_SERVICE);
  assert.match(
    src,
    /isNull\(villaReadinessStates\.effectiveTo\)/,
    "must filter only the current open readiness row per villa",
  );
});

test("10.M.1 — query helper aggregates housekeeping + maintenance separately", () => {
  const src = read(READINESS_SERVICE);
  assert.match(
    src,
    /eq\(operationTasks\.category,\s*"housekeeping"\)/,
    "housekeeping category filter",
  );
  assert.match(
    src,
    /eq\(operationTasks\.category,\s*"maintenance"\)/,
    "maintenance category filter",
  );
});

test("10.M.1 — readiness page uses 10.D primitives (DashboardKpi + NoItemsYet)", () => {
  const src = read(READINESS_PAGE);
  assert.match(src, /DashboardKpi/, "uses DashboardKpi");
  assert.match(src, /NoItemsYet/, "uses NoItemsYet for the empty state");
  assert.match(
    src,
    /from "@\/components\/ui\/primitives"/,
    "imports from 10.D barrel",
  );
});

test("10.M.1 — readiness page renders 4 KPI cards (arrivals, ready, in progress, blocked)", () => {
  const src = read(READINESS_PAGE);
  assert.match(src, /label="Arrivals today"/);
  assert.match(src, /label="Villas ready"/);
  assert.match(src, /label="In progress"/);
  assert.match(src, /label="Blocked"/);
});

test("10.M.1 — readiness page is read-only (no server-action mutation imports)", () => {
  const src = read(READINESS_PAGE);
  assert.doesNotMatch(
    src,
    /from "@\/features\/operations\/actions"/,
    "page must not own readiness mutations — operations actions do",
  );
  assert.doesNotMatch(
    src,
    /from "@\/features\/readiness\/actions"/,
    "page must not own readiness mutations",
  );
});

test("10.M.1 — readiness page accepts ?date= URL param + force-dynamic", () => {
  const src = read(READINESS_PAGE);
  assert.match(
    src,
    /searchParams.*Promise<\{\s*date\?:\s*string\s*\}>/,
    "must accept ?date searchParam",
  );
  assert.match(
    src,
    /export const dynamic = "force-dynamic"/,
    "must opt out of static rendering",
  );
});

test("10.M.1 — front-office landing links to the new readiness page", () => {
  const src = read(FRONT_OFFICE_LANDING);
  assert.match(
    src,
    /href="\/dashboard\/front-office\/readiness"/,
    "front-office landing must surface a Card linking to /readiness",
  );
});

test("10.M.1 — readiness page sorts rows into Blocked / In progress / Ready buckets", () => {
  const src = read(READINESS_PAGE);
  assert.match(src, /blockedRows/);
  assert.match(src, /cleaningRows/);
  assert.match(src, /readyRows/);
});

test("10.M.1 — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC), `Missing ${DECISIONS_DOC}`);
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10 \/ PHASE 10\.M\.1 ACCEPTED/);
});

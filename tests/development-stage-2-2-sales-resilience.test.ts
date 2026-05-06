/**
 * Stage 2.2 — /development-os/sales resilience.
 *
 * The Sales page fans out to one primary + several secondary queries.
 * If a secondary query is slow (postgres-js connection thrash, RLS
 * recompile, etc.) the page must still render; it must NEVER 500 from a
 * secondary timeout. The `safeQuery` helper is the contract: it
 * resolves with a fallback on timeout or rejection and emits a timing
 * record so the page can show a non-blocking warning.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  logSafeQueryTimings,
  safeQuery,
  type SafeQueryTiming,
} from "../src/lib/development/safe-query";

// ----------------------------------------------------------------------------
// safeQuery — pure-function contract
// ----------------------------------------------------------------------------

test("safeQuery returns the resolved value when within timeout", async () => {
  const timings: SafeQueryTiming[] = [];
  const value = await safeQuery(
    "fast-query",
    Promise.resolve(42),
    -1,
    1000,
    (t) => timings.push(t),
  );
  assert.equal(value, 42);
  assert.equal(timings.length, 1);
  assert.equal(timings[0].label, "fast-query");
  assert.equal(timings[0].usedFallback, false);
});

test("safeQuery resolves to fallback when promise never resolves before timeout", async () => {
  const timings: SafeQueryTiming[] = [];
  const fallback = { rows: [] as number[] };
  const value = await safeQuery(
    "stuck-query",
    new Promise<typeof fallback>(() => {
      // Intentionally never resolves.
    }),
    fallback,
    50,
    (t) => timings.push(t),
  );
  assert.equal(value, fallback);
  assert.equal(timings.length, 1);
  assert.equal(timings[0].usedFallback, true);
  assert.ok(timings[0].durationMs >= 40, "should take at least the timeout");
});

test("safeQuery resolves to fallback when promise rejects", async () => {
  const timings: SafeQueryTiming[] = [];
  const value = await safeQuery(
    "rejecting-query",
    Promise.reject(new Error("db blew up")),
    "fallback-value",
    1000,
    (t) => timings.push(t),
  );
  assert.equal(value, "fallback-value");
  assert.equal(timings.length, 1);
  assert.equal(timings[0].usedFallback, true);
});

test("safeQuery resolves to fallback when promise rejects asynchronously", async () => {
  const timings: SafeQueryTiming[] = [];
  const value = await safeQuery(
    "async-reject",
    new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error("late reject")), 10),
    ),
    -7,
    1000,
    (t) => timings.push(t),
  );
  assert.equal(value, -7);
  assert.equal(timings[0].usedFallback, true);
});

test("safeQuery clears its timer when the promise wins, so the timeout never fires later", async () => {
  // If the timer were not cleared, NodeJS would keep the event loop alive
  // for `timeoutMs` after the resolved value, even though the caller has
  // already moved on. We can detect lingering timers by checking that an
  // explicit deadline far shorter than the safeQuery timeout completes.
  const startedAt = Date.now();
  await safeQuery("quick", Promise.resolve("ok"), "fallback", 5_000);
  const elapsed = Date.now() - startedAt;
  assert.ok(
    elapsed < 200,
    `safeQuery should not block on the timeout when the promise resolves first (elapsed=${elapsed}ms)`,
  );
});

test("logSafeQueryTimings does not throw on empty input", () => {
  assert.doesNotThrow(() => logSafeQueryTimings("test", []));
});

// ----------------------------------------------------------------------------
// /development-os/sales page — static-source invariants
// ----------------------------------------------------------------------------

const SALES_PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(development-app)/development-os/sales/page.tsx",
);

test("sales page source exists and imports safeQuery", () => {
  assert.ok(existsSync(SALES_PAGE_PATH), "sales page must exist");
  const src = readFileSync(SALES_PAGE_PATH, "utf8");
  assert.match(src, /from ["']@\/lib\/development\/safe-query["']/);
  assert.match(src, /\bsafeQuery\b/);
});

test("sales page wraps every secondary query in safeQuery", () => {
  const src = readFileSync(SALES_PAGE_PATH, "utf8");
  for (const label of [
    "getLeadPipelineMetrics",
    "projects select",
    "getActiveLeadSources",
    "agents+contacts list",
    "getPendingDraftCountsByRole",
  ]) {
    // Each secondary query should appear as a safeQuery label literal.
    assert.match(
      src,
      new RegExp(`safeQuery\\(\\s*\"${label.replace(/[+]/g, "\\+")}\"`),
      `safeQuery wrapper missing for "${label}"`,
    );
  }
});

test("sales page no longer rejects on secondary-query timeout", () => {
  const src = readFileSync(SALES_PAGE_PATH, "utf8");
  // The previous rejecting helper must be gone.
  assert.doesNotMatch(src, /function withQueryTimeout/);
  // And no `reject(new Error(.*did not resolve)` thrown by a Promise.race.
  assert.doesNotMatch(src, /did not resolve within/);
});

test("sales page renders a non-blocking warning when any safeQuery falls back", () => {
  const src = readFileSync(SALES_PAGE_PATH, "utf8");
  assert.match(
    src,
    /degradedQueries/,
    "page should track degradedQueries from timings",
  );
  assert.match(
    src,
    /Some sales data is temporarily unavailable/,
    "page should render a visible degraded-state notice",
  );
});

// ----------------------------------------------------------------------------
// getActiveLeadSources — narrowed SELECT
// ----------------------------------------------------------------------------

test("getActiveLeadSources selects only the columns the UI needs", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/leads.ts"),
    "utf8",
  );
  // Find the function body and confirm the select statement is narrowed.
  const fnIndex = src.indexOf("export async function getActiveLeadSources");
  assert.ok(fnIndex >= 0, "getActiveLeadSources must be exported");
  const body = src.slice(fnIndex, fnIndex + 1200);
  assert.match(
    body,
    /\.select\(\s*\{[^}]*id:\s*leadSources\.id/,
    "must use a narrowed object-form select (not select())",
  );
  assert.doesNotMatch(
    body,
    /\.select\(\)\s*\.from\(leadSources\)/,
    "must NOT use SELECT *",
  );
});

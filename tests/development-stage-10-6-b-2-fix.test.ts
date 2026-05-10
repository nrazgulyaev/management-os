/**
 * Stage 10.6 / Phase 10.6.B.2-fix — Layout-level remediation.
 *
 * Production audit on 2026-05-10 revealed that 10.6.B.2's page-level
 * safeQuery wraps were inert because the layout-level
 * `enforceProductAccess()` runs FIRST and was unguarded. Page handler
 * never started → 500. Plus 10.6.B.1's seed surfaced latent slow
 * queries in the auth path.
 *
 * Fix:
 *   A. React `cache()` on getCurrentUserContext +
 *      getProductsEnabledForCurrentUser → dedupe per-request DB hits.
 *   B. Layout try/catch with `isRedirectError` re-throw, fallback to
 *      ServiceTemporarilyUnavailable component.
 *   C. The two new 503s (revenue-streams, distributions) already had
 *      page-level safeQuery; layout fix (B) alone restores them.
 *   D. settings/notifications had unguarded `await Promise.all([…])`
 *      — wrapped each query individually.
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

const PERMISSIONS = "src/features/auth/permissions.ts";
const PRODUCTS_ACCESS = "src/features/auth/products-access.ts";
const DEV_LAYOUT = "src/app/(development-app)/layout.tsx";
const DASH_LAYOUT = "src/app/(dashboard)/layout.tsx";
const STU_COMPONENT = "src/components/system/service-temporarily-unavailable.tsx";
const NOTIFS_PAGE = "src/app/(development-app)/development-os/settings/notifications/page.tsx";

// ============================================================================
// Step A — React cache() on auth queries
// ============================================================================

test("10.6.B.2-fix.A — getCurrentUserContext is wrapped in React cache()", () => {
  const src = read(PERMISSIONS);
  // Imports cache from react.
  assert.match(src, /^import \{ cache \} from "react";/m);
  // Wraps the export in cache(...).
  assert.match(
    src,
    /export const getCurrentUserContext = cache\(\s*async function getCurrentUserContext/,
  );
});

test("10.6.B.2-fix.A — getProductsEnabledForCurrentUser is wrapped in React cache()", () => {
  const src = read(PRODUCTS_ACCESS);
  assert.match(src, /^import \{ cache \} from "react";/m);
  assert.match(
    src,
    /export const getProductsEnabledForCurrentUser = cache\(\s*async function getProductsEnabledForCurrentUser/,
  );
});

// ============================================================================
// Step B — Layout-level try/catch with isRedirectError + fallback render
// ============================================================================

for (const [layoutPath, area] of [
  [DEV_LAYOUT, "dev"] as const,
  [DASH_LAYOUT, "mgmt"] as const,
]) {
  test(`10.6.B.2-fix.B — ${layoutPath} imports isRedirectError from next/dist/client/components/redirect-error`, () => {
    const src = read(layoutPath);
    assert.match(
      src,
      /import \{ isRedirectError \} from "next\/dist\/client\/components\/redirect-error";/,
    );
  });

  test(`10.6.B.2-fix.B — ${layoutPath} imports ServiceTemporarilyUnavailable component`, () => {
    const src = read(layoutPath);
    assert.match(
      src,
      /import \{ ServiceTemporarilyUnavailable \} from "@\/components\/system\/service-temporarily-unavailable";/,
    );
  });

  test(`10.6.B.2-fix.B — ${layoutPath} wraps enforceProductAccess in try/catch + re-throws redirect signals`, () => {
    const src = read(layoutPath);
    // try/catch around the await
    assert.match(src, /try\s*\{\s*await enforceProductAccess/);
    // isRedirectError re-throw
    assert.match(src, /if \(isRedirectError\(err\)\) throw err/);
  });

  test(`10.6.B.2-fix.B — ${layoutPath} renders ServiceTemporarilyUnavailable area="${area}" on non-redirect throw`, () => {
    const src = read(layoutPath);
    assert.match(
      src,
      new RegExp(
        `return\\s+<ServiceTemporarilyUnavailable area="${area}" />`,
      ),
    );
  });
}

test("10.6.B.2-fix.B — ServiceTemporarilyUnavailable component shipped + exports correctly", () => {
  assert.ok(existsSync(resolve(ROOT, STU_COMPONENT)));
  const src = read(STU_COMPONENT);
  assert.match(src, /export function ServiceTemporarilyUnavailable/);
  // Distinct from the shell — must NOT mount DashboardShell or DevelopmentAppShell.
  assert.doesNotMatch(src, /DashboardShell|DevelopmentAppShell/);
  // Reload + back-link affordances.
  assert.match(src, /Reload/);
  // Per-area heading via `area` prop.
  assert.match(src, /area\?: "mgmt" \| "dev"|area: "mgmt" \| "dev"/);
});

// ============================================================================
// Step D — settings/notifications Promise.all wrapped per-query
// ============================================================================

test("10.6.B.2-fix.D — settings/notifications wraps each Promise.all entry in safeQuery", () => {
  const src = read(NOTIFS_PAGE);
  assert.match(src, /import \{ safeQuery \} from "@\/lib\/development\/safe-query";/);
  // Each of 3 loaders wrapped with its own labelled safeQuery.
  for (const label of [
    "settings-notifications.getNotificationRules",
    "settings-notifications.getNotificationTemplates",
    "settings-notifications.getNotificationDeliveryLog",
  ]) {
    const re = new RegExp(`safeQuery\\(\\s*["']${label.replace(/\./g, "\\.")}["']`);
    assert.match(src, re, `expected safeQuery("${label}", …)`);
  }
});

// ============================================================================
// Decisions doc
// ============================================================================

test("10.6.B.2-fix — decisions doc shipped + acceptance gate present", () => {
  const path = "tmp/stage-10-6-b-2-fix-decisions.md";
  assert.ok(existsSync(resolve(ROOT, path)));
  const doc = readFileSync(resolve(ROOT, path), "utf8");
  assert.match(doc, /STAGE 10\.6 \/ PHASE 10\.6\.B\.2-fix ACCEPTED/);
  // Must reference the production-verification gap that triggered this remediation.
  assert.match(doc, /11 of 13|production audit|layout-level/i);
});

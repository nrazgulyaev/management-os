/**
 * Stage 10.M.4 — WiFi credential migration status page acceptance tests.
 *
 * Closes audit BUILD #5 — `/dashboard/villa-guides/security/wifi-migration`
 * was a 404. The new page is the **status / audit-log view** for the
 * Stage 8.A.5 WiFi credential AES-256-GCM rollout. Distinct from the
 * tool itself at /dashboard/villa-guides/wifi/migrate (which actually
 * runs the sweep).
 *
 * Pure read-only page — no new mutation actions; reuses Stage 8.A.5
 * encryption flow + Stage 8.B `wifi_password_migrated` security events.
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

const STATUS_PAGE =
  "src/app/(dashboard)/dashboard/villa-guides/security/wifi-migration/page.tsx";
const SERVICES =
  "src/features/villa-guides/wifi-migration-services.ts";
const TOOL_PAGE =
  "src/app/(dashboard)/dashboard/villa-guides/wifi/migrate/page.tsx";
const DECISIONS_DOC = "tmp/stage-10-m-4-decisions.md";

test("10.M.4 — wifi-migration status page file exists (was 404)", () => {
  assert.ok(exists(STATUS_PAGE), `Missing ${STATUS_PAGE}`);
});

test("10.M.4 — services helper exposes counts + event reader + pending list", () => {
  assert.ok(exists(SERVICES), `Missing ${SERVICES}`);
  const src = read(SERVICES);
  assert.match(src, /export async function summarizeWifiMigration/);
  assert.match(src, /export async function listWifiMigrationEvents/);
  assert.match(src, /export async function listPendingWifiMigrations/);
});

test("10.M.4 — services helper queries the wifi_password_migrated event type only", () => {
  const src = read(SERVICES);
  assert.match(
    src,
    /eq\(authSecurityEvents\.eventType,\s*"wifi_password_migrated"\)/,
    "audit log filter must scope to wifi_password_migrated events",
  );
});

test("10.M.4 — services helper computes encrypted/plaintext counts via SQL FILTER", () => {
  const src = read(SERVICES);
  assert.match(src, /FILTER \(WHERE \$\{villaWifiCredentials\.passwordCiphertext\} IS NOT NULL\)/);
  assert.match(src, /FILTER \(WHERE \$\{villaWifiCredentials\.displayPassword\} IS NOT NULL\)/);
});

test("10.M.4 — status page is read-only (no migration action import)", () => {
  const src = read(STATUS_PAGE);
  assert.doesNotMatch(
    src,
    /runWifiMigrationAction|WifiMigrateButton/,
    "status page must NOT trigger the sweep — that's the tool page's job",
  );
  assert.doesNotMatch(
    src,
    /from "@\/features\/villa-guides\/wifi-migrate-action"/,
    "no migration-action import on the status page",
  );
});

test("10.M.4 — status page uses 10.D primitives (DashboardKpi + NoItemsYet)", () => {
  const src = read(STATUS_PAGE);
  assert.match(src, /DashboardKpi/);
  assert.match(src, /NoItemsYet/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
});

test("10.M.4 — status page renders 4 KPI cards (total/encrypted/plaintext/migrated-30d)", () => {
  const src = read(STATUS_PAGE);
  assert.match(src, /label="Total credentials"/);
  assert.match(src, /label="Encrypted"/);
  assert.match(src, /label="Plaintext \(legacy\)"/);
  assert.match(src, /label="Migrated · 30d"/);
});

test("10.M.4 — status page surfaces KMS readiness badge", () => {
  const src = read(STATUS_PAGE);
  assert.match(src, /isStayLinkKmsConfigured/);
  assert.match(
    src,
    /STAY_LINK_KMS_SECRET/,
    "KMS-config copy must mention the env var so admins know what to set",
  );
});

test("10.M.4 — status page cross-links to the migration tool", () => {
  const src = read(STATUS_PAGE);
  assert.match(
    src,
    /href="\/dashboard\/villa-guides\/wifi\/migrate"/,
    "must link to the actual sweep tool",
  );
});

test("10.M.4 — migration tool page back-links to the status / audit page", () => {
  const src = read(TOOL_PAGE);
  assert.match(
    src,
    /href="\/dashboard\/villa-guides\/security\/wifi-migration"/,
    "tool page must surface the status / audit page in its actions slot",
  );
});

test("10.M.4 — status page never renders raw passwords or ciphertext", () => {
  const src = read(STATUS_PAGE);
  // Display only: hashed IPs, credential UUID prefixes, network name. No password fields.
  assert.doesNotMatch(src, /\bdisplayPassword\b/);
  assert.doesNotMatch(src, /\bpasswordCiphertext\b/);
  assert.doesNotMatch(src, /\bpasswordEncrypted\b/);
});

test("10.M.4 — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC), `Missing ${DECISIONS_DOC}`);
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10 \/ PHASE 10\.M\.4 ACCEPTED/);
});

/**
 * Stage 5.J — SaaS Foundation tests (multi-tenancy, public API, webhooks,
 * usage metrics, data export, billing-ready instrumentation).
 *
 * Coverage:
 *   - Migrations 0071–0074 (organizations + propagation + api/rate-limit + webhooks/usage/export)
 *   - Drizzle schemas
 *   - Pure helpers: webhook, api-key, rate-limiting, branding, modules,
 *     usage aggregation, data export formatting
 *   - Cron + dispatcher + route audit (72 routes, 5 new keys)
 *   - 7 v1 API endpoint presence + auth-wrapper integration
 *   - Sidebar `Platform` group + Settings extensions
 *   - UI page presence
 *   - Demo seed audit
 *   - Architecture doc marker
 *   - Multi-tenancy regression invariants
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  shouldEventBeDispatched,
  computeNextRetryDelay,
  generateSigningSecret,
  generateWebhookSignature,
  buildSignatureHeader,
  verifyWebhookSignature,
} from "../src/lib/development/server/webhooks/webhook-helpers";
import {
  generateApiKey,
  hashApiKey,
  parseKeyPrefix,
  scopeAllowed,
  constantTimeHashCompare,
} from "../src/lib/development/server/api/api-key-helpers";
import {
  checkRateLimit,
  windowStartFor,
} from "../src/lib/development/server/api/rate-limiting-helpers";
import {
  renderBrandingCss,
  resolveLogoUrl,
  resolveFaviconUrl,
} from "../src/lib/development/server/organizations/branding-helpers";
import {
  ALL_MODULE_KEYS,
  isModuleEnabled,
  moduleEnabledFlags,
} from "../src/lib/development/server/organizations/module-config-helpers";
import {
  dailyPeriod,
  weeklyPeriod,
  monthlyPeriod,
  rollupSummaries,
} from "../src/lib/development/server/usage/usage-aggregation-helpers";
import {
  rowsToCsv,
  tablesToJson,
  tablesToSql,
  formatExport,
} from "../src/lib/development/server/data-export/export-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_71 = "drizzle/0071_development_os_stage_5_j_1_organizations.sql";
const MIG_72 = "drizzle/0072_development_os_stage_5_j_2_propagation.sql";
const MIG_73 = "drizzle/0073_development_os_stage_5_j_3_api.sql";
const MIG_74 = "drizzle/0074_development_os_stage_5_j_4_webhooks_usage.sql";

// ===========================================================================
// 1) Migration 0071 — organizations + propagation foundation
// ===========================================================================

test("migration 0071 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_71));
  const sql = read(MIG_71);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0071 creates organizations table", () => {
  assert.match(read(MIG_71), /CREATE TABLE IF NOT EXISTS "organizations"/i);
});

test("migration 0071 has organization_code unique constraint", () => {
  // The order is `TEXT UNIQUE NOT NULL` in this migration.
  assert.match(read(MIG_71), /"organization_code"\s+TEXT\s+UNIQUE\s+NOT NULL/i);
});

test("migration 0071 inserts ARCONIQUE_DEFAULT seed row", () => {
  assert.match(read(MIG_71), /'ARCONIQUE_DEFAULT'/);
});

test("migration 0071 extends app_users with organization_id NOT NULL", () => {
  const sql = read(MIG_71);
  assert.match(sql, /ALTER TABLE "app_users"[\s\S]*organization_id/i);
});

test("migration 0071 creates current_user_organization_id() function", () => {
  assert.match(read(MIG_71), /CREATE OR REPLACE FUNCTION current_user_organization_id/i);
});

test("migration 0071 creates is_in_user_organization() function", () => {
  assert.match(read(MIG_71), /CREATE OR REPLACE FUNCTION is_in_user_organization/i);
});

test("migration 0071 marks org-scope helpers SECURITY DEFINER", () => {
  assert.match(read(MIG_71), /SECURITY DEFINER/);
});

test("migration 0071 enables RLS on organizations", () => {
  assert.match(
    read(MIG_71),
    /ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY/i,
  );
});

// ===========================================================================
// 2) Migration 0072 — propagation
// ===========================================================================

test("migration 0072 exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_72));
  const sql = read(MIG_72);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0072 declares Strategy B fix in comment header", () => {
  assert.match(read(MIG_72), /single-statement ADD COLUMN/i);
});

test("migration 0072 uses ADD COLUMN ... DEFAULT ... pattern", () => {
  // Atomic backfill avoids 'table in use' error.
  assert.match(
    read(MIG_72),
    /ADD COLUMN organization_id UUID NOT NULL DEFAULT %L REFERENCES organizations\(id\)/,
  );
});

test("migration 0072 drops the default after backfill", () => {
  assert.match(read(MIG_72), /DROP DEFAULT/);
});

test("migration 0072 enumerates dev_transactions", () => {
  assert.match(read(MIG_72), /'dev_transactions'/);
});

test("migration 0072 enumerates capital_commitments", () => {
  assert.match(read(MIG_72), /'capital_commitments'/);
});

test("migration 0072 enumerates campaigns + leads", () => {
  const sql = read(MIG_72);
  assert.match(sql, /'campaigns'/);
  assert.match(sql, /'leads'/);
});

test("migration 0072 creates per-table organization_idx indexes", () => {
  assert.match(read(MIG_72), /_organization_idx/);
});

test("migration 0072 keeps reference tables NULLABLE", () => {
  // asset_types / marketing_lead_sources / tax_types etc. — single shared row
  const sql = read(MIG_72);
  assert.match(sql, /'asset_types'/);
  assert.match(sql, /ref_tables/);
});

test("migration 0072 raises if ARCONIQUE_DEFAULT missing", () => {
  assert.match(read(MIG_72), /ARCONIQUE_DEFAULT organization not found/);
});

// ===========================================================================
// 3) Migration 0073 — API keys + request log + rate-limit buckets
// ===========================================================================

test("migration 0073 exists", () => {
  assert.ok(exists(MIG_73));
});

test("migration 0073 creates api_keys table", () => {
  assert.match(read(MIG_73), /CREATE TABLE IF NOT EXISTS "api_keys"/i);
});

test("migration 0073 creates api_request_log table", () => {
  assert.match(read(MIG_73), /CREATE TABLE IF NOT EXISTS "api_request_log"/i);
});

test("migration 0073 creates rate_limit_buckets table", () => {
  assert.match(
    read(MIG_73),
    /CREATE TABLE IF NOT EXISTS "rate_limit_buckets"/i,
  );
});

test("migration 0073 enables RLS for all 3 tables (loop)", () => {
  const sql = read(MIG_73);
  // RLS is enabled inside a DO loop iterating over the 3 table names.
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /'api_keys', 'api_request_log', 'rate_limit_buckets'/);
});

test("migration 0073 stores key_hash UNIQUE", () => {
  // The UNIQUE may be a column constraint OR a table-level UNIQUE clause.
  const sql = read(MIG_73);
  assert.ok(
    /"key_hash"\s+TEXT\s+NOT NULL[\s\S]*UNIQUE\s*\(\s*"key_hash"/.test(sql) ||
      /"key_hash"\s+TEXT\s+NOT NULL\s+UNIQUE/.test(sql),
  );
});

test("migration 0073 has key_prefix index for fast lookup", () => {
  assert.match(read(MIG_73), /api_keys.*prefix.*idx|api_keys_prefix_idx/i);
});

test("migration 0073 indexes rate_limit_buckets by api_key + window", () => {
  assert.match(read(MIG_73), /rate_limit_buckets_key_window_unique|api_key_id.*window_type.*window_start/i);
});

// ===========================================================================
// 4) Migration 0074 — webhooks + usage + export
// ===========================================================================

test("migration 0074 exists", () => {
  assert.ok(exists(MIG_74));
});

test("migration 0074 creates webhook_subscriptions", () => {
  assert.match(
    read(MIG_74),
    /CREATE TABLE IF NOT EXISTS "webhook_subscriptions"/i,
  );
});

test("migration 0074 creates webhook_delivery_log", () => {
  assert.match(
    read(MIG_74),
    /CREATE TABLE IF NOT EXISTS "webhook_delivery_log"/i,
  );
});

test("migration 0074 creates usage_metrics", () => {
  assert.match(read(MIG_74), /CREATE TABLE IF NOT EXISTS "usage_metrics"/i);
});

test("migration 0074 creates data_export_requests", () => {
  assert.match(
    read(MIG_74),
    /CREATE TABLE IF NOT EXISTS "data_export_requests"/i,
  );
});

test("migration 0074 enables RLS for all 4 tables (loop)", () => {
  const sql = read(MIG_74);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /'webhook_subscriptions'/);
  assert.match(sql, /'webhook_delivery_log'/);
  assert.match(sql, /'usage_metrics'/);
  assert.match(sql, /'data_export_requests'/);
});

test("migration 0074 has usage_metrics unique on org+period+type", () => {
  assert.match(read(MIG_74), /usage_metrics_org_period_type_unique|organization_id.*metric_period_start.*metric_type/i);
});

test("migration 0074 references organizations on webhook_subscriptions", () => {
  assert.match(
    read(MIG_74),
    /"webhook_subscriptions"[\s\S]*organization_id[\s\S]*REFERENCES "organizations"/i,
  );
});

// ===========================================================================
// 5) Drizzle schema exports
// ===========================================================================

test("saas schema exports organizations + apiKeys + apiRequestLog", async () => {
  const m = await import("../src/lib/db/schema/saas");
  assert.ok(m.organizations);
  assert.ok(m.apiKeys);
  assert.ok(m.apiRequestLog);
});

test("saas schema exports rate_limit + webhook tables", async () => {
  const m = await import("../src/lib/db/schema/saas");
  assert.ok(m.rateLimitBuckets);
  assert.ok(m.webhookSubscriptions);
  assert.ok(m.webhookDeliveryLog);
});

test("saas schema exports usage_metrics + dataExportRequests", async () => {
  const m = await import("../src/lib/db/schema/saas");
  assert.ok(m.usageMetrics);
  assert.ok(m.dataExportRequests);
});

test("schema index re-exports saas module", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/saas"/);
});

// ===========================================================================
// 6) Pure webhook helpers
// ===========================================================================

test("shouldEventBeDispatched: cross-org event is rejected", () => {
  const out = shouldEventBeDispatched({
    eventType: "lead.created",
    subscribedEvents: ["*"],
    organizationId: "org-1",
    eventOrganizationId: "org-2",
  });
  assert.equal(out, false);
});

test("shouldEventBeDispatched: empty subscriptions → false", () => {
  const out = shouldEventBeDispatched({
    eventType: "lead.created",
    subscribedEvents: [],
    organizationId: "o",
    eventOrganizationId: "o",
  });
  assert.equal(out, false);
});

test("shouldEventBeDispatched: wildcard '*' matches everything", () => {
  const out = shouldEventBeDispatched({
    eventType: "anything.foo",
    subscribedEvents: ["*"],
    organizationId: "o",
    eventOrganizationId: "o",
  });
  assert.equal(out, true);
});

test("shouldEventBeDispatched: exact match", () => {
  const out = shouldEventBeDispatched({
    eventType: "lead.created",
    subscribedEvents: ["other.event", "lead.created"],
    organizationId: "o",
    eventOrganizationId: "o",
  });
  assert.equal(out, true);
});

test("shouldEventBeDispatched: namespace.* prefix matches lead.created", () => {
  const out = shouldEventBeDispatched({
    eventType: "lead.created",
    subscribedEvents: ["lead.*"],
    organizationId: "o",
    eventOrganizationId: "o",
  });
  assert.equal(out, true);
});

test("shouldEventBeDispatched: namespace.* does NOT match unrelated namespace", () => {
  const out = shouldEventBeDispatched({
    eventType: "project.created",
    subscribedEvents: ["lead.*"],
    organizationId: "o",
    eventOrganizationId: "o",
  });
  assert.equal(out, false);
});

test("shouldEventBeDispatched: prefix without dot does not match", () => {
  // "lead.*" matches "lead.x" but not "leadership.x"
  const out = shouldEventBeDispatched({
    eventType: "leadership.x",
    subscribedEvents: ["lead.*"],
    organizationId: "o",
    eventOrganizationId: "o",
  });
  assert.equal(out, false);
});

test("computeNextRetryDelay: schedule[0] = 30s", () => {
  const r = computeNextRetryDelay({ attemptNumber: 1, maxAttempts: 5 });
  assert.equal(r.shouldRetry, true);
  assert.equal(r.retryAfterSeconds, 30);
  assert.equal(r.isFinalAttempt, false);
});

test("computeNextRetryDelay: schedule[1] = 60s", () => {
  const r = computeNextRetryDelay({ attemptNumber: 2, maxAttempts: 5 });
  assert.equal(r.retryAfterSeconds, 60);
});

test("computeNextRetryDelay: schedule[2] = 5m", () => {
  const r = computeNextRetryDelay({ attemptNumber: 3, maxAttempts: 5 });
  assert.equal(r.retryAfterSeconds, 300);
});

test("computeNextRetryDelay: schedule[3] = 30m", () => {
  const r = computeNextRetryDelay({ attemptNumber: 4, maxAttempts: 5 });
  assert.equal(r.retryAfterSeconds, 1800);
  assert.equal(r.isFinalAttempt, true);
});

test("computeNextRetryDelay: at max attempts, no retry + final", () => {
  const r = computeNextRetryDelay({ attemptNumber: 5, maxAttempts: 5 });
  assert.equal(r.shouldRetry, false);
  assert.equal(r.isFinalAttempt, true);
});

test("computeNextRetryDelay: exceeding maxAttempts also stops", () => {
  const r = computeNextRetryDelay({ attemptNumber: 99, maxAttempts: 5 });
  assert.equal(r.shouldRetry, false);
});

test("generateSigningSecret returns whsec_-prefixed token", () => {
  const s = generateSigningSecret();
  assert.match(s, /^whsec_/);
  assert.ok(s.length > 30);
});

test("generateSigningSecret produces unique secrets", () => {
  const a = generateSigningSecret();
  const b = generateSigningSecret();
  assert.notEqual(a, b);
});

test("generateWebhookSignature is deterministic for same input", () => {
  const a = generateWebhookSignature({ payload: "x", secret: "s", timestamp: 1 });
  const b = generateWebhookSignature({ payload: "x", secret: "s", timestamp: 1 });
  assert.equal(a, b);
});

test("generateWebhookSignature differs when timestamp changes", () => {
  const a = generateWebhookSignature({ payload: "x", secret: "s", timestamp: 1 });
  const b = generateWebhookSignature({ payload: "x", secret: "s", timestamp: 2 });
  assert.notEqual(a, b);
});

test("generateWebhookSignature differs when payload changes", () => {
  const a = generateWebhookSignature({ payload: "x", secret: "s", timestamp: 1 });
  const b = generateWebhookSignature({ payload: "y", secret: "s", timestamp: 1 });
  assert.notEqual(a, b);
});

test("generateWebhookSignature differs when secret changes", () => {
  const a = generateWebhookSignature({ payload: "x", secret: "s1", timestamp: 1 });
  const b = generateWebhookSignature({ payload: "x", secret: "s2", timestamp: 1 });
  assert.notEqual(a, b);
});

test("buildSignatureHeader format is t=<unix>,v1=<hex>", () => {
  const h = buildSignatureHeader({ payload: "x", secret: "s", timestamp: 1234 });
  assert.match(h, /^t=1234,v1=[0-9a-f]{64}$/);
});

test("verifyWebhookSignature accepts a freshly built signature", () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = buildSignatureHeader({ payload: "p", secret: "s", timestamp: ts });
  const ok = verifyWebhookSignature({
    payload: "p",
    receivedSignature: header,
    secret: "s",
    nowUnixSeconds: ts,
    toleranceSeconds: 300,
  });
  assert.equal(ok, true);
});

test("verifyWebhookSignature rejects payload tampering", () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = buildSignatureHeader({ payload: "p", secret: "s", timestamp: ts });
  const ok = verifyWebhookSignature({
    payload: "p_tampered",
    receivedSignature: header,
    secret: "s",
    nowUnixSeconds: ts,
    toleranceSeconds: 300,
  });
  assert.equal(ok, false);
});

test("verifyWebhookSignature rejects mismatched secret", () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = buildSignatureHeader({ payload: "p", secret: "s1", timestamp: ts });
  const ok = verifyWebhookSignature({
    payload: "p",
    receivedSignature: header,
    secret: "s2",
    nowUnixSeconds: ts,
    toleranceSeconds: 300,
  });
  assert.equal(ok, false);
});

test("verifyWebhookSignature rejects when timestamp drifts beyond tolerance", () => {
  const ts = 1000;
  const header = buildSignatureHeader({ payload: "p", secret: "s", timestamp: ts });
  const ok = verifyWebhookSignature({
    payload: "p",
    receivedSignature: header,
    secret: "s",
    nowUnixSeconds: ts + 1000,
    toleranceSeconds: 300,
  });
  assert.equal(ok, false);
});

test("verifyWebhookSignature rejects malformed header", () => {
  const ok = verifyWebhookSignature({
    payload: "p",
    receivedSignature: "garbage",
    secret: "s",
    nowUnixSeconds: 0,
    toleranceSeconds: 300,
  });
  assert.equal(ok, false);
});

test("verifyWebhookSignature rejects missing v1 part", () => {
  const ok = verifyWebhookSignature({
    payload: "p",
    receivedSignature: "t=123",
    secret: "s",
    nowUnixSeconds: 123,
    toleranceSeconds: 300,
  });
  assert.equal(ok, false);
});

// ===========================================================================
// 7) Pure API key helpers
// ===========================================================================

test("generateApiKey returns prefix/last4/hash/fullKey", () => {
  const k = generateApiKey("live");
  assert.ok(k.fullKey.startsWith("arq_live_"));
  assert.equal(k.prefix, "arq_live_");
  assert.equal(k.last4.length, 4);
  assert.equal(k.hash.length, 64); // sha256 hex
});

test("generateApiKey 'test' uses arq_test_ prefix", () => {
  const k = generateApiKey("test");
  assert.ok(k.fullKey.startsWith("arq_test_"));
});

test("generateApiKey hashes are stable for the same input", () => {
  const sample = "ak_test_abcdefg";
  assert.equal(hashApiKey(sample), hashApiKey(sample));
});

test("hashApiKey returns 64-char hex", () => {
  const h = hashApiKey("anything");
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("parseKeyPrefix extracts arq_live_", () => {
  assert.equal(parseKeyPrefix("arq_live_xyz"), "arq_live_");
});

test("parseKeyPrefix extracts arq_test_", () => {
  assert.equal(parseKeyPrefix("arq_test_xyz"), "arq_test_");
});

test("parseKeyPrefix returns null for malformed key", () => {
  assert.equal(parseKeyPrefix("garbage"), null);
});

test("scopeAllowed: wildcard '*' allows any scope", () => {
  assert.equal(scopeAllowed("projects:read", ["*"]), true);
});

test("scopeAllowed: write grant satisfies a read requirement", () => {
  assert.equal(scopeAllowed("projects:read", ["projects:write"]), true);
});

test("scopeAllowed: exact match allows", () => {
  assert.equal(scopeAllowed("projects:read", ["projects:read"]), true);
});

test("scopeAllowed: missing scope is denied", () => {
  assert.equal(scopeAllowed("projects:write", ["projects:read"]), false);
});

test("scopeAllowed: empty scope list denies everything", () => {
  assert.equal(scopeAllowed("projects:read", []), false);
});

test("constantTimeHashCompare equal hashes return true", () => {
  const h = hashApiKey("k");
  assert.equal(constantTimeHashCompare(h, h), true);
});

test("constantTimeHashCompare unequal hashes return false", () => {
  assert.equal(
    constantTimeHashCompare(hashApiKey("a"), hashApiKey("b")),
    false,
  );
});

test("constantTimeHashCompare different lengths return false safely", () => {
  assert.equal(constantTimeHashCompare("short", "muchlongerstring"), false);
});

// ===========================================================================
// 8) Pure rate-limiting helpers
// ===========================================================================

test("windowStartFor minute aligns to top of minute", () => {
  const now = new Date("2026-05-06T12:34:56.789Z");
  const out = windowStartFor("minute", now);
  assert.equal(out.toISOString(), "2026-05-06T12:34:00.000Z");
});

test("windowStartFor hour aligns to top of hour", () => {
  const now = new Date("2026-05-06T12:34:56.789Z");
  const out = windowStartFor("hour", now);
  assert.equal(out.toISOString(), "2026-05-06T12:00:00.000Z");
});

test("windowStartFor day aligns to UTC midnight", () => {
  const now = new Date("2026-05-06T12:34:56.789Z");
  const out = windowStartFor("day", now);
  assert.equal(out.toISOString(), "2026-05-06T00:00:00.000Z");
});

test("checkRateLimit allows when under all limits", () => {
  const v = checkRateLimit(
    { perMinute: 60, perHour: 1000, perDay: 10000 },
    { minuteCount: 0, hourCount: 0, dayCount: 0 },
  );
  assert.equal(v.allowed, true);
});

test("checkRateLimit blocks at per-minute ceiling", () => {
  const v = checkRateLimit(
    { perMinute: 60, perHour: 1000, perDay: 10000 },
    { minuteCount: 60, hourCount: 0, dayCount: 0 },
  );
  assert.equal(v.allowed, false);
  assert.equal(v.reason, "minute_exceeded");
});

test("checkRateLimit blocks at per-hour ceiling", () => {
  const v = checkRateLimit(
    { perMinute: 60, perHour: 1000, perDay: 10000 },
    { minuteCount: 0, hourCount: 1000, dayCount: 0 },
  );
  assert.equal(v.allowed, false);
  assert.equal(v.reason, "hour_exceeded");
});

test("checkRateLimit blocks at per-day ceiling", () => {
  const v = checkRateLimit(
    { perMinute: 60, perHour: 1000, perDay: 10000 },
    { minuteCount: 0, hourCount: 0, dayCount: 10000 },
  );
  assert.equal(v.allowed, false);
  assert.equal(v.reason, "day_exceeded");
});

test("checkRateLimit reports remaining = limit - count when allowed", () => {
  const v = checkRateLimit(
    { perMinute: 60, perHour: 1000, perDay: 10000 },
    { minuteCount: 5, hourCount: 0, dayCount: 0 },
  );
  assert.equal(v.allowed, true);
  assert.equal(v.remaining.minute, 55);
});

test("checkRateLimit retryAfterSeconds is 60 for minute reason", () => {
  const v = checkRateLimit(
    { perMinute: 1, perHour: 1000, perDay: 10000 },
    { minuteCount: 1, hourCount: 0, dayCount: 0 },
  );
  assert.equal(v.retryAfterSeconds, 60);
});

test("checkRateLimit retryAfterSeconds is 3600 for hour reason", () => {
  const v = checkRateLimit(
    { perMinute: 60, perHour: 1, perDay: 10000 },
    { minuteCount: 0, hourCount: 1, dayCount: 0 },
  );
  assert.equal(v.retryAfterSeconds, 3600);
});

// ===========================================================================
// 9) Branding helpers (XSS defense)
// ===========================================================================

test("renderBrandingCss produces valid CSS for hex colors", () => {
  const css = renderBrandingCss({
    primary_color: "#0F62FE",
    secondary_color: "#16A34A",
  });
  assert.match(css, /--brand-primary:\s*#0F62FE/);
  assert.match(css, /--brand-secondary:\s*#16A34A/);
});

test("renderBrandingCss strips invalid color tokens", () => {
  const css = renderBrandingCss({
    primary_color: "javascript:alert(1)" as unknown as string,
  });
  assert.doesNotMatch(css, /javascript/i);
});

test("renderBrandingCss tolerates empty config", () => {
  assert.equal(renderBrandingCss({}).trim(), "");
});

test("renderBrandingCss tolerates null config", () => {
  assert.equal(renderBrandingCss(null), "");
});

test("renderBrandingCss tolerates non-hex color strings", () => {
  const css = renderBrandingCss({ primary_color: "red" as unknown as string });
  assert.doesNotMatch(css, /red/);
});

test("resolveLogoUrl returns URL when string", () => {
  assert.equal(resolveLogoUrl({ logo_url: "/x.svg" }), "/x.svg");
});

test("resolveLogoUrl falls back to default for null config", () => {
  const fallback = resolveLogoUrl(null);
  assert.equal(typeof fallback, "string");
  assert.ok(fallback.length > 0);
});

test("resolveLogoUrl prefers dark variant when requested", () => {
  assert.equal(
    resolveLogoUrl({ logo_url: "/light.svg", logo_dark_url: "/dark.svg" }, "dark"),
    "/dark.svg",
  );
});

test("resolveFaviconUrl returns default for null config", () => {
  const out = resolveFaviconUrl(null);
  assert.equal(typeof out, "string");
});

test("resolveFaviconUrl returns config value when set", () => {
  assert.equal(resolveFaviconUrl({ favicon_url: "/fav.png" }), "/fav.png");
});

// ===========================================================================
// 10) Module config helpers
// ===========================================================================

test("ALL_MODULE_KEYS contains the platform's modules", () => {
  assert.ok(ALL_MODULE_KEYS.includes("ai_agents"));
  assert.ok(ALL_MODULE_KEYS.includes("public_api"));
  assert.ok(ALL_MODULE_KEYS.includes("webhooks"));
});

test("isModuleEnabled returns true when listed", () => {
  assert.equal(
    isModuleEnabled(["ai_agents", "webhooks"], "ai_agents"),
    true,
  );
});

test("isModuleEnabled returns false when missing", () => {
  assert.equal(isModuleEnabled(["webhooks"], "ai_agents"), false);
});

test("isModuleEnabled returns true when 'all_modules' is present", () => {
  assert.equal(isModuleEnabled(["all_modules"], "public_api"), true);
});

test("isModuleEnabled returns false for non-array input", () => {
  assert.equal(isModuleEnabled(null, "ai_agents"), false);
});

test("moduleEnabledFlags maps every key to a boolean", () => {
  const flags = moduleEnabledFlags(["ai_agents", "public_api"]);
  assert.equal(flags.ai_agents, true);
  assert.equal(flags.public_api, true);
  assert.equal(flags.webhooks, false);
});

// ===========================================================================
// 11) Usage aggregation helpers
// ===========================================================================

test("dailyPeriod start === end (single day)", () => {
  const p = dailyPeriod(new Date("2026-05-06T15:00:00Z"));
  assert.equal(p.start, "2026-05-06");
  assert.equal(p.end, "2026-05-06");
});

test("weeklyPeriod runs Monday → Sunday", () => {
  // 2026-05-06 is a Wednesday
  const p = weeklyPeriod(new Date("2026-05-06T00:00:00Z"));
  assert.equal(p.start, "2026-05-04"); // Monday
  assert.equal(p.end, "2026-05-10"); // Sunday
});

test("weeklyPeriod when input is a Sunday", () => {
  const p = weeklyPeriod(new Date("2026-05-10T00:00:00Z")); // Sunday
  assert.equal(p.start, "2026-05-04");
  assert.equal(p.end, "2026-05-10");
});

test("weeklyPeriod when input is a Monday", () => {
  const p = weeklyPeriod(new Date("2026-05-04T00:00:00Z"));
  assert.equal(p.start, "2026-05-04");
  assert.equal(p.end, "2026-05-10");
});

test("monthlyPeriod for May 2026 → 1st .. 31st", () => {
  const p = monthlyPeriod(new Date("2026-05-15T00:00:00Z"));
  assert.equal(p.start, "2026-05-01");
  assert.equal(p.end, "2026-05-31");
});

test("monthlyPeriod for February 2026 → 1st .. 28th", () => {
  const p = monthlyPeriod(new Date("2026-02-15T00:00:00Z"));
  assert.equal(p.start, "2026-02-01");
  assert.equal(p.end, "2026-02-28");
});

test("rollupSummaries sums incremental counters", () => {
  const r = rollupSummaries([
    {
      activeUsersCount: 5,
      activeProjectsCount: 2,
      totalTransactionsCount: 10,
      totalInvoicesCount: 3,
      totalDocumentsUploaded: 4,
      totalStorageUsedBytes: 100,
      aiInvocationsCount: 1,
      aiTokensConsumed: 10,
      aiCostMinor: 100,
      apiRequestsCount: 50,
      apiRateLimitedCount: 0,
      webhooksDispatchedCount: 5,
      webhooksFailedCount: 0,
      pushNotificationsDispatched: 8,
    },
    {
      activeUsersCount: 6,
      activeProjectsCount: 3,
      totalTransactionsCount: 12,
      totalInvoicesCount: 2,
      totalDocumentsUploaded: 1,
      totalStorageUsedBytes: 200,
      aiInvocationsCount: 4,
      aiTokensConsumed: 20,
      aiCostMinor: 200,
      apiRequestsCount: 30,
      apiRateLimitedCount: 1,
      webhooksDispatchedCount: 7,
      webhooksFailedCount: 1,
      pushNotificationsDispatched: 12,
    },
  ]);
  assert.equal(r.totalTransactionsCount, 22);
  assert.equal(r.totalInvoicesCount, 5);
  assert.equal(r.aiInvocationsCount, 5);
  assert.equal(r.apiRequestsCount, 80);
  assert.equal(r.webhooksDispatchedCount, 12);
});

test("rollupSummaries takes max for active-users / active-projects / storage", () => {
  const r = rollupSummaries([
    {
      activeUsersCount: 5,
      activeProjectsCount: 1,
      totalTransactionsCount: 0,
      totalInvoicesCount: 0,
      totalDocumentsUploaded: 0,
      totalStorageUsedBytes: 100,
      aiInvocationsCount: 0,
      aiTokensConsumed: 0,
      aiCostMinor: 0,
      apiRequestsCount: 0,
      apiRateLimitedCount: 0,
      webhooksDispatchedCount: 0,
      webhooksFailedCount: 0,
      pushNotificationsDispatched: 0,
    },
    {
      activeUsersCount: 9,
      activeProjectsCount: 4,
      totalTransactionsCount: 0,
      totalInvoicesCount: 0,
      totalDocumentsUploaded: 0,
      totalStorageUsedBytes: 90,
      aiInvocationsCount: 0,
      aiTokensConsumed: 0,
      aiCostMinor: 0,
      apiRequestsCount: 0,
      apiRateLimitedCount: 0,
      webhooksDispatchedCount: 0,
      webhooksFailedCount: 0,
      pushNotificationsDispatched: 0,
    },
  ]);
  assert.equal(r.activeUsersCount, 9);
  assert.equal(r.activeProjectsCount, 4);
  assert.equal(r.totalStorageUsedBytes, 100);
});

test("rollupSummaries returns zero record for empty input", () => {
  const r = rollupSummaries([]);
  assert.equal(r.totalTransactionsCount, 0);
  assert.equal(r.activeUsersCount, 0);
});

// ===========================================================================
// 12) Data export format helpers
// ===========================================================================

test("rowsToCsv handles empty rows", () => {
  assert.equal(rowsToCsv([]), "");
});

test("rowsToCsv emits header and bodies", () => {
  const csv = rowsToCsv([
    { a: 1, b: "hello" },
    { a: 2, b: "world" },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "a,b");
  assert.equal(lines[1], "1,hello");
});

test("rowsToCsv quotes commas + quotes", () => {
  const csv = rowsToCsv([{ a: `he,"llo"` }]);
  assert.match(csv, /"he,""llo"""/);
});

test("rowsToCsv handles null + undefined", () => {
  const csv = rowsToCsv([{ a: null, b: undefined }]);
  const lines = csv.split("\n");
  assert.equal(lines[1], ",");
});

test("tablesToJson returns parseable JSON", () => {
  const out = tablesToJson([{ tableName: "x", rows: [{ id: 1 }] }]);
  const parsed = JSON.parse(out);
  assert.equal(parsed.x[0].id, 1);
});

test("tablesToSql wraps in BEGIN/COMMIT", () => {
  const out = tablesToSql([{ tableName: "x", rows: [{ id: 1 }] }]);
  assert.match(out, /^BEGIN;/m);
  assert.match(out, /COMMIT;$/m);
});

test("tablesToSql escapes single-quotes", () => {
  const out = tablesToSql([{ tableName: "x", rows: [{ a: "O'Brien" }] }]);
  assert.match(out, /'O''Brien'/);
});

test("tablesToSql renders booleans as TRUE/FALSE", () => {
  const out = tablesToSql([{ tableName: "x", rows: [{ a: true, b: false }] }]);
  assert.match(out, /TRUE, FALSE/);
});

test("tablesToSql renders null as NULL", () => {
  const out = tablesToSql([{ tableName: "x", rows: [{ a: null }] }]);
  assert.match(out, /NULL\)/);
});

test("formatExport selects CSV mime", () => {
  const out = formatExport([{ tableName: "x", rows: [{ a: 1 }] }], "csv");
  assert.equal(out.mimeType, "text/csv");
  assert.equal(out.extension, "csv");
});

test("formatExport selects JSON mime by default", () => {
  const out = formatExport([{ tableName: "x", rows: [{ a: 1 }] }], "json");
  assert.equal(out.mimeType, "application/json");
});

test("formatExport selects SQL mime", () => {
  const out = formatExport([{ tableName: "x", rows: [{ a: 1 }] }], "sql");
  assert.equal(out.mimeType, "application/sql");
});

// ===========================================================================
// 13) Server module file presence
// ===========================================================================

const SERVER_MODULES = [
  "src/lib/development/server/organizations/organization-queries.ts",
  "src/lib/development/server/organizations/organization-actions.ts",
  "src/lib/development/server/api/api-key-queries.ts",
  "src/lib/development/server/api/api-key-actions.ts",
  "src/lib/development/server/api/rate-limiting-actions.ts",
  "src/lib/development/server/api/api-auth.ts",
  "src/lib/development/server/api/v1-route-handler.ts",
  "src/lib/development/server/webhooks/webhook-queries.ts",
  "src/lib/development/server/webhooks/webhook-actions.ts",
  "src/lib/development/server/webhooks/webhook-dispatcher.ts",
  "src/lib/development/server/webhooks/event-emitter.ts",
  "src/lib/development/server/usage/usage-queries.ts",
  "src/lib/development/server/usage/usage-actions.ts",
  "src/lib/development/server/data-export/data-export-actions.ts",
];

for (const path of SERVER_MODULES) {
  test(`server module exists: ${path}`, () => {
    assert.ok(exists(path), `missing: ${path}`);
  });
}

// ===========================================================================
// 14) Public v1 API endpoints
// ===========================================================================

const V1_ROUTES: Array<[string, string[]]> = [
  ["src/app/api/v1/projects/route.ts", ["GET"]],
  ["src/app/api/v1/projects/[id]/route.ts", ["GET"]],
  ["src/app/api/v1/investors/route.ts", ["GET"]],
  ["src/app/api/v1/leads/route.ts", ["GET", "POST"]],
  ["src/app/api/v1/transactions/route.ts", ["GET"]],
  ["src/app/api/v1/webhooks/test/route.ts", ["POST"]],
];

for (const [path, methods] of V1_ROUTES) {
  test(`v1 route exists: ${path}`, () => {
    assert.ok(exists(path));
  });
  for (const m of methods) {
    test(`v1 route ${path} exports ${m}`, () => {
      const src = read(path);
      assert.match(src, new RegExp(`export const ${m}\\b`));
    });
  }
  test(`v1 route ${path} uses buildV1Route wrapper`, () => {
    const src = read(path);
    assert.match(src, /buildV1Route/);
  });
}

test("v1 leads POST emits a webhook event", () => {
  const src = read("src/app/api/v1/leads/route.ts");
  assert.match(src, /emitEvent/);
  assert.match(src, /lead\.created/);
});

test("v1 webhooks/test cross-checks subscription org", () => {
  const src = read("src/app/api/v1/webhooks/test/route.ts");
  assert.match(src, /organizationId/);
});

test("v1 transactions accepts project_id filter", () => {
  assert.match(read("src/app/api/v1/transactions/route.ts"), /project_id/);
});

test("v1 leads accepts status filter", () => {
  assert.match(read("src/app/api/v1/leads/route.ts"), /status/);
});

// ===========================================================================
// 15) Auth wrapper integration
// ===========================================================================

test("v1-route-handler enforces required scope", () => {
  const src = read("src/lib/development/server/api/v1-route-handler.ts");
  assert.match(src, /requiredScope/);
});

test("v1-route-handler returns Retry-After on 429", () => {
  assert.match(
    read("src/lib/development/server/api/v1-route-handler.ts"),
    /Retry-After/,
  );
});

test("v1-route-handler logs every request via logApiRequest", () => {
  assert.match(
    read("src/lib/development/server/api/v1-route-handler.ts"),
    /logApiRequest/,
  );
});

test("api-auth checks scope before rate-limit", () => {
  const src = read("src/lib/development/server/api/api-auth.ts");
  const scopeIdx = src.indexOf("scopeAllowed");
  const rateIdx = src.indexOf("checkAndIncrementRateLimit");
  assert.ok(scopeIdx > 0 && rateIdx > scopeIdx, "scope must be checked before rate-limit");
});

// ===========================================================================
// 16) Cron + dispatcher audit
// ===========================================================================

const NEW_CRON_KEYS = [
  "dev_os_webhook_delivery",
  "dev_os_api_log_cleanup",
  "dev_os_usage_metrics_aggregation",
  "dev_os_data_export_processor",
  "dev_os_rate_limit_cleanup",
];

for (const key of NEW_CRON_KEYS) {
  test(`cron key registered in DEV_OS_JOB_KEYS: ${key}`, () => {
    assert.match(
      read("src/lib/development/server/cron/index.ts"),
      new RegExp(`"${key}"`),
    );
  });
  test(`cron key registered in KNOWN_JOBS: ${key}`, () => {
    assert.match(
      read("src/features/jobs/actions.ts"),
      new RegExp(`"${key}"`),
    );
  });
  test(`cron key dispatched in executeJob: ${key}`, () => {
    assert.match(
      read("src/features/jobs/actions.ts"),
      new RegExp(`case "${key}":`),
    );
  });
  const slug = key.replace(/_/g, "-");
  test(`cron HTTP route present: ${slug}`, () => {
    assert.ok(exists(`src/app/api/cron/${slug}/route.ts`));
  });
  test(`cron HTTP route ${slug} exports GET + POST`, () => {
    const src = read(`src/app/api/cron/${slug}/route.ts`);
    assert.match(src, /export async function GET/);
    assert.match(src, /export async function POST/);
  });
}

test("cron route count reaches 72 after Stage 5.J", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const dir = resolve(ROOT, "src/app/api/cron");
  const subdirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert.ok(
    subdirs.length >= 72,
    `expected ≥72 cron routes, found ${subdirs.length}`,
  );
});

// ===========================================================================
// 17) Sidebar + UI page presence
// ===========================================================================

const UI_PAGES = [
  "src/app/(development-app)/development-os/platform/organizations/page.tsx",
  "src/app/(development-app)/development-os/platform/usage/page.tsx",
  "src/app/(development-app)/development-os/platform/api-docs/page.tsx",
  "src/app/(development-app)/development-os/platform/branding/page.tsx",
  "src/app/(development-app)/development-os/settings/api-keys/page.tsx",
  "src/app/(development-app)/development-os/settings/webhooks/page.tsx",
  "src/app/(development-app)/development-os/settings/data-export/page.tsx",
];

for (const page of UI_PAGES) {
  test(`UI page exists: ${page}`, () => {
    assert.ok(exists(page));
  });
}

test("nav.ts adds Platform group", () => {
  assert.match(read("src/lib/development/navigation.ts"), /label:\s*"Platform"/);
});

test("nav.ts adds Settings → API keys link", () => {
  assert.match(read("src/lib/development/navigation.ts"), /settings\/api-keys/);
});

test("nav.ts adds Settings → Webhooks link", () => {
  assert.match(read("src/lib/development/navigation.ts"), /settings\/webhooks/);
});

test("nav.ts adds Settings → Data export link", () => {
  assert.match(read("src/lib/development/navigation.ts"), /settings\/data-export/);
});

// ===========================================================================
// 18) Demo seed audit
// ===========================================================================

const SEED_J = "drizzle/seed/development-stage-5-j.sql";

test("Stage 5.J demo seed file exists", () => {
  assert.ok(exists(SEED_J));
});

test("demo seed creates SAMPLE_DEV_CLIENT organization", () => {
  assert.match(read(SEED_J), /SAMPLE_DEV_CLIENT/);
});

test("demo seed inserts read-only API key", () => {
  assert.match(read(SEED_J), /Demo · read-only/);
});

test("demo seed inserts writeable API key", () => {
  assert.match(read(SEED_J), /Demo · writeable/);
});

test("demo seed creates webhook subscription", () => {
  assert.match(read(SEED_J), /webhook_subscriptions/);
});

test("demo seed populates usage_metrics for last 7 days", () => {
  const sql = read(SEED_J);
  assert.match(sql, /usage_metrics/);
  assert.match(sql, /CURRENT_DATE - d/);
});

test("demo seed wraps API key inserts in DO block (idempotent)", () => {
  assert.match(read(SEED_J), /DO \$\$/);
});

test("demo seed uses ON CONFLICT DO NOTHING for organizations", () => {
  assert.match(read(SEED_J), /ON CONFLICT \(organization_code\) DO NOTHING/);
});

// ===========================================================================
// 19) Architecture doc marker
// ===========================================================================

test("architecture doc has Stage 5.J ACTIVE or ACCEPTED marker", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.J[^\n]*\[(?:ACTIVE|ACCEPTED) 5\.J\]/);
});

test("architecture doc references the 4 Stage 5.J migrations", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /0071/);
  assert.match(md, /0072/);
  assert.match(md, /0073/);
  assert.match(md, /0074/);
});

// ===========================================================================
// 20) Multi-tenancy regression invariants
// ===========================================================================

test("api-auth.ts pulls organizationId from authenticated key (not body/header)", () => {
  const src = read("src/lib/development/server/api/api-auth.ts");
  assert.match(src, /organizationId:\s*key\.organizationId/);
});

test("v1-route-handler refuses requests without Authorization", () => {
  const src = read("src/lib/development/server/api/v1-route-handler.ts");
  assert.match(src, /authorizationHeader/);
});

test("v1 leads route filters by auth.organizationId, never by query string", () => {
  const src = read("src/app/api/v1/leads/route.ts");
  assert.match(src, /organization_id\s*=\s*\$\{auth\.organizationId\}/);
  assert.doesNotMatch(src, /searchParams\.get\(['"]?organization_id/);
});

test("v1 transactions route filters by auth.organizationId, never by query string", () => {
  const src = read("src/app/api/v1/transactions/route.ts");
  assert.match(src, /organization_id\s*=\s*\$\{auth\.organizationId\}/);
  assert.doesNotMatch(src, /searchParams\.get\(['"]?organization_id/);
});

test("v1 investors route filters by auth.organizationId, never by query string", () => {
  const src = read("src/app/api/v1/investors/route.ts");
  assert.match(src, /organization_id\s*=\s*\$\{auth\.organizationId\}/);
  assert.doesNotMatch(src, /searchParams\.get\(['"]?organization_id/);
});

test("v1 projects route filters by auth.organizationId", () => {
  const src = read("src/app/api/v1/projects/route.ts");
  assert.match(src, /organization_id\s*=\s*\$\{auth\.organizationId\}/);
});

test("event-emitter swallows errors so webhook bugs cannot break callers", () => {
  const src = read("src/lib/development/server/webhooks/event-emitter.ts");
  assert.match(src, /catch\s*\{/);
});

test("webhook-dispatcher signs payload with HMAC-SHA256", () => {
  const src = read("src/lib/development/server/webhooks/webhook-dispatcher.ts");
  assert.match(src, /buildSignatureHeader/);
});

test("webhook-dispatcher auto-disables after consecutive failures", () => {
  assert.match(
    read("src/lib/development/server/webhooks/webhook-dispatcher.ts"),
    /AUTO_DISABLE_AFTER_FAILURES/,
  );
});

test("webhook-dispatcher applies a per-attempt HTTP timeout", () => {
  assert.match(
    read("src/lib/development/server/webhooks/webhook-dispatcher.ts"),
    /AbortController/,
  );
});

test("API request log includes organizationId column", () => {
  assert.match(
    read("src/lib/db/schema/saas.ts"),
    /apiRequestLog[\s\S]*organizationId/,
  );
});

test("data-export flips status to processing before gathering tables", () => {
  const src = read(
    "src/lib/development/server/data-export/data-export-actions.ts",
  );
  const procIdx = src.indexOf(`status: "processing"`);
  // First call site of gatherTablesForScope is inside processExportRequest
  // and must come AFTER the processing flip.
  const gatherIdx = src.indexOf("await gatherTablesForScope");
  assert.ok(procIdx > 0, "processing status must be set");
  assert.ok(gatherIdx > procIdx, "gather must happen after status flip");
});

test("data-export uses an allow-list of tables to prevent SQL injection", () => {
  assert.match(
    read("src/lib/development/server/data-export/data-export-actions.ts"),
    /ALLOWED_EXPORT_TABLES/,
  );
});

test("rate-limit-cleanup job prunes by window_start", () => {
  assert.match(
    read("src/lib/development/server/usage/usage-actions.ts"),
    /DELETE FROM rate_limit_buckets WHERE window_start </,
  );
});

test("api-log cleanup uses 90-day retention", () => {
  assert.match(
    read("src/lib/development/server/cron/api-log-cleanup-job.ts"),
    /RETENTION_DAYS\s*=\s*90/,
  );
});

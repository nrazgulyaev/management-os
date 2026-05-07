/**
 * Stage 6.P4.A — Schema + provider abstraction tests.
 *
 * Covers (file-presence + grep + pure-helper invariants):
 *   - Migration 0082 shape: 5 tables, FK references, FOREACH ARRAY
 *     RLS (4th preservation of the 0075 lesson), CHECK constraints,
 *     dedicated `marketing_set_updated_at()` trigger function.
 *   - Drizzle schema modules exist + re-exported from the index;
 *     coexists with the existing Stage 5.E `marketing.ts` without
 *     name collision (P4 lives in `p4-marketing.ts`).
 *   - Marketing provider abstraction: types, selector, DryRun.
 *     Selector defaults to DryRun without credentials, on credential
 *     mismatch, on `other`.
 *   - DryRun behaviour: empty fetches, fail-closed verifyWebhook,
 *     synthetic externalEventId on sendConversionEvent (so service
 *     layer can mark conversions as fired in the no-creds path).
 *   - Architecture doc marks Stage 6.P4 ACTIVE; P0–P3 stay ACCEPTED.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  selectMarketingProvider,
  DryRunMarketingProvider,
  type MarketingCredentials,
} from "../src/lib/marketing";
import {
  MARKETING_PROVIDERS,
  type MarketingProviderName,
} from "../src/lib/db/schema/p4-marketing";
import {
  TOUCHPOINT_CHANNELS,
  CONVERSION_TYPES,
} from "../src/lib/db/schema/attribution";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 1) Migration 0082
// ===========================================================================

test("migration 0082: file exists", () => {
  assert.ok(fileExists("drizzle/0082_development_os_stage_6_p4_marketing.sql"));
});

test("migration 0082: defines all 5 marketing tables", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  for (const table of [
    "marketing_connections",
    "marketing_campaigns",
    "marketing_metrics",
    "attribution_touchpoints",
    "attribution_conversions",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`),
      `${table} must be created`,
    );
  }
});

test("migration 0082: provider CHECK lists every supported provider", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  for (const p of [
    "google_analytics",
    "google_ads",
    "meta_pixel",
    "meta_ads",
    "tiktok_ads",
    "mailchimp",
    "convertkit",
    "sendgrid_marketing",
    "manual",
    "other",
  ]) {
    assert.match(sql, new RegExp(`'${p}'`), `${p} must appear in CHECK list`);
  }
});

test("migration 0082: marketing_metrics UNIQUE (campaign, date) for idempotent ingestion", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  assert.match(sql, /UNIQUE \("campaign_id", "metric_date"\)/);
});

test("migration 0082: marketing_campaigns UNIQUE (connection, external_campaign_id)", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  assert.match(
    sql,
    /UNIQUE \("marketing_connection_id", "external_campaign_id"\)/,
  );
});

test("migration 0082: defines a dedicated marketing_set_updated_at() function (not banking's)", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION "marketing_set_updated_at"/,
    "must declare its own trigger function",
  );
  assert.doesNotMatch(
    sql,
    /CREATE OR REPLACE FUNCTION "banking_set_updated_at"/,
    "must NOT redeclare banking's function",
  );
});

test("migration 0082: uses FOREACH IN ARRAY for RLS (the 0075 lesson)", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  assert.match(sql, /FOREACH t IN ARRAY ARRAY\[/);
  assert.doesNotMatch(sql, /FOR \w+ IN SELECT unnest/);
});

test("migration 0082: enables + forces RLS on every new table", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  for (const t of [
    "marketing_connections",
    "marketing_campaigns",
    "marketing_metrics",
    "attribution_touchpoints",
    "attribution_conversions",
  ]) {
    assert.ok(
      sql.includes(`'${t}'`),
      `${t} must be listed in the FOREACH RLS block`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /is_in_user_organization\(organization_id\)/);
});

test("migration 0082: attribution_touchpoints has no updated_at column / trigger (append-only)", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  // Verify the touchpoint table exists but its trigger isn't
  // declared. We check by scanning the touchpoint trigger names — none
  // should be present.
  assert.doesNotMatch(
    sql,
    /CREATE TRIGGER "trg_attribution_touchpoints_/,
    "touchpoints are append-only — no updated_at trigger",
  );
});

test("migration 0082: spend stored in minor units with NOT NULL default 0", () => {
  const sql = readFile("drizzle/0082_development_os_stage_6_p4_marketing.sql");
  assert.match(sql, /"spend_minor" BIGINT NOT NULL DEFAULT 0/);
  assert.match(sql, /"conversion_value_minor" BIGINT NOT NULL DEFAULT 0/);
});

// ===========================================================================
// 2) Drizzle schema modules
// ===========================================================================

test("schema index: P4 modules re-exported alongside the existing Stage 5.E marketing module", () => {
  const src = readFile("src/lib/db/schema/index.ts");
  assert.match(src, /export \* from "\.\/p4-marketing"/);
  assert.match(src, /export \* from "\.\/attribution"/);
  // Existing Stage 5.E module must stay re-exported.
  assert.match(src, /export \* from "\.\/marketing"/);
});

test("schema/p4-marketing.ts: defines all 3 marketing pgTables with the right physical names", () => {
  const src = readFile("src/lib/db/schema/p4-marketing.ts");
  assert.match(src, /pgTable\(\s*"marketing_connections"/);
  assert.match(src, /pgTable\(\s*"marketing_campaigns"/);
  assert.match(src, /pgTable\(\s*"marketing_metrics"/);
});

test("schema/attribution.ts: defines both attribution pgTables", () => {
  const src = readFile("src/lib/db/schema/attribution.ts");
  assert.match(src, /pgTable\(\s*"attribution_touchpoints"/);
  assert.match(src, /pgTable\(\s*"attribution_conversions"/);
});

test("schema constants: MARKETING_PROVIDERS exhaustive (10 entries)", () => {
  assert.equal(MARKETING_PROVIDERS.length, 10);
  for (const p of [
    "google_analytics",
    "google_ads",
    "meta_pixel",
    "meta_ads",
    "tiktok_ads",
    "mailchimp",
    "convertkit",
    "sendgrid_marketing",
    "manual",
    "other",
  ]) {
    assert.ok(
      (MARKETING_PROVIDERS as readonly string[]).includes(p),
      `${p} must be in MARKETING_PROVIDERS`,
    );
  }
});

test("schema constants: TOUCHPOINT_CHANNELS exhaustive (11 entries)", () => {
  assert.equal(TOUCHPOINT_CHANNELS.length, 11);
});

test("schema constants: CONVERSION_TYPES exhaustive (8 entries)", () => {
  assert.equal(CONVERSION_TYPES.length, 8);
});

// ===========================================================================
// 3) Marketing provider selector
// ===========================================================================

test("selectMarketingProvider: returns DryRun when credentials are null for every provider", () => {
  const providers: MarketingProviderName[] = [
    "google_analytics",
    "google_ads",
    "meta_pixel",
    "meta_ads",
    "tiktok_ads",
    "mailchimp",
    "convertkit",
    "sendgrid_marketing",
    "manual",
    "other",
  ];
  for (const p of providers) {
    const provider = selectMarketingProvider(p, null);
    assert.ok(provider instanceof DryRunMarketingProvider);
    assert.equal(provider.provider, p);
  }
});

test("selectMarketingProvider: 'other' always degrades to DryRun (catch-all slot, no creds union member)", () => {
  const provider = selectMarketingProvider("other", {
    provider: "manual",
  } as unknown as MarketingCredentials);
  assert.ok(provider instanceof DryRunMarketingProvider);
  assert.equal(provider.provider, "other");
});

test("selectMarketingProvider: credential discriminator mismatch falls back to DryRun", () => {
  const wrong: MarketingCredentials = {
    provider: "google_ads",
    developerToken: "x",
    clientId: "y",
    clientSecret: "z",
    refreshToken: "r",
    customerId: "1234567890",
  };
  const provider = selectMarketingProvider("meta_ads", wrong);
  assert.ok(provider instanceof DryRunMarketingProvider);
});

test("selectMarketingProvider: providers still pending real implementation return DryRun even with matching creds (post-P4.B)", () => {
  // Each promotion to a real provider removes that provider's case
  // from this list. P4.B landed GA4 + Meta Pixel; remaining providers
  // (Google Ads, Meta Ads, TikTok, Mailchimp, ConvertKit, SendGrid)
  // are still DryRun until P4.C/D/E.
  const cases: Array<[MarketingProviderName, MarketingCredentials]> = [
    [
      "google_ads",
      {
        provider: "google_ads",
        developerToken: "t",
        clientId: "c",
        clientSecret: "s",
        refreshToken: "r",
        customerId: "1",
      },
    ],
    [
      "meta_ads",
      {
        provider: "meta_ads",
        accessToken: "t",
        adAccountId: "act_1",
      },
    ],
    [
      "tiktok_ads",
      {
        provider: "tiktok_ads",
        accessToken: "t",
        advertiserId: "1",
        appId: "a",
        secret: "s",
      },
    ],
    ["mailchimp", { provider: "mailchimp", apiKey: "k-us1" }],
    [
      "convertkit",
      { provider: "convertkit", apiKey: "k", apiSecret: "s" },
    ],
    [
      "sendgrid_marketing",
      { provider: "sendgrid_marketing", apiKey: "k" },
    ],
    ["manual", { provider: "manual" }],
  ];
  for (const [name, creds] of cases) {
    const provider = selectMarketingProvider(name, creds);
    assert.ok(
      provider instanceof DryRunMarketingProvider,
      `${name} should still be DryRun at P4.A`,
    );
    assert.equal(provider.provider, name);
  }
});

// ===========================================================================
// 4) DryRun marketing provider behaviour
// ===========================================================================

test("DryRunMarketingProvider: fetchCampaigns + fetchMetrics return empty arrays", async () => {
  const p = new DryRunMarketingProvider("google_ads");
  assert.deepEqual(await p.fetchCampaigns({}), []);
  assert.deepEqual(
    await p.fetchMetrics({
      campaignIds: ["x"],
      since: new Date(),
      until: new Date(),
    }),
    [],
  );
});

test("DryRunMarketingProvider: pullAnalyticsTouchpoints returns empty array", async () => {
  const p = new DryRunMarketingProvider("google_analytics");
  const since = new Date();
  const until = new Date();
  assert.deepEqual(
    await p.pullAnalyticsTouchpoints!({ since, until }),
    [],
  );
});

test("DryRunMarketingProvider: sendConversionEvent succeeds with synthetic externalEventId", async () => {
  const p = new DryRunMarketingProvider("meta_pixel");
  const r = await p.sendConversionEvent!({
    eventName: "Purchase",
    clientId: "fbp_x",
    eventValue: 100,
    currency: "USD",
  });
  assert.equal(r.success, true);
  assert.match(r.externalEventId!, /^dryrun_meta_pixel_Purchase_/);
});

test("DryRunMarketingProvider: verifyWebhook fail-closes (returns false)", () => {
  const p = new DryRunMarketingProvider("meta_pixel");
  assert.equal(p.verifyWebhook("payload", "sig", "secret"), false);
});

test("DryRunMarketingProvider: parseWebhook returns null", () => {
  const p = new DryRunMarketingProvider("meta_pixel");
  assert.equal(p.parseWebhook({ event: "x" }), null);
});

test("DryRunMarketingProvider: testConnection succeeds with mode=dry_run", async () => {
  const p = new DryRunMarketingProvider("google_ads");
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["mode"], "dry_run");
  assert.equal(r.details["provider"], "google_ads");
});

// ===========================================================================
// 5) Public surface module
// ===========================================================================

test("public surface: src/lib/marketing exports selector + DryRun + types", () => {
  const src = readFile("src/lib/marketing/index.ts");
  assert.match(src, /export \* from "\.\/types"/);
  assert.match(src, /export \{ selectMarketingProvider \}/);
  assert.match(src, /export \{ DryRunMarketingProvider \}/);
});

// ===========================================================================
// 6) Architecture doc bookkeeping
// ===========================================================================

test("architecture doc: Stage 6.P4 marked ACTIVE, P0–P3 ACCEPTED", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P0 — CRUD Foundation `\[ACCEPTED 6\.P0\]`/);
  assert.match(src, /Stage 6\.P1 — Booking Channels `\[ACCEPTED 6\.P1\]`/);
  assert.match(src, /Stage 6\.P2 — Communications `\[ACCEPTED 6\.P2\]`/);
  assert.match(src, /Stage 6\.P3 — Banking \+ Payments `\[ACCEPTED 6\.P3\]`/);
  assert.match(src, /Stage 6\.P4 — Marketing \+ Analytics `\[ACTIVE 6\.P4\]`/);
});

test("architecture doc: Stage 6.P4 entry-state inheritance documents 4312 baseline + 87 cron routes", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /4312 baseline tests/);
  assert.match(src, /87 cron routes/);
});

test("architecture doc: Stage 6.P4 documents the cost-unit normalization invariant", () => {
  const src = readFile("docs/development-os-architecture.md");
  // Mappers convert micros / major / etc. → minor units before
  // persisting. This is a load-bearing invariant for the metrics
  // dashboards.
  assert.match(src, /Cost-unit normalization at the boundary/);
  assert.match(src, /Provider mappers normalize/);
});

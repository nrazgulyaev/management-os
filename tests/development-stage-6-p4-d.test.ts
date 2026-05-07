/**
 * Stage 6.P4.D — Meta Ads provider tests.
 *
 * Covers:
 *   - metaSpendToMinor (decimal-major-string → bigint minor) — the
 *     load-bearing financial invariant for Meta.
 *   - mapMetaCampaignStatus (effective_status priority over status).
 *   - mapMetaCampaign + mapMetaInsightsToMetrics (action aggregation,
 *     ROAS computation, video views, missing-field defensiveness).
 *   - MetaAdsClient (auth + appsecret_proof + insights query shape).
 *   - MetaAdsProvider (fetchCampaigns / fetchMetrics / testConnection
 *     + degradation paths + delegation note).
 *   - Selector dispatch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  selectMarketingProvider,
  DryRunMarketingProvider,
  type MarketingCredentials,
} from "../src/lib/marketing";
import {
  MetaAdsClient,
  META_CAMPAIGN_FIELDS,
  META_INSIGHTS_FIELDS,
} from "../src/lib/marketing/providers/meta-ads/client";
import { MetaAdsProvider } from "../src/lib/marketing/providers/meta-ads/provider";
import {
  metaSpendToMinor,
  mapMetaCampaignStatus,
  mapMetaCampaign,
  mapMetaInsightsToMetrics,
  parseListResponse,
} from "../src/lib/marketing/providers/meta-ads/parsers";

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response,
): typeof globalThis.fetch {
  return async (url, init) => {
    return handler(typeof url === "string" ? url : url.toString(), init);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function adsCreds(over: Partial<{
  accessToken: string;
  adAccountId: string;
  appSecret: string;
}> = {}) {
  return {
    provider: "meta_ads" as const,
    accessToken: over.accessToken ?? "EAA-fresh",
    adAccountId: over.adAccountId ?? "act_1234567890",
    appSecret: over.appSecret,
  };
}

// ===========================================================================
// 1) Spend / status / mapper helpers
// ===========================================================================

test("metaSpendToMinor: '12.34' → 1234", () => {
  assert.equal(metaSpendToMinor("12.34"), 1234n);
});

test("metaSpendToMinor: '0' → 0; null → 0; '' → 0", () => {
  assert.equal(metaSpendToMinor("0"), 0n);
  assert.equal(metaSpendToMinor(null), 0n);
  assert.equal(metaSpendToMinor(""), 0n);
});

test("metaSpendToMinor: numeric inputs supported", () => {
  assert.equal(metaSpendToMinor(15.5), 1550n);
  assert.equal(metaSpendToMinor(0), 0n);
});

test("metaSpendToMinor: garbage / NaN → 0", () => {
  assert.equal(metaSpendToMinor("garbage"), 0n);
  assert.equal(metaSpendToMinor(Number.NaN), 0n);
});

test("metaSpendToMinor: rounds to nearest cent", () => {
  assert.equal(metaSpendToMinor("12.345"), 1235n);
  assert.equal(metaSpendToMinor("12.344"), 1234n);
});

test("mapMetaCampaignStatus: effective_status wins over status", () => {
  assert.equal(mapMetaCampaignStatus("ACTIVE", "PAUSED"), "paused");
  assert.equal(mapMetaCampaignStatus("PAUSED", "ACTIVE"), "active");
});

test("mapMetaCampaignStatus: ARCHIVED + DELETED both → archived", () => {
  assert.equal(mapMetaCampaignStatus("ARCHIVED", undefined), "archived");
  assert.equal(mapMetaCampaignStatus("DELETED", undefined), "archived");
});

test("mapMetaCampaignStatus: COMPLETED → completed", () => {
  assert.equal(mapMetaCampaignStatus("COMPLETED", null), "completed");
});

test("mapMetaCampaignStatus: missing both → unknown", () => {
  assert.equal(mapMetaCampaignStatus(undefined, undefined), "unknown");
});

// ===========================================================================
// 2) Campaign + insights mappers
// ===========================================================================

test("mapMetaCampaign: full shape with daily_budget", () => {
  const row = {
    id: "23847",
    name: "Spring Promo",
    status: "ACTIVE",
    effective_status: "ACTIVE",
    objective: "LINK_CLICKS",
    buying_type: "AUCTION",
    start_time: "2026-03-01",
    stop_time: "2026-05-31",
    daily_budget: "5000", // 50 USD
  };
  const out = mapMetaCampaign(row);
  assert.ok(out);
  assert.equal(out.externalCampaignId, "23847");
  assert.equal(out.campaignName, "Spring Promo");
  assert.equal(out.status, "active");
  assert.equal(out.campaignType, "AUCTION");
  assert.equal(out.campaignObjective, "LINK_CLICKS");
  assert.equal(out.budgetMinor, 500000n); // "5000" → 500000 cents
  assert.equal(out.budgetType, "daily");
});

test("mapMetaCampaign: lifetime_budget when daily not set", () => {
  const row = {
    id: "1",
    name: "x",
    status: "ACTIVE",
    lifetime_budget: "100000",
  };
  const out = mapMetaCampaign(row);
  assert.ok(out);
  assert.equal(out.budgetType, "lifetime");
  assert.equal(out.budgetMinor, 10000000n);
});

test("mapMetaCampaign: missing id or name returns null", () => {
  assert.equal(mapMetaCampaign({ id: "1" }), null);
  assert.equal(mapMetaCampaign({ name: "x" }), null);
  assert.equal(mapMetaCampaign({}), null);
});

test("mapMetaInsightsToMetrics: sums actions matching configured conversion types", () => {
  const row = {
    campaign_id: "23847",
    date_start: "2026-05-07",
    spend: "12.34",
    impressions: "5000",
    clicks: "100",
    ctr: 0.02,
    cpc: "0.12",
    actions: [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "5" },
      { action_type: "offsite_conversion.fb_pixel_view_content", value: "30" },
      { action_type: "page_engagement", value: "20" },
    ],
    action_values: [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "250" },
    ],
  };
  const out = mapMetaInsightsToMetrics(row, { currency: "USD" });
  assert.ok(out);
  assert.equal(out.spendMinor, 1234n);
  assert.equal(out.spendCurrency, "USD");
  assert.equal(out.impressions, 5000n);
  assert.equal(out.clicks, 100n);
  assert.equal(out.conversions, 5n);
  assert.equal(out.conversionValueMinor, 25000n); // 250 USD → 25000 cents
  // ROAS: 25000 / 1234 ≈ 20.26
  assert.ok(out.returnOnAdSpend);
  assert.ok(Math.abs(out.returnOnAdSpend! - 25000 / 1234) < 0.01);
  // costPerConversionMinor = 1234 / 5 = 246
  assert.equal(out.costPerConversionMinor, 246n);
});

test("mapMetaInsightsToMetrics: respects custom conversionActionTypes allow-list", () => {
  const row = {
    campaign_id: "1",
    date_start: "2026-05-07",
    spend: "10.00",
    actions: [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "10" },
      { action_type: "lead", value: "5" },
    ],
  };
  // Only count `lead` events.
  const out = mapMetaInsightsToMetrics(row, {
    currency: "USD",
    conversionActionTypes: ["lead"],
  });
  assert.ok(out);
  assert.equal(out.conversions, 5n);
});

test("mapMetaInsightsToMetrics: video_play_actions → videoViews", () => {
  const row = {
    campaign_id: "1",
    date_start: "2026-05-07",
    spend: "0",
    video_play_actions: [{ action_type: "video_view", value: "1500" }],
  };
  const out = mapMetaInsightsToMetrics(row, { currency: "USD" });
  assert.ok(out);
  assert.equal(out.videoViews, 1500n);
});

test("mapMetaInsightsToMetrics: missing campaign_id or date_start returns null", () => {
  assert.equal(
    mapMetaInsightsToMetrics(
      { date_start: "2026-05-07" },
      { currency: "USD" },
    ),
    null,
  );
  assert.equal(
    mapMetaInsightsToMetrics({ campaign_id: "1" }, { currency: "USD" }),
    null,
  );
});

test("mapMetaInsightsToMetrics: zero spend → no ROAS even with conversion value", () => {
  const row = {
    campaign_id: "1",
    date_start: "2026-05-07",
    spend: "0",
    action_values: [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "100" },
    ],
  };
  const out = mapMetaInsightsToMetrics(row, { currency: "USD" });
  assert.ok(out);
  assert.equal(out.spendMinor, 0n);
  assert.equal(out.returnOnAdSpend, undefined);
});

test("parseListResponse: extracts data array; malformed JSON → empty", () => {
  assert.equal(
    parseListResponse(JSON.stringify({ data: [{ id: "1" }] })).length,
    1,
  );
  assert.deepEqual(parseListResponse("garbage"), []);
});

// ===========================================================================
// 3) MetaAdsClient — auth + URL shape
// ===========================================================================

test("MetaAdsClient: listCampaigns hits ad-account/campaigns with fields + access_token", async () => {
  let seenUrl = "";
  const c = new MetaAdsClient(adsCreds(), {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ data: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.listCampaigns();
  const url = new URL(seenUrl);
  assert.match(url.pathname, /\/v18\.0\/act_1234567890\/campaigns$/);
  assert.equal(url.searchParams.get("access_token"), "EAA-fresh");
  // META_CAMPAIGN_FIELDS includes id+name+status etc.
  assert.equal(url.searchParams.get("fields"), META_CAMPAIGN_FIELDS);
});

test("MetaAdsClient: appsecret_proof added when app_secret configured", async () => {
  let seenUrl = "";
  const c = new MetaAdsClient(adsCreds({ appSecret: "app-secret" }), {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ data: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.listCampaigns();
  const url = new URL(seenUrl);
  const expected = createHmac("sha256", "app-secret")
    .update("EAA-fresh")
    .digest("hex");
  assert.equal(url.searchParams.get("appsecret_proof"), expected);
});

test("MetaAdsClient: getCampaignInsights sets time_range + level=campaign + time_increment=1", async () => {
  let seenUrl = "";
  const c = new MetaAdsClient(adsCreds(), {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ data: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.getCampaignInsights({
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-07T00:00:00Z"),
  });
  const url = new URL(seenUrl);
  assert.equal(url.searchParams.get("level"), "campaign");
  assert.equal(url.searchParams.get("time_increment"), "1");
  assert.equal(url.searchParams.get("fields"), META_INSIGHTS_FIELDS);
  const tr = JSON.parse(url.searchParams.get("time_range") ?? "{}");
  assert.equal(tr.since, "2026-05-01");
  assert.equal(tr.until, "2026-05-07");
});

test("MetaAdsClient: getCampaignInsights filters by campaignIds when provided", async () => {
  let seenUrl = "";
  const c = new MetaAdsClient(adsCreds(), {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ data: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.getCampaignInsights({
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-07T00:00:00Z"),
    campaignIds: ["11", "22"],
  });
  const url = new URL(seenUrl);
  const filtering = JSON.parse(url.searchParams.get("filtering") ?? "[]");
  assert.equal(filtering[0].field, "campaign.id");
  assert.equal(filtering[0].operator, "IN");
  assert.deepEqual(filtering[0].value, ["11", "22"]);
});

test("MetaAdsClient: attribution_setting propagated as action_attribution_windows", async () => {
  let seenUrl = "";
  const c = new MetaAdsClient(adsCreds(), {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ data: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.getCampaignInsights({
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-07T00:00:00Z"),
    attributionSetting: "1d_view,7d_click",
  });
  const url = new URL(seenUrl);
  assert.equal(
    url.searchParams.get("action_attribution_windows"),
    "1d_view,7d_click",
  );
});

test("MetaAdsClient: getAccount selects currency + account_status", async () => {
  let seenUrl = "";
  const c = new MetaAdsClient(adsCreds(), {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ id: "act_1", currency: "USD", account_status: 1 });
    }),
    backoffBaseMs: 1,
  });
  await c.getAccount();
  const url = new URL(seenUrl);
  assert.match(url.searchParams.get("fields") ?? "", /currency/);
  assert.match(url.searchParams.get("fields") ?? "", /account_status/);
});

// ===========================================================================
// 4) MetaAdsProvider
// ===========================================================================

test("MetaAdsProvider: fetchCampaigns annotates currency from connection default", async () => {
  const provider = new MetaAdsProvider(adsCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        data: [
          {
            id: "1",
            name: "Test",
            status: "ACTIVE",
            daily_budget: "10000", // 100 USD
          },
        ],
      }),
    ),
    backoffBaseMs: 1,
    defaultCurrency: "EUR",
  });
  const out = await provider.fetchCampaigns();
  assert.equal(out.length, 1);
  assert.equal(out[0].budgetMinor, 1000000n); // 10000 → 1000000 cents
  assert.equal(out[0].budgetCurrency, "EUR");
});

test("MetaAdsProvider: fetchCampaigns degrades to empty on 4xx", async () => {
  const provider = new MetaAdsProvider(adsCreds(), {
    fetch: mockFetch(() => new Response("forbidden", { status: 403 })),
    backoffBaseMs: 1,
  });
  assert.deepEqual(await provider.fetchCampaigns(), []);
});

test("MetaAdsProvider: fetchMetrics projects insights rows", async () => {
  const provider = new MetaAdsProvider(adsCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        data: [
          {
            campaign_id: "1",
            date_start: "2026-05-07",
            spend: "12.34",
            impressions: "1000",
            clicks: "10",
            actions: [
              {
                action_type: "offsite_conversion.fb_pixel_purchase",
                value: "2",
              },
            ],
          },
        ],
      }),
    ),
    backoffBaseMs: 1,
  });
  const out = await provider.fetchMetrics({
    campaignIds: [],
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-07T00:00:00Z"),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].spendMinor, 1234n);
  assert.equal(out[0].conversions, 2n);
});

test("MetaAdsProvider: pullAnalyticsTouchpoints returns empty (GA4 owns attribution path)", async () => {
  const provider = new MetaAdsProvider(adsCreds());
  assert.deepEqual(await provider.pullAnalyticsTouchpoints(), []);
});

test("MetaAdsProvider: sendConversionEvent delegates to Pixel CAPI (success=true with note)", async () => {
  const provider = new MetaAdsProvider(adsCreds());
  const r = await provider.sendConversionEvent({
    eventName: "Purchase",
    clientId: "x",
  });
  assert.equal(r.success, true);
  assert.match(r.error ?? "", /Pixel Conversions API/);
});

test("MetaAdsProvider: webhooks fail-closed", () => {
  const provider = new MetaAdsProvider(adsCreds());
  assert.equal(provider.verifyWebhook("p", "s", "x"), false);
  assert.equal(provider.parseWebhook({}), null);
});

test("MetaAdsProvider: testConnection returns currency + account_status", async () => {
  const provider = new MetaAdsProvider(adsCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        id: "act_1234567890",
        currency: "USD",
        account_status: 1,
      }),
    ),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["currency"], "USD");
  assert.equal(r.details["accountStatus"], 1);
});

test("MetaAdsProvider: testConnection 401 → disconnected", async () => {
  const provider = new MetaAdsProvider(adsCreds(), {
    fetch: mockFetch(() => new Response("unauthorized", { status: 401 })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, false);
});

// ===========================================================================
// 5) Selector dispatch
// ===========================================================================

test("selectMarketingProvider: meta_ads creds → MetaAdsProvider", () => {
  const creds: MarketingCredentials = adsCreds();
  const p = selectMarketingProvider("meta_ads", creds);
  assert.ok(p instanceof MetaAdsProvider);
  assert.ok(!(p instanceof DryRunMarketingProvider));
});

test("selectMarketingProvider: meta_ads + GA4 creds → DryRun (mismatch)", () => {
  const wrong: MarketingCredentials = {
    provider: "google_analytics",
    measurementId: "G-X",
    apiSecret: "s",
    propertyId: "1",
  };
  const p = selectMarketingProvider("meta_ads", wrong);
  assert.ok(p instanceof DryRunMarketingProvider);
});

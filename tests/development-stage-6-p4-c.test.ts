/**
 * Stage 6.P4.C — Google Ads provider tests.
 *
 * Covers:
 *   - GoogleAdsClient — auth headers (Bearer + developer-token +
 *     login-customer-id), OAuth refresh (proactive + reactive 401),
 *     GAQL body shape, retry envelope inheritance.
 *   - Parsers — micros → minor conversion (the load-bearing
 *     financial invariant), status mapping, campaign + metrics
 *     projections, missing-field defensiveness.
 *   - GoogleAdsProvider — fetchCampaigns + fetchMetrics happy path
 *     + filter-by-id, non-2xx degradation, testConnection,
 *     conversion-event delegation note.
 *   - Selector dispatch — google_ads creds → GoogleAdsProvider;
 *     mismatch falls back to DryRun.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  selectMarketingProvider,
  DryRunMarketingProvider,
  type MarketingCredentials,
} from "../src/lib/marketing";
import {
  GoogleAdsClient,
  GAQL_CAMPAIGNS,
  gaqlCampaignMetricsForDate,
  gaqlCampaignMetricsRange,
} from "../src/lib/marketing/providers/google-ads/client";
import { GoogleAdsProvider } from "../src/lib/marketing/providers/google-ads/provider";
import {
  microsToMinor,
  mapCampaignStatus,
  mapBudgetType,
  mapGoogleAdsCampaign,
  mapGoogleAdsMetrics,
  parseSearchResponse,
} from "../src/lib/marketing/providers/google-ads/parsers";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

const FUTURE = Date.now() + 24 * 3600 * 1000;
const PAST = Date.now() - 60 * 1000;

function adsCreds(over: Partial<{
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId: string;
  accessToken: string;
  expiresAt: number;
}> = {}) {
  return {
    provider: "google_ads" as const,
    developerToken: over.developerToken ?? "DEV-TOKEN",
    clientId: over.clientId ?? "client-id",
    clientSecret: over.clientSecret ?? "client-secret",
    refreshToken: over.refreshToken ?? "1//refresh-x",
    customerId: over.customerId ?? "1234567890",
    loginCustomerId: over.loginCustomerId,
    accessToken: over.accessToken ?? "ya29.fresh",
    expiresAt: over.expiresAt ?? FUTURE,
  };
}

// ===========================================================================
// 1) Cost-unit conversion (load-bearing financial invariant)
// ===========================================================================

test("microsToMinor: 1_000_000 micros = 100 minor (1 USD = 100 cents)", () => {
  assert.equal(microsToMinor(1_000_000), 100n);
});

test("microsToMinor: 1_500_000 micros = 150 minor", () => {
  assert.equal(microsToMinor(1_500_000), 150n);
});

test("microsToMinor: 500_000 micros = 50 minor", () => {
  assert.equal(microsToMinor(500_000), 50n);
});

test("microsToMinor: zero micros → 0", () => {
  assert.equal(microsToMinor(0), 0n);
});

test("microsToMinor: bigint input passes through", () => {
  assert.equal(microsToMinor(1_234_500n), 123n); // 1.2345 USD → 123 cents (truncated)
});

test("microsToMinor: string-numeric input parses", () => {
  assert.equal(microsToMinor("1000000"), 100n);
});

test("microsToMinor: null / undefined / NaN → 0", () => {
  assert.equal(microsToMinor(null), 0n);
  assert.equal(microsToMinor(undefined), 0n);
  assert.equal(microsToMinor(Number.NaN), 0n);
  assert.equal(microsToMinor("garbage"), 0n);
});

// ===========================================================================
// 2) Status / budget-type mapping
// ===========================================================================

test("mapCampaignStatus: ENABLED / PAUSED / REMOVED → active / paused / archived", () => {
  assert.equal(mapCampaignStatus("ENABLED"), "active");
  assert.equal(mapCampaignStatus("PAUSED"), "paused");
  assert.equal(mapCampaignStatus("REMOVED"), "archived");
  assert.equal(mapCampaignStatus("DRAFT"), "draft");
});

test("mapCampaignStatus: unknown / non-string → unknown", () => {
  assert.equal(mapCampaignStatus("WHATEVER"), "unknown");
  assert.equal(mapCampaignStatus(undefined), "unknown");
  assert.equal(mapCampaignStatus(42), "unknown");
});

test("mapBudgetType: DAILY → daily, CUSTOM_PERIOD → lifetime, else undefined", () => {
  assert.equal(mapBudgetType("DAILY"), "daily");
  assert.equal(mapBudgetType("FIXED_DAILY"), "daily");
  assert.equal(mapBudgetType("CUSTOM_PERIOD"), "lifetime");
  assert.equal(mapBudgetType("TOTAL"), "lifetime");
  assert.equal(mapBudgetType("UNKNOWN"), undefined);
  assert.equal(mapBudgetType(undefined), undefined);
});

// ===========================================================================
// 3) parseSearchResponse + mappers
// ===========================================================================

test("parseSearchResponse: extracts results array", () => {
  const body = JSON.stringify({
    results: [{ campaign: { id: "1" } }],
    totalResultsCount: "1",
  });
  assert.equal(parseSearchResponse(body).length, 1);
});

test("parseSearchResponse: malformed JSON returns empty", () => {
  assert.deepEqual(parseSearchResponse("not json"), []);
});

test("mapGoogleAdsCampaign: maps full campaign + budget shape", () => {
  const row = {
    campaign: {
      id: "12345",
      name: "Spring 2026",
      status: "ENABLED",
      advertisingChannelType: "SEARCH",
      biddingStrategyType: "MAXIMIZE_CONVERSIONS",
      startDate: "2026-03-01",
      endDate: "2026-05-31",
    },
    campaignBudget: {
      amountMicros: "50000000",
      period: "DAILY",
      deliveryMethod: "STANDARD",
    },
  };
  const out = mapGoogleAdsCampaign(row);
  assert.ok(out);
  assert.equal(out.externalCampaignId, "12345");
  assert.equal(out.campaignName, "Spring 2026");
  assert.equal(out.status, "active");
  assert.equal(out.campaignType, "SEARCH");
  assert.equal(out.campaignObjective, "MAXIMIZE_CONVERSIONS");
  assert.equal(out.budgetMinor, 5000n); // 50_000_000 micros = 50 USD = 5000 cents
  assert.equal(out.budgetType, "daily");
  assert.equal(out.startDate?.toISOString().slice(0, 10), "2026-03-01");
});

test("mapGoogleAdsCampaign: missing id or name returns null", () => {
  assert.equal(mapGoogleAdsCampaign({ campaign: { id: "1" } }), null);
  assert.equal(mapGoogleAdsCampaign({ campaign: { name: "x" } }), null);
  assert.equal(mapGoogleAdsCampaign({}), null);
});

test("mapGoogleAdsMetrics: spendMinor from cost_micros + ROAS computed", () => {
  const row = {
    campaign: { id: "12345" },
    segments: { date: "2026-05-07" },
    metrics: {
      costMicros: "10000000", // 10 USD = 1000 cents
      impressions: "5000",
      clicks: "100",
      ctr: 0.02,
      averageCpc: "100000", // 0.10 USD = 10 cents per click
      conversions: 5,
      conversionsValue: 250, // 250 USD = 25_000 cents
    },
  };
  const out = mapGoogleAdsMetrics(row, "USD");
  assert.ok(out);
  assert.equal(out.externalCampaignId, "12345");
  assert.equal(out.spendMinor, 1000n);
  assert.equal(out.spendCurrency, "USD");
  assert.equal(out.impressions, 5000n);
  assert.equal(out.clicks, 100n);
  assert.equal(out.clickThroughRate, 0.02);
  assert.equal(out.costPerClickMinor, 10n);
  assert.equal(out.conversions, 5n);
  // 250 USD × 100 = 25_000 minor
  assert.equal(out.conversionValueMinor, 25000n);
  // ROAS = (250 USD) / (10 USD) = 25
  assert.ok(out.returnOnAdSpend);
  assert.ok(Math.abs(out.returnOnAdSpend! - 25) < 0.01);
});

test("mapGoogleAdsMetrics: missing date returns null", () => {
  const row = {
    campaign: { id: "12345" },
    metrics: { costMicros: "1000000" },
  };
  assert.equal(mapGoogleAdsMetrics(row, "USD"), null);
});

test("mapGoogleAdsMetrics: missing campaign id returns null", () => {
  const row = {
    segments: { date: "2026-05-07" },
    metrics: { costMicros: "1000000" },
  };
  assert.equal(mapGoogleAdsMetrics(row, "USD"), null);
});

test("mapGoogleAdsMetrics: zero spend → no ROAS even with conversion value", () => {
  const row = {
    campaign: { id: "1" },
    segments: { date: "2026-05-07" },
    metrics: {
      costMicros: "0",
      conversionsValue: 100,
    },
  };
  const out = mapGoogleAdsMetrics(row, "USD");
  assert.ok(out);
  assert.equal(out.spendMinor, 0n);
  assert.equal(out.returnOnAdSpend, undefined);
});

// ===========================================================================
// 4) GAQL builders
// ===========================================================================

test("GAQL_CAMPAIGNS: includes campaign + budget fields needed by mapper", () => {
  for (const field of [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "campaign.advertising_channel_type",
    "campaign_budget.amount_micros",
  ]) {
    assert.match(GAQL_CAMPAIGNS, new RegExp(field.replace(/\./g, "\\.")));
  }
  assert.match(GAQL_CAMPAIGNS, /FROM campaign/);
});

test("gaqlCampaignMetricsForDate: pins WHERE segments.date = ...", () => {
  const q = gaqlCampaignMetricsForDate("2026-05-07");
  assert.match(q, /WHERE segments\.date = '2026-05-07'/);
  assert.match(q, /metrics\.cost_micros/);
});

test("gaqlCampaignMetricsRange: pins WHERE segments.date BETWEEN ...", () => {
  const q = gaqlCampaignMetricsRange("2026-05-01", "2026-05-31");
  assert.match(q, /BETWEEN '2026-05-01' AND '2026-05-31'/);
});

// ===========================================================================
// 5) GoogleAdsClient — auth + body shape
// ===========================================================================

test("GoogleAdsClient: search POSTs Bearer + developer-token + GAQL body", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const c = new GoogleAdsClient(adsCreds(), {
    fetch: mockFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ results: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.searchCampaigns();
  assert.match(seenUrl, /\/customers\/1234567890\/googleAds:search$/);
  const headers = seenInit?.headers as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer ya29.fresh");
  assert.equal(headers["developer-token"], "DEV-TOKEN");
  assert.equal(headers["Content-Type"], "application/json");
  const body = JSON.parse(seenInit?.body as string);
  assert.match(body.query, /FROM campaign/);
});

test("GoogleAdsClient: login-customer-id header set when MCC managed", async () => {
  let seenHeaders: Record<string, string> = {};
  const c = new GoogleAdsClient(adsCreds({ loginCustomerId: "9999999999" }), {
    fetch: mockFetch((_url, init) => {
      seenHeaders = init?.headers as Record<string, string>;
      return jsonResponse({ results: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.searchCampaigns();
  assert.equal(seenHeaders["login-customer-id"], "9999999999");
});

test("GoogleAdsClient: login-customer-id absent when not MCC managed", async () => {
  let seenHeaders: Record<string, string> = {};
  const c = new GoogleAdsClient(adsCreds(), {
    fetch: mockFetch((_url, init) => {
      seenHeaders = init?.headers as Record<string, string>;
      return jsonResponse({ results: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.searchCampaigns();
  assert.equal(seenHeaders["login-customer-id"], undefined);
});

// ===========================================================================
// 6) GoogleAdsClient — OAuth refresh
// ===========================================================================

test("GoogleAdsClient: proactive refresh fires when token within margin", async () => {
  let refreshHits = 0;
  let searchHits = 0;
  const fetchImpl = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) {
      refreshHits++;
      return jsonResponse({
        access_token: "ya29.NEW-ADS-TOKEN",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    if (url.includes("googleAds:search")) {
      searchHits++;
      return jsonResponse({ results: [] });
    }
    return new Response("unexpected", { status: 500 });
  });
  let persistedNext: { accessToken: string; expiresAt: number } | null = null;
  const c = new GoogleAdsClient(adsCreds({ expiresAt: PAST }), {
    fetch: fetchImpl,
    backoffBaseMs: 1,
    onCredentialsRefreshed: (next) => {
      persistedNext = {
        accessToken: next.accessToken,
        expiresAt: next.expiresAt,
      };
    },
  });
  await c.searchCampaigns();
  assert.equal(refreshHits, 1);
  assert.equal(searchHits, 1);
  assert.ok(persistedNext);
  const captured = persistedNext as { accessToken: string; expiresAt: number };
  assert.equal(captured.accessToken, "ya29.NEW-ADS-TOKEN");
});

test("GoogleAdsClient: reactive 401 mid-flight triggers refresh + single retry", async () => {
  let refreshHits = 0;
  let searchHits = 0;
  const fetchImpl = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) {
      refreshHits++;
      return jsonResponse({
        access_token: "ya29.refreshed-mid",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    if (url.includes("googleAds:search")) {
      searchHits++;
      return searchHits === 1
        ? new Response("unauthorized", { status: 401 })
        : jsonResponse({ results: [] });
    }
    return new Response("unexpected", { status: 500 });
  });
  const c = new GoogleAdsClient(adsCreds({ expiresAt: FUTURE }), {
    fetch: fetchImpl,
    backoffBaseMs: 1,
  });
  await c.searchCampaigns();
  assert.equal(refreshHits, 1);
  assert.equal(searchHits, 2);
});

test("GoogleAdsClient: missing accessToken triggers proactive refresh on first call", async () => {
  let refreshHits = 0;
  let searchHits = 0;
  const fetchImpl = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) {
      refreshHits++;
      return jsonResponse({
        access_token: "ya29.first-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    if (url.includes("googleAds:search")) {
      searchHits++;
      return jsonResponse({ results: [] });
    }
    return new Response("unexpected", { status: 500 });
  });
  const c = new GoogleAdsClient(
    {
      provider: "google_ads",
      developerToken: "T",
      clientId: "c",
      clientSecret: "s",
      refreshToken: "r",
      customerId: "1234567890",
      // no accessToken / expiresAt
    },
    { fetch: fetchImpl, backoffBaseMs: 1 },
  );
  await c.searchCampaigns();
  assert.equal(refreshHits, 1);
  assert.equal(searchHits, 1);
});

// ===========================================================================
// 7) GoogleAdsProvider
// ===========================================================================

test("GoogleAdsProvider: fetchCampaigns projects rows + annotates currency", async () => {
  const provider = new GoogleAdsProvider(adsCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        results: [
          {
            campaign: {
              id: "1",
              name: "Test campaign",
              status: "ENABLED",
              startDate: "2026-05-01",
            },
            campaignBudget: {
              amountMicros: "20000000", // 20 USD
              period: "DAILY",
            },
          },
        ],
      }),
    ),
    backoffBaseMs: 1,
    defaultCurrency: "EUR",
  });
  const out = await provider.fetchCampaigns();
  assert.equal(out.length, 1);
  assert.equal(out[0].budgetMinor, 2000n); // 20 EUR = 2000 cents
  assert.equal(out[0].budgetCurrency, "EUR");
});

test("GoogleAdsProvider: fetchCampaigns degrades to empty on non-2xx", async () => {
  const provider = new GoogleAdsProvider(adsCreds(), {
    fetch: mockFetch(() => new Response("forbidden", { status: 403 })),
    backoffBaseMs: 1,
  });
  const out = await provider.fetchCampaigns();
  assert.deepEqual(out, []);
});

test("GoogleAdsProvider: fetchMetrics filters by requested campaign IDs", async () => {
  const provider = new GoogleAdsProvider(adsCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        results: [
          {
            campaign: { id: "11" },
            segments: { date: "2026-05-07" },
            metrics: { costMicros: "1000000" },
          },
          {
            campaign: { id: "22" },
            segments: { date: "2026-05-07" },
            metrics: { costMicros: "2000000" },
          },
          {
            campaign: { id: "33" },
            segments: { date: "2026-05-07" },
            metrics: { costMicros: "3000000" },
          },
        ],
      }),
    ),
    backoffBaseMs: 1,
  });
  const out = await provider.fetchMetrics({
    campaignIds: ["11", "33"],
    since: new Date("2026-05-07T00:00:00Z"),
    until: new Date("2026-05-07T23:59:59Z"),
  });
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((m) => m.externalCampaignId).sort(),
    ["11", "33"],
  );
});

test("GoogleAdsProvider: fetchMetrics empty campaignIds returns every row", async () => {
  const provider = new GoogleAdsProvider(adsCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        results: [
          {
            campaign: { id: "11" },
            segments: { date: "2026-05-07" },
            metrics: { costMicros: "1000000" },
          },
          {
            campaign: { id: "22" },
            segments: { date: "2026-05-07" },
            metrics: { costMicros: "2000000" },
          },
        ],
      }),
    ),
    backoffBaseMs: 1,
  });
  const out = await provider.fetchMetrics({
    campaignIds: [],
    since: new Date("2026-05-07T00:00:00Z"),
    until: new Date("2026-05-07T23:59:59Z"),
  });
  assert.equal(out.length, 2);
});

test("GoogleAdsProvider: pullAnalyticsTouchpoints returns empty (GA4 owns attribution path)", async () => {
  const provider = new GoogleAdsProvider(adsCreds());
  const out = await provider.pullAnalyticsTouchpoints();
  assert.deepEqual(out, []);
});

test("GoogleAdsProvider: sendConversionEvent delegates to GA4 (success=true with note)", async () => {
  const provider = new GoogleAdsProvider(adsCreds());
  const r = await provider.sendConversionEvent({
    eventName: "purchase",
    clientId: "x",
  });
  assert.equal(r.success, true);
  assert.match(r.error ?? "", /GA4 Measurement Protocol/);
});

test("GoogleAdsProvider: webhooks fail-closed", () => {
  const provider = new GoogleAdsProvider(adsCreds());
  assert.equal(provider.verifyWebhook("p", "s", "x"), false);
  assert.equal(provider.parseWebhook({}), null);
});

test("GoogleAdsProvider: testConnection returns campaignCount on success", async () => {
  const provider = new GoogleAdsProvider(adsCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        results: [{ campaign: { id: "1" } }],
        totalResultsCount: "42",
      }),
    ),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["campaignCount"], 42);
});

test("GoogleAdsProvider: testConnection reports disconnected on 403", async () => {
  const provider = new GoogleAdsProvider(adsCreds(), {
    fetch: mockFetch(() => new Response("denied", { status: 403 })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, false);
});

// ===========================================================================
// 8) Selector dispatch
// ===========================================================================

test("selectMarketingProvider: google_ads creds → GoogleAdsProvider", () => {
  const creds: MarketingCredentials = adsCreds();
  const p = selectMarketingProvider("google_ads", creds);
  assert.ok(p instanceof GoogleAdsProvider);
  assert.ok(!(p instanceof DryRunMarketingProvider));
});

test("selectMarketingProvider: google_ads requested + GA4 creds → DryRun (mismatch)", () => {
  const wrong: MarketingCredentials = {
    provider: "google_analytics",
    measurementId: "G-X",
    apiSecret: "s",
    propertyId: "1",
  };
  const p = selectMarketingProvider("google_ads", wrong);
  assert.ok(p instanceof DryRunMarketingProvider);
});

test("selectMarketingProvider: google_ads + null creds → DryRun", () => {
  const p = selectMarketingProvider("google_ads", null);
  assert.ok(p instanceof DryRunMarketingProvider);
});

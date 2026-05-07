/**
 * Stage 6.P4.E — TikTok Ads + Mailchimp + ConvertKit tests.
 *
 * Each provider gets:
 *   - Pure parser / mapper coverage (where it has parsers)
 *   - Client URL/auth shape
 *   - Provider testConnection success + degradation
 *   - Selector dispatch
 *
 * Lighter than P4.B/C/D because Mailchimp + ConvertKit are read-only
 * email marketing surfaces; the heavy lifting is documented in their
 * respective providers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  selectMarketingProvider,
  DryRunMarketingProvider,
  type MarketingCredentials,
} from "../src/lib/marketing";

// TikTok
import { TikTokAdsClient } from "../src/lib/marketing/providers/tiktok-ads/client";
import { TikTokAdsProvider } from "../src/lib/marketing/providers/tiktok-ads/provider";
import {
  tiktokSpendToMinor,
  mapTikTokCampaignStatus,
  mapTikTokCampaign,
  mapTikTokMetrics,
  parseTikTokList,
} from "../src/lib/marketing/providers/tiktok-ads/parsers";

// Mailchimp
import {
  MailchimpProvider,
  extractDatacenter,
  mapMailchimpStatus,
} from "../src/lib/marketing/providers/mailchimp/provider";

// ConvertKit
import { ConvertKitProvider } from "../src/lib/marketing/providers/convertkit/provider";

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

// ===========================================================================
// TikTok Ads
// ===========================================================================

const tiktokCreds = {
  provider: "tiktok_ads" as const,
  accessToken: "tt-token",
  advertiserId: "7000000000000000001",
  appId: "app-123",
  secret: "secret-x",
};

test("tiktokSpendToMinor: '12.34' → 1234; null → 0", () => {
  assert.equal(tiktokSpendToMinor("12.34"), 1234n);
  assert.equal(tiktokSpendToMinor(null), 0n);
});

test("mapTikTokCampaignStatus: ENABLE→active / DISABLE→paused / DELETE→archived", () => {
  assert.equal(mapTikTokCampaignStatus("ENABLE", undefined), "active");
  assert.equal(mapTikTokCampaignStatus("DISABLE", undefined), "paused");
  assert.equal(
    mapTikTokCampaignStatus(undefined, "STATUS_DELETE"),
    "archived",
  );
  assert.equal(
    mapTikTokCampaignStatus(undefined, "CAMPAIGN_STATUS_PHASE_OUT"),
    "completed",
  );
  assert.equal(mapTikTokCampaignStatus(undefined, undefined), "unknown");
});

test("parseTikTokList: extracts data.list; malformed → empty", () => {
  assert.equal(
    parseTikTokList(JSON.stringify({ code: 0, data: { list: [{ id: "1" }] } }))
      .length,
    1,
  );
  assert.deepEqual(parseTikTokList("garbage"), []);
});

test("mapTikTokCampaign: maps id + name + status + budget", () => {
  const out = mapTikTokCampaign({
    campaign_id: "cmp-1",
    campaign_name: "Spring",
    operation_status: "ENABLE",
    objective_type: "TRAFFIC",
    budget: "100.00",
    budget_mode: "BUDGET_MODE_DAY",
    schedule_start_time: "2026-05-01",
    schedule_end_time: "2026-05-31",
  });
  assert.ok(out);
  assert.equal(out.externalCampaignId, "cmp-1");
  assert.equal(out.status, "active");
  assert.equal(out.budgetMinor, 10000n);
  assert.equal(out.budgetType, "daily");
});

test("mapTikTokCampaign: missing id returns null", () => {
  assert.equal(mapTikTokCampaign({ campaign_name: "x" }), null);
});

test("mapTikTokMetrics: dimensions + metrics envelope", () => {
  const out = mapTikTokMetrics(
    {
      dimensions: { campaign_id: "cmp-1", stat_time_day: "2026-05-07" },
      metrics: {
        spend: "12.34",
        impressions: "1000",
        clicks: "100",
        ctr: "0.10",
        cpc: "0.12",
        conversion: "5",
        conversion_value: "250",
      },
    },
    { currency: "USD" },
  );
  assert.ok(out);
  assert.equal(out.spendMinor, 1234n);
  assert.equal(out.impressions, 1000n);
  assert.equal(out.clicks, 100n);
  assert.equal(out.conversions, 5n);
  assert.equal(out.conversionValueMinor, 25000n);
});

test("TikTokAdsClient: listCampaigns sets advertiser_id + Access-Token header", async () => {
  let seenUrl = "";
  let seenHeaders: Record<string, string> = {};
  const c = new TikTokAdsClient(tiktokCreds, {
    fetch: mockFetch((url, init) => {
      seenUrl = url;
      seenHeaders = init?.headers as Record<string, string>;
      return jsonResponse({ code: 0, data: { list: [] } });
    }),
    backoffBaseMs: 1,
  });
  await c.listCampaigns();
  const url = new URL(seenUrl);
  assert.equal(url.searchParams.get("advertiser_id"), "7000000000000000001");
  assert.equal(seenHeaders["Access-Token"], "tt-token");
});

test("TikTokAdsClient: getCampaignReport sets BASIC + AUCTION_CAMPAIGN + dimensions", async () => {
  let seenUrl = "";
  const c = new TikTokAdsClient(tiktokCreds, {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ code: 0, data: { list: [] } });
    }),
    backoffBaseMs: 1,
  });
  await c.getCampaignReport({
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-07T00:00:00Z"),
  });
  const url = new URL(seenUrl);
  assert.equal(url.searchParams.get("report_type"), "BASIC");
  assert.equal(url.searchParams.get("data_level"), "AUCTION_CAMPAIGN");
  assert.equal(url.searchParams.get("start_date"), "2026-05-01");
  assert.equal(url.searchParams.get("end_date"), "2026-05-07");
});

test("TikTokAdsProvider: fetchCampaigns + currency annotation", async () => {
  const provider = new TikTokAdsProvider(tiktokCreds, {
    fetch: mockFetch(() =>
      jsonResponse({
        code: 0,
        data: {
          list: [
            {
              campaign_id: "1",
              campaign_name: "Test",
              operation_status: "ENABLE",
            },
          ],
        },
      }),
    ),
    backoffBaseMs: 1,
    defaultCurrency: "EUR",
  });
  const out = await provider.fetchCampaigns();
  assert.equal(out.length, 1);
  assert.equal(out[0].budgetCurrency, "EUR");
});

test("TikTokAdsProvider: testConnection success → connected=true", async () => {
  const provider = new TikTokAdsProvider(tiktokCreds, {
    fetch: mockFetch(() => jsonResponse({ code: 0, data: { list: [] } })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
});

test("TikTokAdsProvider: testConnection 4xx → disconnected", async () => {
  const provider = new TikTokAdsProvider(tiktokCreds, {
    fetch: mockFetch(() => new Response("forbidden", { status: 403 })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, false);
});

test("selectMarketingProvider: tiktok_ads creds → TikTokAdsProvider", () => {
  const p = selectMarketingProvider("tiktok_ads", tiktokCreds);
  assert.ok(p instanceof TikTokAdsProvider);
});

// ===========================================================================
// Mailchimp
// ===========================================================================

test("extractDatacenter: '...usX' suffix → 'usX'", () => {
  assert.equal(extractDatacenter("abcd-us20"), "us20");
  assert.equal(extractDatacenter("xyz-eu1"), "eu1");
  assert.equal(extractDatacenter("nokeysuffix"), "us1"); // safe default
});

test("mapMailchimpStatus: sent→completed, sending/scheduled→active, draft→draft", () => {
  assert.equal(mapMailchimpStatus("sent"), "completed");
  assert.equal(mapMailchimpStatus("sending"), "active");
  assert.equal(mapMailchimpStatus("scheduled"), "active");
  assert.equal(mapMailchimpStatus("save"), "draft");
  assert.equal(mapMailchimpStatus("paused"), "paused");
  assert.equal(mapMailchimpStatus("archived"), "archived");
  assert.equal(mapMailchimpStatus("unknown_value"), "unknown");
});

test("MailchimpProvider: fetchCampaigns hits {dc}.api.mailchimp.com/3.0/campaigns with Basic auth", async () => {
  let seenUrl = "";
  let seenHeaders: Record<string, string> = {};
  const provider = new MailchimpProvider(
    { provider: "mailchimp", apiKey: "key-us20" },
    {
      fetch: mockFetch((url, init) => {
        seenUrl = url;
        seenHeaders = init?.headers as Record<string, string>;
        return jsonResponse({
          campaigns: [
            {
              id: "cmp-1",
              type: "regular",
              status: "sent",
              send_time: "2026-05-07T10:00:00Z",
              settings: { title: "Spring Newsletter" },
            },
          ],
        });
      }),
      backoffBaseMs: 1,
    },
  );
  const out = await provider.fetchCampaigns();
  assert.match(seenUrl, /^https:\/\/us20\.api\.mailchimp\.com\/3\.0\/campaigns/);
  assert.match(seenHeaders["Authorization"], /^Basic /);
  assert.equal(out.length, 1);
  assert.equal(out[0].campaignName, "Spring Newsletter");
  assert.equal(out[0].status, "completed");
});

test("MailchimpProvider: fetchMetrics filters by date window + projects emails_sent → impressions", async () => {
  const provider = new MailchimpProvider(
    { provider: "mailchimp", apiKey: "key-us1" },
    {
      fetch: mockFetch(() =>
        jsonResponse({
          reports: [
            {
              id: "cmp-1",
              send_time: "2026-05-07T10:00:00Z",
              emails_sent: 1000,
              clicks: { unique_clicks: 50 },
              opens: { unique_opens: 200 },
            },
            {
              id: "cmp-2",
              send_time: "2025-12-25T10:00:00Z", // out of range
              emails_sent: 500,
              clicks: { unique_clicks: 10 },
              opens: { unique_opens: 50 },
            },
          ],
        }),
      ),
      backoffBaseMs: 1,
    },
  );
  const out = await provider.fetchMetrics({
    campaignIds: [],
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-31T23:59:59Z"),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].externalCampaignId, "cmp-1");
  assert.equal(out[0].impressions, 1000n);
  assert.equal(out[0].clicks, 50n);
  assert.equal(out[0].conversions, 200n);
  assert.equal(out[0].spendMinor, 0n);
});

test("MailchimpProvider: testConnection hits /ping", async () => {
  let seenUrl = "";
  const provider = new MailchimpProvider(
    { provider: "mailchimp", apiKey: "key-us1" },
    {
      fetch: mockFetch((url) => {
        seenUrl = url;
        return jsonResponse({ health_status: "Everything's Chimpy!" });
      }),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.testConnection();
  assert.match(seenUrl, /\/ping$/);
  assert.equal(r.connected, true);
});

test("selectMarketingProvider: mailchimp creds → MailchimpProvider", () => {
  const p = selectMarketingProvider("mailchimp", {
    provider: "mailchimp",
    apiKey: "k-us1",
  });
  assert.ok(p instanceof MailchimpProvider);
});

// ===========================================================================
// ConvertKit
// ===========================================================================

const ckCreds = {
  provider: "convertkit" as const,
  apiKey: "ck-pub",
  apiSecret: "ck-secret",
};

test("ConvertKitProvider: fetchCampaigns hits /v3/broadcasts with api_secret", async () => {
  let seenUrl = "";
  const provider = new ConvertKitProvider(ckCreds, {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({
        broadcasts: [
          {
            id: 12345,
            subject: "Welcome",
            published_at: "2026-05-07T10:00:00Z",
            created_at: "2026-05-06T10:00:00Z",
          },
        ],
      });
    }),
    backoffBaseMs: 1,
  });
  const out = await provider.fetchCampaigns();
  const url = new URL(seenUrl);
  assert.match(url.pathname, /\/v3\/broadcasts$/);
  assert.equal(url.searchParams.get("api_secret"), "ck-secret");
  assert.equal(out.length, 1);
  assert.equal(out[0].externalCampaignId, "12345");
  assert.equal(out[0].campaignName, "Welcome");
  assert.equal(out[0].status, "completed");
});

test("ConvertKitProvider: fetchMetrics calls /broadcasts/{id}/stats per ID", async () => {
  const seenUrls: string[] = [];
  const provider = new ConvertKitProvider(ckCreds, {
    fetch: mockFetch((url) => {
      seenUrls.push(url);
      return jsonResponse({
        broadcast: {
          id: 1,
          created_at: "2026-05-07T10:00:00Z",
          stats: {
            recipients: 1000,
            unique_opens: 250,
            clicks: 80,
          },
        },
      });
    }),
    backoffBaseMs: 1,
  });
  const out = await provider.fetchMetrics({
    campaignIds: ["1", "2"],
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-31T23:59:59Z"),
  });
  assert.equal(seenUrls.length, 2);
  for (const u of seenUrls) {
    assert.match(u, /\/broadcasts\/\d+\/stats/);
  }
  assert.equal(out.length, 2);
  assert.equal(out[0].impressions, 1000n);
  assert.equal(out[0].conversions, 250n);
});

test("ConvertKitProvider: testConnection hits /account", async () => {
  let seenUrl = "";
  const provider = new ConvertKitProvider(ckCreds, {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ name: "Test Account" });
    }),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.match(seenUrl, /\/account/);
  assert.equal(r.connected, true);
});

test("selectMarketingProvider: convertkit creds → ConvertKitProvider", () => {
  const p = selectMarketingProvider("convertkit", ckCreds);
  assert.ok(p instanceof ConvertKitProvider);
});

test("selectMarketingProvider: sendgrid_marketing still DryRun (deferred to P5)", () => {
  const p = selectMarketingProvider("sendgrid_marketing", {
    provider: "sendgrid_marketing",
    apiKey: "k",
  } as MarketingCredentials);
  assert.ok(p instanceof DryRunMarketingProvider);
});

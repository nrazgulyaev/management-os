/**
 * Stage 6.P4.B — Analytics Ingestion tests.
 *
 * Covers:
 *   - GA4 client (Measurement Protocol POST shape, Reporting API
 *     runReport, proactive + reactive OAuth refresh,
 *     onCredentialsRefreshed callback, testConnection).
 *   - GA4 parsers (runReport row projection, traffic-sources →
 *     touchpoints, channel-group → enum mapping).
 *   - Meta Pixel hash-pii (every PII normalization rule + SHA-256
 *     hex output + appsecret_proof HMAC).
 *   - Meta Pixel client (Conversions API POST shape, test_event_code
 *     handling, projectEventForApi).
 *   - Meta Pixel provider (sendConversionEvent success + 4xx
 *     degradation).
 *   - UTM tracker (parseUtmParams, classifyChannel across 10+
 *     scenarios, extractDomain, serializeTouchpoint).
 *   - Selector dispatch (GA4 + Meta Pixel select real providers
 *     when creds match; mismatch falls back to DryRun).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

import {
  selectMarketingProvider,
  DryRunMarketingProvider,
  type MarketingCredentials,
} from "../src/lib/marketing";
import {
  GoogleAnalyticsClient,
} from "../src/lib/marketing/providers/google-analytics/client";
import { GoogleAnalyticsProvider } from "../src/lib/marketing/providers/google-analytics/provider";
import {
  projectRunReport,
  projectTrafficSources,
  mapChannelGroupToChannel,
} from "../src/lib/marketing/providers/google-analytics/parsers";
import {
  hashUserData,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeCityOrState,
  normalizeCountry,
  normalizeZip,
  sha256Hex,
  generateAppsecretProof,
} from "../src/lib/marketing/providers/meta-pixel/hash-pii";
import {
  MetaPixelClient,
  projectEventForApi,
} from "../src/lib/marketing/providers/meta-pixel/client";
import { MetaPixelProvider } from "../src/lib/marketing/providers/meta-pixel/provider";
import {
  parseUtmParams,
  classifyChannel,
  extractDomain,
  serializeTouchpoint,
} from "../src/lib/marketing/utm-tracker";

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

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

const FUTURE = Date.now() + 24 * 3600 * 1000;
const PAST = Date.now() - 60 * 1000;

function ga4Creds(over: Partial<{
  measurementId: string;
  apiSecret: string;
  propertyId: string;
  oauthAccessToken: string;
  oauthRefreshToken: string;
  oauthExpiresAt: number;
  clientId: string;
  clientSecret: string;
}> = {}) {
  return {
    provider: "google_analytics" as const,
    measurementId: over.measurementId ?? "G-TEST",
    apiSecret: over.apiSecret ?? "secret-mp",
    propertyId: over.propertyId ?? "123456",
    oauthAccessToken: over.oauthAccessToken ?? "ya29.fresh",
    oauthRefreshToken: over.oauthRefreshToken ?? "1//refresh-x",
    oauthExpiresAt: over.oauthExpiresAt ?? FUTURE,
    clientId: over.clientId ?? "client-id",
    clientSecret: over.clientSecret ?? "client-secret",
  };
}

// ===========================================================================
// 1) GA4 — Measurement Protocol
// ===========================================================================

test("GA4 client: sendEvent POSTs measurement_id + api_secret as URL params + JSON body", async () => {
  let seenUrl = "";
  let seenBody = "";
  const c = new GoogleAnalyticsClient(ga4Creds(), {
    fetch: mockFetch((url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return noContentResponse();
    }),
    backoffBaseMs: 1,
  });
  const r = await c.sendEvent({
    clientId: "ga-cookie-1",
    events: [{ name: "purchase", params: { value: 100, currency: "USD" } }],
  });
  const url = new URL(seenUrl);
  assert.equal(url.searchParams.get("measurement_id"), "G-TEST");
  assert.equal(url.searchParams.get("api_secret"), "secret-mp");
  const body = JSON.parse(seenBody);
  assert.equal(body.client_id, "ga-cookie-1");
  assert.equal(body.events[0].name, "purchase");
  assert.equal(body.events[0].params.value, 100);
  assert.equal(r.status, 204);
});

test("GA4 client: sendEvent debug mode → /debug/collect endpoint", async () => {
  let seenUrl = "";
  const c = new GoogleAnalyticsClient(ga4Creds(), {
    fetch: mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ validationMessages: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.sendEvent({
    clientId: "ga-cookie-1",
    events: [{ name: "test", params: {} }],
    validationOnly: true,
  });
  assert.match(seenUrl, /\/debug\/collect/);
});

test("GA4 client: sendEvent rejects empty events array", async () => {
  const c = new GoogleAnalyticsClient(ga4Creds(), {
    fetch: mockFetch(() => noContentResponse()),
    backoffBaseMs: 1,
  });
  await assert.rejects(
    () => c.sendEvent({ clientId: "x", events: [] }),
    /events required/,
  );
});

test("GA4 client: sendEvent rejects empty clientId", async () => {
  const c = new GoogleAnalyticsClient(ga4Creds(), {
    fetch: mockFetch(() => noContentResponse()),
    backoffBaseMs: 1,
  });
  await assert.rejects(
    () => c.sendEvent({ clientId: "", events: [{ name: "x" }] }),
    /clientId required/,
  );
});

// ===========================================================================
// 2) GA4 — Reporting Data API
// ===========================================================================

test("GA4 client: runReport POSTs Bearer token + property URL + dimension/metric body", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const c = new GoogleAnalyticsClient(ga4Creds(), {
    fetch: mockFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return jsonResponse({ rows: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.runReport({
    dimensions: ["date"],
    metrics: ["activeUsers"],
    dateRanges: [{ startDate: "2026-05-01", endDate: "2026-05-31" }],
  });
  assert.match(seenUrl, /\/properties\/123456:runReport$/);
  const headers = seenInit?.headers as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer ya29.fresh");
  const body = JSON.parse(seenInit?.body as string);
  assert.deepEqual(body.dimensions, [{ name: "date" }]);
  assert.deepEqual(body.metrics, [{ name: "activeUsers" }]);
});

test("GA4 client: getActiveUsers / getConversions / getTrafficSources call runReport", async () => {
  const seenBodies: string[] = [];
  const c = new GoogleAnalyticsClient(ga4Creds(), {
    fetch: mockFetch((_url, init) => {
      seenBodies.push(init?.body as string);
      return jsonResponse({ rows: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.getActiveUsers({ startDate: "2026-05-01", endDate: "2026-05-07" });
  await c.getConversions({ startDate: "2026-05-01", endDate: "2026-05-07" });
  await c.getTrafficSources({ startDate: "2026-05-01", endDate: "2026-05-07" });
  assert.equal(seenBodies.length, 3);
  assert.match(seenBodies[0], /activeUsers/);
  assert.match(seenBodies[1], /conversions/);
  assert.match(seenBodies[2], /sessionSource/);
});

// ===========================================================================
// 3) GA4 — OAuth refresh (proactive + reactive)
// ===========================================================================

test("GA4 client: proactive refresh fires when token within margin of expiry", async () => {
  let refreshHits = 0;
  let reportHits = 0;
  const fetchImpl = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) {
      refreshHits++;
      return jsonResponse({
        access_token: "ya29.NEW-TOKEN",
        refresh_token: "1//rotated-refresh",
        expires_in: 3600,
        scope: "analytics.readonly",
        token_type: "Bearer",
      });
    }
    if (url.includes("runReport")) {
      reportHits++;
      return jsonResponse({ rows: [] });
    }
    return new Response("unexpected", { status: 500 });
  });

  let persistedNext: { oauthAccessToken: string; oauthExpiresAt: number } | null = null;
  const c = new GoogleAnalyticsClient(ga4Creds({ oauthExpiresAt: PAST }), {
    fetch: fetchImpl,
    backoffBaseMs: 1,
    onCredentialsRefreshed: (next) => {
      persistedNext = {
        oauthAccessToken: next.oauthAccessToken,
        oauthExpiresAt: next.oauthExpiresAt,
      };
    },
  });
  await c.runReport({
    dimensions: ["date"],
    metrics: ["activeUsers"],
    dateRanges: [{ startDate: "2026-05-01", endDate: "2026-05-07" }],
  });
  assert.equal(refreshHits, 1, "proactive refresh fired exactly once");
  assert.equal(reportHits, 1, "report fired after refresh");
  assert.ok(persistedNext, "onCredentialsRefreshed callback invoked");
  const captured = persistedNext as {
    oauthAccessToken: string;
    oauthExpiresAt: number;
  };
  assert.equal(captured.oauthAccessToken, "ya29.NEW-TOKEN");
});

test("GA4 client: reactive 401 mid-flight triggers refresh + single retry", async () => {
  let refreshHits = 0;
  let reportHits = 0;
  const fetchImpl = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com")) {
      refreshHits++;
      return jsonResponse({
        access_token: "ya29.refreshed",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    if (url.includes("runReport")) {
      reportHits++;
      return reportHits === 1
        ? new Response("unauthorized", { status: 401 })
        : jsonResponse({ rows: [] });
    }
    return new Response("unexpected", { status: 500 });
  });
  const c = new GoogleAnalyticsClient(
    ga4Creds({ oauthExpiresAt: FUTURE }), // proactive check passes
    { fetch: fetchImpl, backoffBaseMs: 1 },
  );
  await c.runReport({
    dimensions: ["date"],
    metrics: ["activeUsers"],
    dateRanges: [{ startDate: "2026-05-01", endDate: "2026-05-07" }],
  });
  assert.equal(refreshHits, 1);
  assert.equal(reportHits, 2, "first 401 then second success");
});

test("GA4 client: refresh requires clientId + clientSecret + refreshToken", async () => {
  const c = new GoogleAnalyticsClient(
    {
      provider: "google_analytics",
      measurementId: "G-TEST",
      apiSecret: "s",
      propertyId: "1",
      oauthAccessToken: "x",
      oauthExpiresAt: PAST, // forces refresh
    },
    {
      fetch: mockFetch(() => jsonResponse({})),
      backoffBaseMs: 1,
    },
  );
  await assert.rejects(
    () =>
      c.runReport({
        dimensions: ["date"],
        metrics: ["activeUsers"],
        dateRanges: [{ startDate: "2026-05-01", endDate: "2026-05-07" }],
      }),
    /refresh requires/,
  );
});

test("GA4 client: missing oauthAccessToken throws on Reporting API", async () => {
  const c = new GoogleAnalyticsClient(
    {
      provider: "google_analytics",
      measurementId: "G-T",
      apiSecret: "s",
      propertyId: "1",
    },
    { fetch: mockFetch(() => jsonResponse({})), backoffBaseMs: 1 },
  );
  await assert.rejects(
    () =>
      c.runReport({
        dimensions: ["date"],
        metrics: ["activeUsers"],
        dateRanges: [{ startDate: "2026-05-01", endDate: "2026-05-07" }],
      }),
    /oauthAccessToken required/,
  );
});

// ===========================================================================
// 4) GA4 — parsers
// ===========================================================================

test("projectRunReport: maps dimension + metric headers to row records", () => {
  const body = JSON.stringify({
    dimensionHeaders: [{ name: "date" }, { name: "sessionSource" }],
    metricHeaders: [{ name: "sessions" }, { name: "conversions" }],
    rows: [
      {
        dimensionValues: [{ value: "20260501" }, { value: "google" }],
        metricValues: [{ value: "120" }, { value: "5" }],
      },
    ],
  });
  const out = projectRunReport(body);
  assert.deepEqual(out.dimensions, ["date", "sessionSource"]);
  assert.deepEqual(out.metrics, ["sessions", "conversions"]);
  assert.equal(out.rows[0].date, "20260501");
  assert.equal(out.rows[0].sessionSource, "google");
  assert.equal(out.rows[0].sessions, "120");
  assert.equal(out.rows[0].conversions, "5");
});

test("projectRunReport: malformed JSON returns empty", () => {
  const out = projectRunReport("not-json");
  assert.deepEqual(out.rows, []);
});

test("projectTrafficSources: projects rows + maps channel groups", () => {
  const body = JSON.stringify({
    dimensionHeaders: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionDefaultChannelGroup" },
    ],
    metricHeaders: [{ name: "sessions" }],
    rows: [
      {
        dimensionValues: [
          { value: "google" },
          { value: "cpc" },
          { value: "Paid Search" },
        ],
        metricValues: [{ value: "100" }],
      },
      {
        dimensionValues: [
          { value: "(direct)" },
          { value: "(none)" },
          { value: "Direct" },
        ],
        metricValues: [{ value: "200" }],
      },
    ],
  });
  const startDate = new Date("2026-05-01T00:00:00Z");
  const out = projectTrafficSources(body, startDate);
  assert.equal(out.length, 2);
  assert.equal(out[0].source, "google");
  assert.equal(out[0].channel, "paid_search");
  assert.equal(out[1].channel, "direct");
});

test("mapChannelGroupToChannel: covers GA4's default groups", () => {
  assert.equal(mapChannelGroupToChannel("Paid Search"), "paid_search");
  assert.equal(mapChannelGroupToChannel("Organic Search"), "organic_search");
  assert.equal(mapChannelGroupToChannel("Paid Social"), "paid_social");
  assert.equal(mapChannelGroupToChannel("Organic Social"), "organic_social");
  assert.equal(mapChannelGroupToChannel("Email"), "email");
  assert.equal(mapChannelGroupToChannel("Display"), "display");
  assert.equal(mapChannelGroupToChannel("Video"), "video");
  assert.equal(mapChannelGroupToChannel("Affiliates"), "affiliate");
  assert.equal(mapChannelGroupToChannel("Referral"), "referral");
  assert.equal(mapChannelGroupToChannel("Direct"), "direct");
  assert.equal(mapChannelGroupToChannel("Unassigned"), "other");
});

// ===========================================================================
// 5) GA4 — provider
// ===========================================================================

test("GoogleAnalyticsProvider: sendConversionEvent shape + idempotency via transaction_id", async () => {
  let seenBody = "";
  const provider = new GoogleAnalyticsProvider(ga4Creds(), {
    fetch: mockFetch((_url, init) => {
      seenBody = init?.body as string;
      return noContentResponse();
    }),
    backoffBaseMs: 1,
  });
  const r = await provider.sendConversionEvent({
    eventName: "purchase",
    clientId: "ga-cookie-1",
    eventValue: 100,
    currency: "USD",
    eventId: "INV-2026-001",
  });
  assert.equal(r.success, true);
  const body = JSON.parse(seenBody);
  assert.equal(body.events[0].params.value, 100);
  assert.equal(body.events[0].params.currency, "USD");
  assert.equal(body.events[0].params.transaction_id, "INV-2026-001");
  assert.equal(r.externalEventId, "INV-2026-001");
});

test("GoogleAnalyticsProvider: sendConversionEvent without clientId returns failure", async () => {
  const provider = new GoogleAnalyticsProvider(ga4Creds(), {
    fetch: mockFetch(() => noContentResponse()),
    backoffBaseMs: 1,
  });
  const r = await provider.sendConversionEvent({
    eventName: "purchase",
    clientId: "",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /clientId required/);
});

test("GoogleAnalyticsProvider: testConnection returns connected=true on 200", async () => {
  const provider = new GoogleAnalyticsProvider(ga4Creds(), {
    fetch: mockFetch(() => jsonResponse({ rows: [] })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
});

test("GoogleAnalyticsProvider: pullAnalyticsTouchpoints projects traffic-sources rows", async () => {
  const provider = new GoogleAnalyticsProvider(ga4Creds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        dimensionHeaders: [
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionDefaultChannelGroup" },
        ],
        metricHeaders: [{ name: "sessions" }],
        rows: [
          {
            dimensionValues: [{ value: "google" }, { value: "organic" }, { value: "Organic Search" }],
            metricValues: [{ value: "100" }],
          },
        ],
      }),
    ),
    backoffBaseMs: 1,
  });
  const since = new Date("2026-05-01T00:00:00Z");
  const until = new Date("2026-05-07T00:00:00Z");
  const out = await provider.pullAnalyticsTouchpoints({ since, until });
  assert.equal(out.length, 1);
  assert.equal(out[0].channel, "organic_search");
});

test("GoogleAnalyticsProvider: webhooks fail-closed (GA4 is pull-only via Reporting API)", () => {
  const provider = new GoogleAnalyticsProvider(ga4Creds());
  assert.equal(provider.verifyWebhook("payload", "sig", "secret"), false);
  assert.equal(provider.parseWebhook({}), null);
});

// ===========================================================================
// 6) Meta Pixel — PII hashing (load-bearing)
// ===========================================================================

test("normalizeEmail: lowercases + trims", () => {
  assert.equal(normalizeEmail("  Foo@Bar.com  "), "foo@bar.com");
});

test("normalizePhone: strips non-digits including +", () => {
  assert.equal(normalizePhone("+1 (415) 555-0100"), "14155550100");
  assert.equal(normalizePhone("415.555.0100"), "4155550100");
});

test("normalizeName: lowercase + trim", () => {
  assert.equal(normalizeName("  Alice  "), "alice");
});

test("normalizeCityOrState: lowercase + strip non-alphanumeric", () => {
  assert.equal(normalizeCityOrState("San Francisco"), "sanfrancisco");
  assert.equal(normalizeCityOrState("New York!"), "newyork");
});

test("normalizeCountry: ISO-3166-1 alpha-2 lowercase", () => {
  assert.equal(normalizeCountry("US"), "us");
  assert.equal(normalizeCountry("united states"), "un"); // first 2 chars
});

test("normalizeZip: strip whitespace + lowercase", () => {
  assert.equal(normalizeZip("  94103 "), "94103");
});

test("sha256Hex: produces 64-char lowercase hex", () => {
  const h = sha256Hex("foo@bar.com");
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]+$/);
});

test("sha256Hex: empty input returns empty string (not the empty-hash)", () => {
  assert.equal(sha256Hex(""), "");
});

test("hashUserData: hashes every PII field individually + omits empty", () => {
  const out = hashUserData({
    email: "Foo@Bar.com",
    phone: "+1 (415) 555-0100",
    firstName: "Alice",
    lastName: "Smith",
    city: "San Francisco",
    state: "California",
    country: "us",
    zip: "94103",
  });
  // Each PII field becomes an array of one hash.
  assert.equal(out.em![0], sha256Hex("foo@bar.com"));
  assert.equal(out.ph![0], sha256Hex("14155550100"));
  assert.equal(out.fn![0], sha256Hex("alice"));
  assert.equal(out.ln![0], sha256Hex("smith"));
  assert.equal(out.ct![0], sha256Hex("sanfrancisco"));
  assert.equal(out.st![0], sha256Hex("california"));
  assert.equal(out.country![0], sha256Hex("us"));
  assert.equal(out.zp![0], sha256Hex("94103"));
});

test("hashUserData: missing fields omitted (NOT hashed-empty-string)", () => {
  const out = hashUserData({ email: "x@y.com" });
  assert.ok(out.em);
  assert.equal(out.ph, undefined);
  assert.equal(out.fn, undefined);
  assert.equal(out.country, undefined);
});

test("hashUserData: passes through non-PII fields un-hashed (fbp, fbc, IP, UA)", () => {
  const out = hashUserData({
    fbp: "fb.1.123.abc",
    fbc: "fb.1.456.def",
    clientIpAddress: "203.0.113.42",
    clientUserAgent: "Mozilla/5.0",
  });
  assert.equal(out.fbp, "fb.1.123.abc");
  assert.equal(out.fbc, "fb.1.456.def");
  assert.equal(out.client_ip_address, "203.0.113.42");
  assert.equal(out.client_user_agent, "Mozilla/5.0");
});

test("generateAppsecretProof: HMAC-SHA256 of access token keyed with app secret", () => {
  const expected = createHmac("sha256", "app-secret")
    .update("token-abc")
    .digest("hex");
  assert.equal(generateAppsecretProof("token-abc", "app-secret"), expected);
});

// ===========================================================================
// 7) Meta Pixel — client + projectEventForApi
// ===========================================================================

test("projectEventForApi: hashes user_data + propagates event_id + custom_data", () => {
  const out = projectEventForApi({
    eventName: "Purchase",
    eventTime: 1735689600,
    eventId: "INV-2026-001",
    actionSource: "website",
    eventSourceUrl: "https://example.com/thanks",
    userData: { email: "Foo@Bar.com" },
    customData: { value: 100, currency: "USD" },
  });
  assert.equal(out.event_name, "Purchase");
  assert.equal(out.event_time, 1735689600);
  assert.equal(out.event_id, "INV-2026-001");
  assert.equal(out.action_source, "website");
  assert.equal(out.event_source_url, "https://example.com/thanks");
  assert.equal(out.user_data.em![0], sha256Hex("foo@bar.com"));
  assert.deepEqual(out.custom_data, { value: 100, currency: "USD" });
});

test("MetaPixelClient: sendEvents POSTs to /v18.0/{pixel_id}/events with hashed user_data", async () => {
  let seenUrl = "";
  let seenBody = "";
  const c = new MetaPixelClient(
    {
      provider: "meta_pixel",
      pixelId: "1234567890",
      accessToken: "EAAlive",
    },
    {
      fetch: mockFetch((url, init) => {
        seenUrl = url;
        seenBody = init?.body as string;
        return jsonResponse({ events_received: 1, fbtrace_id: "trace-1" });
      }),
      backoffBaseMs: 1,
    },
  );
  await c.sendEvents([
    {
      eventName: "Purchase",
      eventTime: 1700000000,
      userData: { email: "user@example.com" },
      customData: { value: 100, currency: "USD" },
    },
  ]);
  const url = new URL(seenUrl);
  assert.match(url.pathname, /\/v18\.0\/1234567890\/events$/);
  assert.equal(url.searchParams.get("access_token"), "EAAlive");
  // body shape
  const body = JSON.parse(seenBody);
  assert.equal(body.data[0].event_name, "Purchase");
  assert.equal(body.data[0].user_data.em[0], sha256Hex("user@example.com"));
  assert.deepEqual(body.data[0].custom_data, { value: 100, currency: "USD" });
});

test("MetaPixelClient: sendEvents adds appsecret_proof when app_secret configured", async () => {
  let seenUrl = "";
  const c = new MetaPixelClient(
    {
      provider: "meta_pixel",
      pixelId: "1",
      accessToken: "tok",
      appSecret: "app-secret",
    },
    {
      fetch: mockFetch((url) => {
        seenUrl = url;
        return jsonResponse({ events_received: 1 });
      }),
      backoffBaseMs: 1,
    },
  );
  await c.sendEvents([
    {
      eventName: "Lead",
      userData: { email: "x@y.com" },
    },
  ]);
  const url = new URL(seenUrl);
  const expected = createHmac("sha256", "app-secret")
    .update("tok")
    .digest("hex");
  assert.equal(url.searchParams.get("appsecret_proof"), expected);
});

test("MetaPixelClient: sendEvents propagates test_event_code in body", async () => {
  let seenBody = "";
  const c = new MetaPixelClient(
    {
      provider: "meta_pixel",
      pixelId: "1",
      accessToken: "t",
      testEventCode: "TEST123",
    },
    {
      fetch: mockFetch((_url, init) => {
        seenBody = init?.body as string;
        return jsonResponse({});
      }),
      backoffBaseMs: 1,
    },
  );
  await c.sendEvents([
    {
      eventName: "Lead",
      userData: { externalId: "u-1" },
    },
  ]);
  const body = JSON.parse(seenBody);
  assert.equal(body.test_event_code, "TEST123");
});

test("MetaPixelClient: sendEvents rejects empty events array", async () => {
  const c = new MetaPixelClient(
    { provider: "meta_pixel", pixelId: "1", accessToken: "t" },
    { fetch: mockFetch(() => jsonResponse({})), backoffBaseMs: 1 },
  );
  await assert.rejects(() => c.sendEvents([]), /events required/);
});

test("MetaPixelClient: testConnection fires PageView with externalId", async () => {
  let seenBody = "";
  const c = new MetaPixelClient(
    {
      provider: "meta_pixel",
      pixelId: "1",
      accessToken: "t",
      testEventCode: "TEST123",
    },
    {
      fetch: mockFetch((_url, init) => {
        seenBody = init?.body as string;
        return jsonResponse({ events_received: 1 });
      }),
      backoffBaseMs: 1,
    },
  );
  await c.testConnection();
  const body = JSON.parse(seenBody);
  assert.equal(body.data[0].event_name, "PageView");
  assert.ok(body.data[0].user_data.external_id);
});

// ===========================================================================
// 8) Meta Pixel — provider
// ===========================================================================

test("MetaPixelProvider: sendConversionEvent succeeds + returns fbtrace_id when present", async () => {
  const provider = new MetaPixelProvider(
    { provider: "meta_pixel", pixelId: "1", accessToken: "t" },
    {
      fetch: mockFetch(() =>
        jsonResponse({ events_received: 1, fbtrace_id: "trace-xyz" }),
      ),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.sendConversionEvent({
    eventName: "Purchase",
    clientId: "fbp_client_x",
    eventValue: 100,
    currency: "USD",
    eventId: "evt-1",
  });
  assert.equal(r.success, true);
  assert.equal(r.externalEventId, "trace-xyz");
});

test("MetaPixelProvider: sendConversionEvent degrades gracefully on 4xx", async () => {
  const provider = new MetaPixelProvider(
    { provider: "meta_pixel", pixelId: "1", accessToken: "t" },
    {
      fetch: mockFetch(() => new Response("invalid token", { status: 400 })),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.sendConversionEvent({
    eventName: "Lead",
    clientId: "x",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /HTTP 400/);
});

test("MetaPixelProvider: testConnection returns events_received from response", async () => {
  const provider = new MetaPixelProvider(
    { provider: "meta_pixel", pixelId: "1", accessToken: "t" },
    {
      fetch: mockFetch(() => jsonResponse({ events_received: 1 })),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["eventsReceived"], 1);
});

test("MetaPixelProvider: webhooks fail-closed", () => {
  const provider = new MetaPixelProvider({
    provider: "meta_pixel",
    pixelId: "1",
    accessToken: "t",
  });
  assert.equal(provider.verifyWebhook("payload", "sig", "secret"), false);
  assert.equal(provider.parseWebhook({}), null);
});

// ===========================================================================
// 9) UTM tracker — pure helpers
// ===========================================================================

test("parseUtmParams: extracts utm_source/medium/campaign/content/term from full URL", () => {
  const url =
    "https://example.com/landing?utm_source=google&utm_medium=cpc&utm_campaign=spring2026&utm_content=banner&utm_term=villa+bali";
  const out = parseUtmParams(url);
  assert.equal(out.source, "google");
  assert.equal(out.medium, "cpc");
  assert.equal(out.campaign, "spring2026");
  assert.equal(out.content, "banner");
  assert.equal(out.term, "villa bali");
});

test("parseUtmParams: accepts bare query string without leading ?", () => {
  const out = parseUtmParams("utm_source=facebook&utm_medium=social");
  assert.equal(out.source, "facebook");
  assert.equal(out.medium, "social");
});

test("parseUtmParams: empty string fields are dropped", () => {
  const out = parseUtmParams("?utm_source=&utm_medium=cpc");
  assert.equal(out.source, undefined);
  assert.equal(out.medium, "cpc");
});

test("parseUtmParams: empty input returns empty object", () => {
  assert.deepEqual(parseUtmParams(""), {});
});

test("classifyChannel: utm_medium=cpc → paid_search", () => {
  assert.equal(classifyChannel({ utm: { medium: "cpc" } }), "paid_search");
});

test("classifyChannel: utm_medium=email → email", () => {
  assert.equal(classifyChannel({ utm: { medium: "email" } }), "email");
});

test("classifyChannel: utm_medium=social → organic_social by default", () => {
  assert.equal(
    classifyChannel({ utm: { medium: "social", source: "facebook" } }),
    "organic_social",
  );
});

test("classifyChannel: utm_medium=social + source containing 'ads' → paid_social", () => {
  assert.equal(
    classifyChannel({ utm: { medium: "social", source: "facebook_ads" } }),
    "paid_social",
  );
});

test("classifyChannel: no UTM, referrer = google.com → organic_search", () => {
  assert.equal(
    classifyChannel({ referrer: "https://www.google.com/search?q=bali" }),
    "organic_search",
  );
});

test("classifyChannel: no UTM, referrer = facebook.com → organic_social", () => {
  assert.equal(
    classifyChannel({ referrer: "https://www.facebook.com/" }),
    "organic_social",
  );
});

test("classifyChannel: no UTM, no referrer → direct", () => {
  assert.equal(classifyChannel({}), "direct");
});

test("classifyChannel: self-referral (same domain) → direct", () => {
  assert.equal(
    classifyChannel({
      referrer: "https://example.com/about",
      landingUrl: "https://example.com/villa",
    }),
    "direct",
  );
});

test("classifyChannel: foreign referral domain → referral", () => {
  assert.equal(
    classifyChannel({ referrer: "https://blog.partner.com/post" }),
    "referral",
  );
});

test("classifyChannel: utm_medium=organic → organic_search", () => {
  assert.equal(classifyChannel({ utm: { medium: "organic" } }), "organic_search");
});

test("classifyChannel: utm_source=google_ads without medium → paid_search", () => {
  assert.equal(
    classifyChannel({ utm: { source: "google_ads" } }),
    "paid_search",
  );
});

test("extractDomain: strips www + lowercases", () => {
  assert.equal(extractDomain("https://www.Example.com/path"), "example.com");
  assert.equal(extractDomain("https://api.wise.com/v1"), "api.wise.com");
});

test("extractDomain: bad input returns undefined", () => {
  assert.equal(extractDomain("not-a-url"), undefined);
  assert.equal(extractDomain(""), undefined);
});

test("serializeTouchpoint: defaults touchpointAt to now + computes channel", () => {
  const before = Date.now();
  const out = serializeTouchpoint({
    utm: { source: "google", medium: "cpc" },
    referrer: "https://www.google.com/",
    landingUrl: "https://example.com/villa",
    sessionId: "s-1",
  });
  const after = Date.now();
  assert.ok(out.touchpointAt.getTime() >= before);
  assert.ok(out.touchpointAt.getTime() <= after);
  assert.equal(out.channel, "paid_search");
  assert.equal(out.source, "google");
  assert.equal(out.medium, "cpc");
  assert.equal(out.sessionId, "s-1");
});

// ===========================================================================
// 10) Selector dispatch
// ===========================================================================

test("selectMarketingProvider: google_analytics creds → GoogleAnalyticsProvider", () => {
  const creds: MarketingCredentials = ga4Creds();
  const p = selectMarketingProvider("google_analytics", creds);
  assert.ok(p instanceof GoogleAnalyticsProvider);
  assert.ok(!(p instanceof DryRunMarketingProvider));
});

test("selectMarketingProvider: meta_pixel creds → MetaPixelProvider", () => {
  const creds: MarketingCredentials = {
    provider: "meta_pixel",
    pixelId: "1",
    accessToken: "t",
  };
  const p = selectMarketingProvider("meta_pixel", creds);
  assert.ok(p instanceof MetaPixelProvider);
});

test("selectMarketingProvider: GA4 requested + meta_pixel creds → DryRun (mismatch)", () => {
  const creds: MarketingCredentials = {
    provider: "meta_pixel",
    pixelId: "1",
    accessToken: "t",
  };
  const p = selectMarketingProvider("google_analytics", creds);
  assert.ok(p instanceof DryRunMarketingProvider);
});

test("selectMarketingProvider: GA4 + Meta Pixel without creds → DryRun", () => {
  const a = selectMarketingProvider("google_analytics", null);
  const b = selectMarketingProvider("meta_pixel", null);
  assert.ok(a instanceof DryRunMarketingProvider);
  assert.ok(b instanceof DryRunMarketingProvider);
});

// Reference unused imports to keep them in the import graph (some
// linters strip unused imports; we want the lookup table preserved
// for future expansion).
void createHash;

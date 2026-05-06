/**
 * Stage 6.P1.C — Airbnb provider tests + shared HTTP retry tests.
 *
 * Covers:
 *   - Shared http-retry envelope (extracted from P1.B)
 *   - OAuth2 refresh helper (success / non-2xx / malformed / token rotation)
 *   - Airbnb JSON mappers (availability/rates/amenities outbound,
 *     reservation inbound, status mapping edge cases)
 *   - AirbnbClient (auth header, dispatch, auto-refresh on expiry,
 *     401-mid-flight refresh+retry, retry/backoff/429/5xx)
 *   - AirbnbProvider (push methods, pullReservations projection,
 *     webhook verify + parse, testConnection)
 *   - Selector integration (P1.C promotion of airbnb)
 *
 * No real network: AirbnbClient + helpers all take an injectable fetch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { requestWithRetry } from "../src/lib/channel-manager/http-retry";
import { refreshAirbnbToken } from "../src/lib/oauth/airbnb";
import {
  mapInternalAvailabilityToAirbnb,
  mapInternalRatesToAirbnb,
  mapAmenitiesToAirbnb,
  mapAirbnbReservationToInternal,
  mapAirbnbStatusToInternal,
} from "../src/lib/channel-manager/providers/airbnb/mappers";
import { AirbnbClient } from "../src/lib/channel-manager/providers/airbnb/client";
import { AirbnbProvider } from "../src/lib/channel-manager/providers/airbnb/provider";
import { selectChannelProvider } from "../src/lib/channel-manager";
import { DryRunChannelProvider } from "../src/lib/channel-manager";

// ===========================================================================
// Test helpers
// ===========================================================================

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  return async (url: string | URL | Request, init?: RequestInit) => {
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

function freshCreds(overrides: Partial<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  listingId: string;
}> = {}) {
  return {
    channel: "airbnb" as const,
    accessToken: overrides.accessToken ?? "fresh-access",
    refreshToken: overrides.refreshToken ?? "refresh-1",
    expiresAt: overrides.expiresAt ?? FUTURE,
    listingId: overrides.listingId ?? "listing-42",
  };
}

// ===========================================================================
// 1) Shared http-retry envelope
// ===========================================================================

test("http-retry: returns 2xx body + apiCallsCount=1 on first-try success", async () => {
  const res = await requestWithRetry(
    "https://example.test/x",
    { method: "GET" },
    {
      fetch: mockFetch(() => new Response("ok", { status: 200 })),
      backoffBaseMs: 1,
    },
  );
  assert.equal(res.status, 200);
  assert.equal(res.body, "ok");
  assert.equal(res.apiCallsCount, 1);
});

test("http-retry: 429 retries with backoff up to maxRetries", async () => {
  let calls = 0;
  const res = await requestWithRetry(
    "https://example.test/x",
    { method: "GET" },
    {
      fetch: mockFetch(() => {
        calls++;
        if (calls < 3) return new Response("nope", { status: 429 });
        return new Response("ok", { status: 200 });
      }),
      backoffBaseMs: 1,
      maxRetries: 3,
    },
  );
  assert.equal(res.status, 200);
  assert.equal(res.apiCallsCount, 3);
});

test("http-retry: 5xx retries; final 5xx returned (no throw)", async () => {
  let calls = 0;
  const res = await requestWithRetry(
    "https://example.test/x",
    { method: "GET" },
    {
      fetch: mockFetch(() => {
        calls++;
        return new Response("err", { status: 503 });
      }),
      backoffBaseMs: 1,
      maxRetries: 3,
    },
  );
  assert.equal(res.status, 503);
  assert.equal(res.apiCallsCount, 3);
  assert.equal(calls, 3);
});

test("http-retry: 4xx (other than 429) returns immediately, no retry", async () => {
  let calls = 0;
  const res = await requestWithRetry(
    "https://example.test/x",
    { method: "GET" },
    {
      fetch: mockFetch(() => {
        calls++;
        return new Response("bad", { status: 400 });
      }),
      backoffBaseMs: 1,
      maxRetries: 3,
    },
  );
  assert.equal(res.status, 400);
  assert.equal(calls, 1);
});

test("http-retry: thrown fetch error retries then throws after maxRetries", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      requestWithRetry(
        "https://example.test/x",
        { method: "GET" },
        {
          fetch: mockFetch(() => {
            calls++;
            throw new Error("network down");
          }),
          backoffBaseMs: 1,
          maxRetries: 3,
        },
      ),
    /failed after 3 attempts/,
  );
  assert.equal(calls, 3);
});

test("http-retry: beforeAttempt hook fires before each call", async () => {
  const seen: number[] = [];
  await requestWithRetry(
    "https://example.test/x",
    { method: "GET" },
    {
      fetch: mockFetch(() => new Response("ok", { status: 200 })),
      backoffBaseMs: 1,
      beforeAttempt: (attempt) => {
        seen.push(attempt);
      },
    },
  );
  assert.deepEqual(seen, [0]);
});

// ===========================================================================
// 2) OAuth2 refresh helper
// ===========================================================================

test("oauth: refreshAirbnbToken success returns access + expiresAt", async () => {
  const result = await refreshAirbnbToken({
    refreshToken: "r1",
    fetch: mockFetch(() =>
      jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    ),
  });
  assert.equal(result.accessToken, "new-access");
  assert.equal(result.refreshToken, "new-refresh");
  assert.ok(result.expiresAt > Date.now());
  assert.ok(result.expiresAt <= Date.now() + 3600 * 1000 + 100);
});

test("oauth: refreshAirbnbToken omits refreshToken when Airbnb doesn't rotate", async () => {
  const result = await refreshAirbnbToken({
    refreshToken: "r1",
    fetch: mockFetch(() =>
      jsonResponse({
        access_token: "new-access",
        expires_in: 1800,
      }),
    ),
  });
  assert.equal(result.refreshToken, undefined);
});

test("oauth: refreshAirbnbToken throws on missing refreshToken", async () => {
  await assert.rejects(() => refreshAirbnbToken({ refreshToken: "" }));
});

test("oauth: refreshAirbnbToken throws on non-2xx", async () => {
  await assert.rejects(
    () =>
      refreshAirbnbToken({
        refreshToken: "r1",
        fetch: mockFetch(() => new Response("denied", { status: 401 })),
      }),
    /HTTP 401/,
  );
});

test("oauth: refreshAirbnbToken throws on missing access_token in response", async () => {
  await assert.rejects(
    () =>
      refreshAirbnbToken({
        refreshToken: "r1",
        fetch: mockFetch(() => jsonResponse({ expires_in: 3600 })),
      }),
    /missing access_token/,
  );
});

test("oauth: refreshAirbnbToken throws on missing expires_in", async () => {
  await assert.rejects(
    () =>
      refreshAirbnbToken({
        refreshToken: "r1",
        fetch: mockFetch(() => jsonResponse({ access_token: "x" })),
      }),
    /missing valid expires_in/,
  );
});

test("oauth: refreshAirbnbToken throws on non-JSON response", async () => {
  await assert.rejects(
    () =>
      refreshAirbnbToken({
        refreshToken: "r1",
        fetch: mockFetch(() => new Response("not json", { status: 200 })),
      }),
    /non-JSON/,
  );
});

// ===========================================================================
// 3) Airbnb mappers
// ===========================================================================

test("mapper: mapInternalAvailabilityToAirbnb sorts by date and emits available flag", () => {
  const body = mapInternalAvailabilityToAirbnb({
    villaId: "v",
    externalPropertyId: "L1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([
      ["2026-05-03", 0],
      ["2026-05-01", 1],
      ["2026-05-02", 1],
    ]),
  });
  assert.equal(body.listing_id, "L1");
  assert.deepEqual(body.days.map((d) => d.date), [
    "2026-05-01",
    "2026-05-02",
    "2026-05-03",
  ]);
  assert.equal(body.days[0].available, true);
  assert.equal(body.days[2].available, false);
  assert.equal(body.days[2].reason, "external_block");
  assert.equal(body.days[0].reason, undefined);
});

test("mapper: mapInternalRatesToAirbnb converts minor → major and preserves currency", () => {
  const body = mapInternalRatesToAirbnb({
    villaId: "v",
    externalPropertyId: "L1",
    ratePlanId: "rp",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 25050n, currency: "USD", minStay: 2 }],
      ["2026-05-02", { amountMinor: 30000n, currency: "USD" }],
    ]),
  });
  assert.equal(body.daily_prices.length, 2);
  assert.equal(body.daily_prices[0].native_price, 250.5);
  assert.equal(body.daily_prices[0].native_currency, "USD");
  assert.equal(body.daily_prices[0].min_nights, 2);
  assert.equal(body.daily_prices[1].native_price, 300);
});

test("mapper: mapAmenitiesToAirbnb wraps amenities array with listing_id", () => {
  const body = mapAmenitiesToAirbnb("L1", ["pool", "wifi", "parking"]);
  assert.equal(body.listing_id, "L1");
  assert.deepEqual(body.amenities, ["pool", "wifi", "parking"]);
});

test("mapper: mapAirbnbReservationToInternal projects all key fields", () => {
  const r = mapAirbnbReservationToInternal({
    confirmation_code: "HMABC123",
    status: "accept",
    start_date: "2026-06-01",
    end_date: "2026-06-08",
    number_of_adults: 2,
    number_of_children: 1,
    guest: {
      first_name: "Alice",
      last_name: "Tester",
      email: "alice@example.com",
      phone: "+1-555-0100",
      country: "US",
    },
    pricing_quote: {
      total_paid_amount_accurate: 1234.56,
      currency: "USD",
      tax_amount: 50,
      airbnb_service_fee: 25,
      airbnb_host_fee: 100,
    },
    submitted_at: "2026-04-30T08:00:00Z",
    special_requests: "Late check-in",
  });
  assert.ok(r);
  assert.equal(r!.externalReservationId, "HMABC123");
  assert.equal(r!.externalStatus, "accept");
  assert.equal(r!.adults, 2);
  assert.equal(r!.children, 1);
  assert.equal(r!.totalAmountMinor, 123456n);
  assert.equal(r!.currency, "USD");
  assert.equal(r!.taxesMinor, 5000n);
  assert.equal(r!.serviceFeesMinor, 2500n);
  assert.equal(r!.commissionMinor, 10000n);
  assert.equal(r!.guest.firstName, "Alice");
  assert.equal(r!.guest.email, "alice@example.com");
  assert.equal(r!.specialRequests, "Late check-in");
  assert.equal(r!.paymentCollectedBy, "channel");
});

test("mapper: mapAirbnbReservationToInternal accepts full_name fallback for guest", () => {
  const r = mapAirbnbReservationToInternal({
    confirmation_code: "HM1",
    start_date: "2026-06-01",
    end_date: "2026-06-02",
    guest: { full_name: "Bob Smith Jr" },
  });
  assert.ok(r);
  assert.equal(r!.guest.firstName, "Bob");
  assert.equal(r!.guest.lastName, "Smith Jr");
});

test("mapper: mapAirbnbReservationToInternal returns null on missing id or dates", () => {
  assert.equal(mapAirbnbReservationToInternal({}), null);
  assert.equal(
    mapAirbnbReservationToInternal({ confirmation_code: "X" }),
    null,
  );
  assert.equal(
    mapAirbnbReservationToInternal({
      confirmation_code: "X",
      start_date: "2026-06-01",
    }),
    null,
  );
});

test("mapper: mapAirbnbStatusToInternal handles all documented statuses", () => {
  assert.equal(mapAirbnbStatusToInternal("accept"), "confirmed");
  assert.equal(mapAirbnbStatusToInternal("accepted"), "confirmed");
  assert.equal(mapAirbnbStatusToInternal("request"), "received");
  assert.equal(mapAirbnbStatusToInternal("alteration"), "modified");
  assert.equal(mapAirbnbStatusToInternal("cancellation_by_host"), "cancelled");
  assert.equal(mapAirbnbStatusToInternal("cancellation_by_guest"), "cancelled");
  assert.equal(mapAirbnbStatusToInternal("no_show"), "no_show");
  assert.equal(mapAirbnbStatusToInternal("checkout_complete"), "completed");
  assert.equal(mapAirbnbStatusToInternal(undefined), "received");
  assert.equal(mapAirbnbStatusToInternal("future_unknown_state"), "received");
});

// ===========================================================================
// 4) AirbnbClient
// ===========================================================================

test("client: GET request includes Bearer auth + Accept JSON", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const client = new AirbnbClient(freshCreds(), {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ ok: true });
    }),
    backoffBaseMs: 1,
  });
  await client.testConnection();
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer fresh-access");
  assert.equal(headers["Accept"], "application/json");
  assert.match(captured.url ?? "", /\/test_authentication$/);
});

test("client: PUT pricing serializes daily_prices in body", async () => {
  let bodySeen = "";
  const client = new AirbnbClient(freshCreds(), {
    fetch: mockFetch((_, init) => {
      bodySeen = init?.body as string;
      return jsonResponse({ ok: true });
    }),
    backoffBaseMs: 1,
  });
  await client.pushPricing({
    villaId: "v",
    externalPropertyId: "L1",
    ratePlanId: "rp",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 30000n, currency: "USD" }],
    ]),
  });
  const parsed = JSON.parse(bodySeen);
  assert.equal(parsed.listing_id, "L1");
  assert.equal(parsed.daily_prices[0].native_price, 300);
});

test("client: pullReservations encodes listing_id + modified_since query params", async () => {
  let urlSeen = "";
  const client = new AirbnbClient(freshCreds(), {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ reservations: [] });
    }),
    backoffBaseMs: 1,
  });
  await client.pullReservations({
    listingId: "L1",
    modifiedSince: new Date("2026-04-01T00:00:00Z"),
    limit: 50,
  });
  assert.match(urlSeen, /listing_id=L1/);
  assert.match(urlSeen, /modified_since=2026-04-01T00%3A00%3A00\.000Z/);
  assert.match(urlSeen, /_limit=50/);
});

test("client: proactive refresh fires when expiresAt is within margin", async () => {
  const events: string[] = [];
  let refreshed = false;
  const client = new AirbnbClient(
    freshCreds({ expiresAt: PAST }),
    {
      fetch: mockFetch((url) => {
        if (url.includes("/oauth2/token")) {
          refreshed = true;
          events.push("refresh");
          return jsonResponse({
            access_token: "rotated",
            refresh_token: "r2",
            expires_in: 3600,
          });
        }
        events.push("request");
        return jsonResponse({ ok: true });
      }),
      backoffBaseMs: 1,
    },
  );
  await client.testConnection();
  assert.ok(refreshed);
  assert.deepEqual(events, ["refresh", "request"]);
  assert.equal(client.credentials.accessToken, "rotated");
  assert.equal(client.credentials.refreshToken, "r2");
});

test("client: 401 mid-flight triggers refresh + single retry, apiCallsCount accumulates", async () => {
  let phase: "first" | "refresh" | "second" = "first";
  const client = new AirbnbClient(freshCreds(), {
    fetch: mockFetch((url) => {
      if (url.includes("/oauth2/token")) {
        phase = "refresh";
        return jsonResponse({
          access_token: "rotated",
          expires_in: 3600,
        });
      }
      if (phase === "first") {
        phase = "second";
        return new Response("expired", { status: 401 });
      }
      return jsonResponse({ ok: true });
    }),
    backoffBaseMs: 1,
  });
  const res = await client.testConnection();
  assert.equal(res.status, 200);
  // 1 (first 401) + 1 (refresh) + 1 (retry) — but apiCallsCount only
  // counts the dispatched request retries, not the token refresh which
  // is a separate POST (counted by the fetch mock). We assert ≥2.
  assert.ok(res.apiCallsCount >= 2, `expected ≥2 retries, got ${res.apiCallsCount}`);
});

test("client: onCredentialsRefreshed callback fires with new tokens", async () => {
  let captured: { accessToken?: string; refreshToken?: string; expiresAt?: number } = {};
  const client = new AirbnbClient(
    freshCreds({ expiresAt: PAST }),
    {
      fetch: mockFetch((url) => {
        if (url.includes("/oauth2/token")) {
          return jsonResponse({
            access_token: "rotated-A",
            refresh_token: "rotated-R",
            expires_in: 3600,
          });
        }
        return jsonResponse({ ok: true });
      }),
      backoffBaseMs: 1,
      onCredentialsRefreshed: async (next) => {
        captured = next;
      },
    },
  );
  await client.testConnection();
  assert.equal(captured.accessToken, "rotated-A");
  assert.equal(captured.refreshToken, "rotated-R");
  assert.ok((captured.expiresAt ?? 0) > Date.now());
});

test("client: 429 retries via shared envelope", async () => {
  let calls = 0;
  const client = new AirbnbClient(freshCreds(), {
    fetch: mockFetch((url) => {
      if (url.includes("/oauth2/token")) {
        return jsonResponse({ access_token: "x", expires_in: 3600 });
      }
      calls++;
      if (calls < 3) return new Response("rate", { status: 429 });
      return jsonResponse({ ok: true });
    }),
    backoffBaseMs: 1,
    maxRetries: 3,
  });
  const res = await client.testConnection();
  assert.equal(res.status, 200);
  assert.equal(calls, 3);
});

test("client: thrown network error retries via envelope then throws", async () => {
  const client = new AirbnbClient(freshCreds(), {
    fetch: mockFetch((url) => {
      if (url.includes("/oauth2/token")) {
        return jsonResponse({ access_token: "x", expires_in: 3600 });
      }
      throw new Error("network");
    }),
    backoffBaseMs: 1,
    maxRetries: 2,
  });
  await assert.rejects(() => client.testConnection(), /failed after 2 attempts/);
});

// ===========================================================================
// 5) AirbnbProvider
// ===========================================================================

test("provider: implements ChannelManagerProvider contract", () => {
  const provider = new AirbnbProvider(freshCreds());
  for (const m of [
    "pushAvailability",
    "pushRates",
    "pushAmenities",
    "pullReservations",
    "verifyWebhook",
    "parseWebhook",
    "testConnection",
  ]) {
    assert.equal(
      typeof (provider as unknown as Record<string, unknown>)[m],
      "function",
      `missing ${m}`,
    );
  }
  assert.equal(provider.name, "airbnb");
});

test("provider: pushAvailability — success path with apiCallsCount", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => jsonResponse({ ok: true })),
    backoffBaseMs: 1,
  });
  const result = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "L1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([
      ["2026-05-01", 1],
      ["2026-05-02", 0],
    ]),
  });
  assert.equal(result.success, true);
  assert.equal(result.recordsProcessed, 2);
  assert.equal(result.apiCallsCount, 1);
});

test("provider: pushRates — non-2xx returns failure SyncResult", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => new Response("bad rate", { status: 422 })),
    backoffBaseMs: 1,
  });
  const result = await provider.pushRates({
    villaId: "v",
    externalPropertyId: "L1",
    ratePlanId: "rp",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 25000n, currency: "USD" }],
    ]),
  });
  assert.equal(result.success, false);
  assert.equal(result.recordsFailed, 1);
  assert.match(result.errors[0].message, /HTTP 422/);
});

test("provider: pushAmenities — success", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => jsonResponse({ updated: true })),
    backoffBaseMs: 1,
  });
  const result = await provider.pushAmenities({
    externalPropertyId: "L1",
    amenities: ["pool", "wifi"],
  });
  assert.equal(result.success, true);
  assert.equal(result.recordsProcessed, 2);
});

test("provider: pushAvailability — empty input returns zero result, no API call", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => {
      throw new Error("should not call");
    }),
    backoffBaseMs: 1,
  });
  const result = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "L1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map(),
  });
  assert.equal(result.recordsProcessed, 0);
  assert.equal(result.apiCallsCount, 0);
});

test("provider: pushAvailability — thrown network error degrades to failure SyncResult", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => {
      throw new Error("DNS failure");
    }),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const result = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "L1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.equal(result.success, false);
  assert.match(result.errors[0].message, /DNS failure|after 1 attempts/);
});

test("provider: pullReservations projects JSON list to ChannelReservationData[]", async () => {
  const sampleResponse = {
    reservations: [
      {
        confirmation_code: "HM-A1",
        status: "accept",
        start_date: "2026-06-01",
        end_date: "2026-06-04",
        number_of_adults: 2,
        guest: { full_name: "Bob Smith" },
        pricing_quote: { total_paid_amount_accurate: 450, currency: "USD" },
      },
      {
        confirmation_code: "HM-A2",
        status: "cancellation_by_guest",
        start_date: "2026-07-01",
        end_date: "2026-07-05",
        guest: { full_name: "Carol Jones" },
        pricing_quote: { total_paid_amount_accurate: 800, currency: "EUR" },
      },
    ],
  };
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => jsonResponse(sampleResponse)),
    backoffBaseMs: 1,
  });
  const reservations = await provider.pullReservations({
    externalPropertyId: "L1",
  });
  assert.equal(reservations.length, 2);
  assert.equal(reservations[0].externalReservationId, "HM-A1");
  assert.equal(reservations[0].adults, 2);
  assert.equal(reservations[0].totalAmountMinor, 45000n);
  assert.equal(reservations[1].externalStatus, "cancellation_by_guest");
  assert.equal(reservations[1].currency, "EUR");
});

test("provider: pullReservations — non-2xx returns []", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => new Response("err", { status: 500 })),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const r = await provider.pullReservations({ externalPropertyId: "L1" });
  assert.deepEqual(r, []);
});

test("provider: pullReservations — thrown error returns [] (no cron crash)", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => {
      throw new Error("net");
    }),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const r = await provider.pullReservations({ externalPropertyId: "L1" });
  assert.deepEqual(r, []);
});

// ===========================================================================
// 6) Webhook verification + parsing
// ===========================================================================

test("webhook: verifyWebhook accepts HMAC-SHA256 over raw body", () => {
  const provider = new AirbnbProvider(freshCreds());
  const payload = `{"event":"reservation_request"}`;
  const secret = "shared";
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(provider.verifyWebhook(payload, sig, secret), true);
});

test("webhook: verifyWebhook accepts the 'sha256=' prefix variant", () => {
  const provider = new AirbnbProvider(freshCreds());
  const payload = `{"event":"reservation_alteration"}`;
  const secret = "shared";
  const sig =
    "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(provider.verifyWebhook(payload, sig, secret), true);
});

test("webhook: verifyWebhook rejects mismatched signature (constant-time)", () => {
  const provider = new AirbnbProvider(freshCreds());
  assert.equal(
    provider.verifyWebhook(`{"a":1}`, "0".repeat(64), "secret"),
    false,
  );
});

test("webhook: verifyWebhook rejects missing secret or signature", () => {
  const provider = new AirbnbProvider(freshCreds());
  assert.equal(provider.verifyWebhook("p", "", "s"), false);
  assert.equal(provider.verifyWebhook("p", "s", ""), false);
});

test("webhook: parseWebhook handles top-level event string shape", () => {
  const provider = new AirbnbProvider(freshCreds());
  const event = provider.parseWebhook({
    event: "reservation_request",
    reservation_id: "HMABC",
  });
  assert.ok(event);
  assert.equal(event!.type, "reservation.created");
  assert.equal(event!.externalReservationId, "HMABC");
});

test("webhook: parseWebhook handles category+type composite shape", () => {
  const provider = new AirbnbProvider(freshCreds());
  const cases: Array<[string, string, string]> = [
    ["reservation", "request", "reservation.created"],
    ["reservation", "alteration", "reservation.modified"],
    ["reservation", "cancellation", "reservation.cancelled"],
  ];
  for (const [category, type, expected] of cases) {
    const event = provider.parseWebhook({
      category,
      type,
      reservation: { confirmation_code: "HM-X" },
    });
    assert.ok(event, `expected event for ${category}_${type}`);
    assert.equal(event!.type, expected);
    assert.equal(event!.externalReservationId, "HM-X");
  }
});

test("webhook: parseWebhook normalizes cancellation variants", () => {
  const provider = new AirbnbProvider(freshCreds());
  for (const e of [
    "reservation_cancellation",
    "reservation_cancellation_by_host",
    "reservation_cancellation_by_guest",
  ]) {
    const event = provider.parseWebhook({ event: e });
    assert.ok(event, `expected event for ${e}`);
    assert.equal(event!.type, "reservation.cancelled");
  }
});

test("webhook: parseWebhook returns null for unknown event types", () => {
  const provider = new AirbnbProvider(freshCreds());
  assert.equal(provider.parseWebhook({ event: "unknown_event" }), null);
  assert.equal(provider.parseWebhook({}), null);
});

// ===========================================================================
// 7) testConnection
// ===========================================================================

test("testConnection: 200 → connected:true", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => jsonResponse({ user_id: 999 })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details.channel, "airbnb");
  assert.equal(r.details.status, 200);
});

test("testConnection: 401 → connected:false", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => new Response("unauthorized", { status: 401 })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  // 401 triggers a refresh attempt in the client, which (with no token
  // endpoint mock) throws — testConnection catches and degrades. Either
  // way: connected:false.
  assert.equal(r.connected, false);
});

test("testConnection: network error → connected:false with error details", async () => {
  const provider = new AirbnbProvider(freshCreds(), {
    fetch: mockFetch(() => {
      throw new Error("DNS down");
    }),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, false);
  assert.match(String(r.details.error), /DNS down|after 1 attempts/);
});

// ===========================================================================
// 8) Selector integration
// ===========================================================================

test("selector integration: airbnb + creds returns AirbnbProvider (not DryRun)", () => {
  const provider = selectChannelProvider("airbnb", freshCreds());
  assert.ok(provider instanceof AirbnbProvider);
  assert.ok(!(provider instanceof DryRunChannelProvider));
  assert.equal(provider.name, "airbnb");
});

test("selector integration: airbnb without creds still falls back to DryRun", () => {
  const provider = selectChannelProvider("airbnb", null);
  assert.ok(provider instanceof DryRunChannelProvider);
  assert.equal(provider.name, "airbnb");
});

test("selector integration: airbnb with mismatched creds.channel → DryRun", () => {
  const provider = selectChannelProvider("airbnb", {
    channel: "booking_com",
    username: "u",
    password: "p",
    hotelId: "h",
    environment: "sandbox",
  });
  assert.ok(provider instanceof DryRunChannelProvider);
});

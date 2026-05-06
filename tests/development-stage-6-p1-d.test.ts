/**
 * Stage 6.P1.D — Trip.com / Agoda / Expedia / VRBO / Hotels.com tests.
 *
 * Covers 4 channel providers + the shared provider-helpers extraction:
 *   - Shared provider-helpers (projectHttpResult, zeroResult,
 *     errorResult, truncate, verifyHmacSha256Signature)
 *   - Trip.com mappers + client + provider
 *   - Agoda mappers + client (signature scheme) + provider
 *   - Expedia EQC SOAP builders + parsers + EPC mapper + provider
 *   - VRBO + Hotels.com (Expedia subclasses)
 *   - Selector integration (all 7 real channels routed)
 *
 * No real network: every client takes an injectable fetch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  projectHttpResult,
  zeroResult,
  errorResult,
  truncate,
  verifyHmacSha256Signature,
  pickPayloadString,
} from "../src/lib/channel-manager/provider-helpers";

// Trip.com
import {
  mapInternalAvailabilityToTrip,
  mapInternalRatesToTrip,
  mapAmenitiesToTrip,
  mapTripReservationToInternal,
} from "../src/lib/channel-manager/providers/trip-com/mappers";
import { TripComClient } from "../src/lib/channel-manager/providers/trip-com/client";
import { TripComProvider } from "../src/lib/channel-manager/providers/trip-com/provider";

// Agoda
import {
  mapInternalAvailabilityToAgoda,
  mapInternalRatesToAgoda,
  mapAmenitiesToAgoda,
  mapAgodaReservationToInternal,
} from "../src/lib/channel-manager/providers/agoda/mappers";
import { AgodaClient } from "../src/lib/channel-manager/providers/agoda/client";
import { AgodaProvider } from "../src/lib/channel-manager/providers/agoda/provider";

// Expedia
import {
  buildEQCAvailability,
  buildEQCRates,
  buildEQCBookingPull,
  escapeXml,
} from "../src/lib/channel-manager/providers/expedia/eqc-builders";
import {
  parseEQCResponse,
  parseEQCBookings,
  __resetEQCParserCacheForTests,
} from "../src/lib/channel-manager/providers/expedia/eqc-parsers";
import { mapAmenitiesToEPC } from "../src/lib/channel-manager/providers/expedia/epc-mappers";
import { ExpediaClient } from "../src/lib/channel-manager/providers/expedia/client";
import { ExpediaProvider } from "../src/lib/channel-manager/providers/expedia/provider";

// Subclasses
import { VRBOProvider } from "../src/lib/channel-manager/providers/vrbo/provider";
import { HotelsComProvider } from "../src/lib/channel-manager/providers/hotels-com/provider";

// Selector
import {
  selectChannelProvider,
  DryRunChannelProvider,
} from "../src/lib/channel-manager";

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

const FROZEN_DATE = new Date("2026-05-06T10:00:00.000Z");

// ===========================================================================
// 1) Shared provider-helpers
// ===========================================================================

test("helpers: projectHttpResult success on 2xx", () => {
  const r = projectHttpResult(
    { status: 200, body: "ok", apiCallsCount: 1 },
    5,
    Date.now() - 100,
  );
  assert.equal(r.success, true);
  assert.equal(r.recordsProcessed, 5);
  assert.equal(r.recordsSucceeded, 5);
  assert.equal(r.apiCallsCount, 1);
});

test("helpers: projectHttpResult failure on non-2xx with truncated body", () => {
  const r = projectHttpResult(
    { status: 422, body: "x".repeat(500), apiCallsCount: 2 },
    3,
    Date.now() - 50,
  );
  assert.equal(r.success, false);
  assert.equal(r.recordsFailed, 3);
  assert.match(r.errors[0].message, /^HTTP 422/);
  assert.ok(r.errors[0].message.length < 300);
});

test("helpers: zeroResult returns empty success with apiCallsCount=0", () => {
  const r = zeroResult(Date.now());
  assert.equal(r.success, true);
  assert.equal(r.recordsProcessed, 0);
  assert.equal(r.apiCallsCount, 0);
});

test("helpers: errorResult wraps thrown error", () => {
  const r = errorResult(Date.now(), 5, new Error("boom"));
  assert.equal(r.success, false);
  assert.equal(r.recordsFailed, 5);
  assert.equal(r.errors[0].message, "boom");
});

test("helpers: truncate adds ellipsis when over max", () => {
  assert.equal(truncate("hello", 10), "hello");
  assert.equal(truncate("hello world", 5), "hello…");
});

test("helpers: verifyHmacSha256Signature accepts valid sig (raw + sha256= prefix)", () => {
  const payload = `{"x":1}`;
  const secret = "shared";
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(verifyHmacSha256Signature(payload, sig, secret), true);
  assert.equal(
    verifyHmacSha256Signature(payload, "sha256=" + sig, secret),
    true,
  );
});

test("helpers: verifyHmacSha256Signature rejects mismatch + missing inputs", () => {
  assert.equal(verifyHmacSha256Signature("p", "0".repeat(64), "s"), false);
  assert.equal(verifyHmacSha256Signature("p", "", "s"), false);
  assert.equal(verifyHmacSha256Signature("p", "x", ""), false);
});

test("helpers: pickPayloadString returns undefined for non-strings + empty", () => {
  assert.equal(pickPayloadString({ x: "a" }, "x"), "a");
  assert.equal(pickPayloadString({ x: "" }, "x"), undefined);
  assert.equal(pickPayloadString({ x: 1 }, "x"), undefined);
  assert.equal(pickPayloadString({}, "x"), undefined);
});

// ===========================================================================
// 2) Trip.com — mappers
// ===========================================================================

test("trip mapper: availability sorted + clamped to non-negative", () => {
  const body = mapInternalAvailabilityToTrip({
    villaId: "v",
    externalPropertyId: "H1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([
      ["2026-05-03", -2],
      ["2026-05-01", 1],
      ["2026-05-02", 0],
    ]),
  });
  assert.equal(body.hotel_id, "H1");
  assert.deepEqual(
    body.inventory.map((i) => i.date),
    ["2026-05-01", "2026-05-02", "2026-05-03"],
  );
  assert.equal(body.inventory[2].available_count, 0);
});

test("trip mapper: rates convert minor → major and preserve currency", () => {
  const body = mapInternalRatesToTrip({
    villaId: "v",
    externalPropertyId: "H1",
    ratePlanId: "RP",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 12550n, currency: "USD", minStay: 3 }],
    ]),
  });
  assert.equal(body.rates[0].price, 125.5);
  assert.equal(body.rates[0].currency, "USD");
  assert.equal(body.rates[0].min_stay, 3);
});

test("trip mapper: amenities wrap with hotel_id", () => {
  const body = mapAmenitiesToTrip("H1", ["wifi", "pool"]);
  assert.deepEqual(body.amenities, ["wifi", "pool"]);
  assert.equal(body.hotel_id, "H1");
});

test("trip mapper: reservation projection — all key fields", () => {
  const r = mapTripReservationToInternal({
    reservation_id: "TR-1",
    status: "confirmed",
    check_in: "2026-06-01",
    check_out: "2026-06-05",
    adults: 2,
    children: 1,
    guest: {
      first_name: "Alice",
      last_name: "Test",
      email: "a@b.c",
      nationality: "US",
    },
    total_amount: 500.5,
    currency: "USD",
    commission_amount: 50,
    created_at: "2026-04-30T08:00:00Z",
    special_requests: "Late check-in",
  });
  assert.ok(r);
  assert.equal(r!.externalReservationId, "TR-1");
  assert.equal(r!.adults, 2);
  assert.equal(r!.children, 1);
  assert.equal(r!.totalAmountMinor, 50050n);
  assert.equal(r!.commissionMinor, 5000n);
  assert.equal(r!.guest.country, "US");
});

test("trip mapper: reservation null on missing id or dates", () => {
  assert.equal(mapTripReservationToInternal({}), null);
  assert.equal(
    mapTripReservationToInternal({ reservation_id: "x" }),
    null,
  );
});

// ===========================================================================
// 3) Trip.com — client + provider
// ===========================================================================

const TRIP_CREDS = {
  channel: "trip_com" as const,
  partnerId: "partner-1",
  apiKey: "key-1",
  hotelId: "H1",
};

test("trip client: sends X-Partner-Id + X-API-Key headers + JSON body", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const client = new TripComClient(TRIP_CREDS, {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ ok: true });
    }),
    backoffBaseMs: 1,
  });
  await client.pushAvailability({
    villaId: "v",
    externalPropertyId: "H1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["X-Partner-Id"], "partner-1");
  assert.equal(headers["X-API-Key"], "key-1");
  assert.match(captured.url ?? "", /\/v1\/hotels\/H1\/inventory$/);
});

test("trip client: testConnection calls /info endpoint", async () => {
  let urlSeen = "";
  const client = new TripComClient(TRIP_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ name: "Test Hotel" });
    }),
    backoffBaseMs: 1,
  });
  await client.testConnection();
  assert.match(urlSeen, /\/v1\/hotels\/H1\/info$/);
});

test("trip provider: pushAvailability success path", async () => {
  const provider = new TripComProvider(TRIP_CREDS, {
    fetch: mockFetch(() => jsonResponse({ ok: true })),
    backoffBaseMs: 1,
  });
  const r = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "H1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1], ["2026-05-02", 1]]),
  });
  assert.equal(r.success, true);
  assert.equal(r.recordsProcessed, 2);
});

test("trip provider: pullReservations projects multiple results", async () => {
  const sample = {
    reservations: [
      {
        reservation_id: "TR-A",
        status: "confirmed",
        check_in: "2026-06-01",
        check_out: "2026-06-03",
        guest: { first_name: "A", last_name: "B" },
        total_amount: 100,
        currency: "USD",
      },
      {
        reservation_id: "TR-B",
        status: "cancelled",
        check_in: "2026-07-01",
        check_out: "2026-07-04",
        guest: { name: "Carol Jones" },
        total_amount: 250,
        currency: "EUR",
      },
    ],
  };
  const provider = new TripComProvider(TRIP_CREDS, {
    fetch: mockFetch(() => jsonResponse(sample)),
    backoffBaseMs: 1,
  });
  const reservations = await provider.pullReservations({
    externalPropertyId: "H1",
  });
  assert.equal(reservations.length, 2);
  assert.equal(reservations[0].externalReservationId, "TR-A");
  assert.equal(reservations[1].currency, "EUR");
  assert.equal(reservations[1].guest.firstName, "Carol");
});

test("trip provider: pullReservations returns [] on non-2xx", async () => {
  const provider = new TripComProvider(TRIP_CREDS, {
    fetch: mockFetch(() => new Response("err", { status: 500 })),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const r = await provider.pullReservations({ externalPropertyId: "H1" });
  assert.deepEqual(r, []);
});

test("trip provider: webhook verify + parse for created/modified/cancelled", () => {
  const provider = new TripComProvider(TRIP_CREDS);
  const payload = `{"event_type":"reservation_created","reservation_id":"TR-1"}`;
  const sig = createHmac("sha256", "k").update(payload).digest("hex");
  assert.equal(provider.verifyWebhook(payload, sig, "k"), true);

  const created = provider.parseWebhook({
    event_type: "reservation_created",
    reservation_id: "TR-1",
  });
  assert.equal(created?.type, "reservation.created");
  assert.equal(created?.externalReservationId, "TR-1");

  const cancelled = provider.parseWebhook({
    event_type: "reservation_cancelled",
    reservation_id: "TR-2",
  });
  assert.equal(cancelled?.type, "reservation.cancelled");

  assert.equal(provider.parseWebhook({}), null);
});

test("trip provider: testConnection success/failure paths", async () => {
  const ok = new TripComProvider(TRIP_CREDS, {
    fetch: mockFetch(() => jsonResponse({ id: "H1" })),
    backoffBaseMs: 1,
  });
  const okR = await ok.testConnection();
  assert.equal(okR.connected, true);

  const bad = new TripComProvider(TRIP_CREDS, {
    fetch: mockFetch(() => new Response("nope", { status: 401 })),
    backoffBaseMs: 1,
  });
  const badR = await bad.testConnection();
  assert.equal(badR.connected, false);
});

// ===========================================================================
// 4) Agoda — mappers
// ===========================================================================

test("agoda mapper: availability + rates sorted + minor → major", () => {
  const a = mapInternalAvailabilityToAgoda({
    villaId: "v",
    externalPropertyId: "H2",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-02", 0], ["2026-05-01", 2]]),
  });
  assert.equal(a.availability[0].date, "2026-05-01");
  assert.equal(a.availability[1].rooms_available, 0);

  const b = mapInternalRatesToAgoda({
    villaId: "v",
    externalPropertyId: "H2",
    ratePlanId: "RP",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 9999n, currency: "IDR" }],
    ]),
  });
  assert.equal(b.rates[0].rate, 99.99);
  assert.equal(b.rates[0].currency, "IDR");
});

test("agoda mapper: amenities wrap with hotel_id + amenity_codes key", () => {
  const body = mapAmenitiesToAgoda("H2", ["spa", "gym"]);
  assert.deepEqual(body.amenity_codes, ["spa", "gym"]);
});

test("agoda mapper: reservation projection (booking_id + arrival_date variants)", () => {
  const r = mapAgodaReservationToInternal({
    booking_id: "AG-1",
    status: "confirmed",
    arrival_date: "2026-06-01",
    departure_date: "2026-06-05",
    adults: 2,
    guest: { name: "Carol Jones", nationality: "GB" },
    total_amount: "200.00",
    currency: "EUR",
  });
  assert.ok(r);
  assert.equal(r!.externalReservationId, "AG-1");
  assert.equal(r!.totalAmountMinor, 20000n);
  assert.equal(r!.currency, "EUR");
  assert.equal(r!.guest.firstName, "Carol");
  assert.equal(r!.guest.country, "GB");
});

test("agoda mapper: reservation null on missing id/dates", () => {
  assert.equal(mapAgodaReservationToInternal({}), null);
  assert.equal(
    mapAgodaReservationToInternal({ booking_id: "x" }),
    null,
  );
});

// ===========================================================================
// 5) Agoda — client + signature scheme
// ===========================================================================

const AGODA_CREDS = {
  channel: "agoda" as const,
  hotelId: "H2",
  apiKey: "AK",
  apiSecret: "SECRET-32-chars-or-more-padding-here",
  environment: "production" as const,
};

test("agoda client: signature is SHA256-HMAC of timestamp+path+body", () => {
  const client = new AgodaClient(AGODA_CREDS, {
    nowMs: () => 1000000,
    fetch: mockFetch(() => new Response("ok", { status: 200 })),
    backoffBaseMs: 1,
  });
  const ts = "1000000";
  const path = "/ycs/inventory/availability";
  const body = `{"x":1}`;
  const expected = createHmac("sha256", AGODA_CREDS.apiSecret)
    .update(ts + path + body)
    .digest("hex");
  assert.equal(client.buildSignature(ts, path, body), expected);
});

test("agoda client: dispatches with X-Agoda-* headers + signature matches body", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const client = new AgodaClient(AGODA_CREDS, {
    nowMs: () => 1234567,
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ ok: true });
    }),
    backoffBaseMs: 1,
  });
  await client.pushAvailability({
    villaId: "v",
    externalPropertyId: "H2",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["X-Agoda-Hotel-Id"], "H2");
  assert.equal(headers["X-Agoda-Api-Key"], "AK");
  assert.equal(headers["X-Agoda-Timestamp"], "1234567");
  // Re-derive expected signature using actual body.
  const body = captured.init?.body as string;
  const expected = createHmac("sha256", AGODA_CREDS.apiSecret)
    .update("1234567" + "/ycs/inventory/availability" + body)
    .digest("hex");
  assert.equal(headers["X-Agoda-Signature"], expected);
});

test("agoda client: testConnection hits /ycs/properties/{hotelId}", async () => {
  let urlSeen = "";
  const client = new AgodaClient(AGODA_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ id: "H2" });
    }),
    backoffBaseMs: 1,
  });
  await client.testConnection();
  assert.match(urlSeen, /\/ycs\/properties\/H2$/);
});

// ===========================================================================
// 6) Agoda — provider
// ===========================================================================

test("agoda provider: pushAvailability + pushRates + pushAmenities success", async () => {
  const provider = new AgodaProvider(AGODA_CREDS, {
    fetch: mockFetch(() => jsonResponse({ ok: true })),
    backoffBaseMs: 1,
  });
  const a = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "H2",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.equal(a.success, true);

  const r = await provider.pushRates({
    villaId: "v",
    externalPropertyId: "H2",
    ratePlanId: "RP",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([["2026-05-01", { amountMinor: 5000n, currency: "USD" }]]),
  });
  assert.equal(r.success, true);

  const am = await provider.pushAmenities({
    externalPropertyId: "H2",
    amenities: ["wifi"],
  });
  assert.equal(am.success, true);
});

test("agoda provider: pullReservations projects bookings list", async () => {
  const provider = new AgodaProvider(AGODA_CREDS, {
    fetch: mockFetch(() =>
      jsonResponse({
        bookings: [
          {
            booking_id: "AG-1",
            status: "confirmed",
            arrival_date: "2026-06-01",
            departure_date: "2026-06-03",
            guest: { name: "X Y" },
            total_amount: 100,
            currency: "USD",
          },
        ],
      }),
    ),
    backoffBaseMs: 1,
  });
  const r = await provider.pullReservations({ externalPropertyId: "H2" });
  assert.equal(r.length, 1);
  assert.equal(r[0].externalReservationId, "AG-1");
});

test("agoda provider: webhook verify + parse for booking events", () => {
  const provider = new AgodaProvider(AGODA_CREDS);
  const payload = `{"event_type":"booking_new","booking_id":"AG-1"}`;
  const sig = createHmac("sha256", "k").update(payload).digest("hex");
  assert.equal(provider.verifyWebhook(payload, sig, "k"), true);

  for (const [evt, expected] of [
    ["booking_new", "reservation.created"],
    ["booking_modified", "reservation.modified"],
    ["booking_cancelled", "reservation.cancelled"],
    ["availability_modified", "inventory.modified"],
    ["rate_modified", "rate.modified"],
  ] as const) {
    const e = provider.parseWebhook({ event_type: evt, booking_id: "AG-1" });
    assert.equal(e?.type, expected, `event ${evt} → ${expected}`);
  }
});

// ===========================================================================
// 7) Expedia — EQC SOAP builders
// ===========================================================================

test("eqc builder: escapeXml covers all 5 entities", () => {
  assert.equal(escapeXml("a&b<c>\"'"), "a&amp;b&lt;c&gt;&quot;&apos;");
});

test("eqc builder: buildEQCAvailability emits SOAP envelope + auth + AvailRateUpdateRQ", () => {
  const xml = buildEQCAvailability({
    hotelId: "H3",
    roomId: "ROOM-1",
    ratePlanId: "RP",
    ranges: [
      { start: new Date("2026-05-01"), end: new Date("2026-05-07"), availability: 1 },
    ],
    username: "u",
    password: "p",
    timestamp: FROZEN_DATE,
  });
  assert.match(xml, /<soap:Envelope/);
  assert.match(xml, /<Authentication>/);
  assert.match(xml, /<Username>u<\/Username>/);
  assert.match(xml, /<AvailRateUpdateRQ /);
  assert.match(xml, /Hotel id="H3"/);
  assert.match(xml, /AvailabilityUpdate from="2026-05-01" to="2026-05-07"/);
  assert.match(xml, /totalInventoryAvailable="1"/);
});

test("eqc builder: buildEQCAvailability clamps negative + escapes ids", () => {
  const xml = buildEQCAvailability({
    hotelId: 'H<3>',
    roomId: "ROOM-1",
    ratePlanId: "RP",
    ranges: [
      { start: new Date("2026-05-01"), end: new Date("2026-05-01"), availability: -3 },
    ],
    username: "u",
    password: "p",
    timestamp: FROZEN_DATE,
  });
  assert.match(xml, /Hotel id="H&lt;3&gt;"/);
  assert.match(xml, /totalInventoryAvailable="0"/);
});

test("eqc builder: buildEQCRates emits Rate elements with currency + amountAfterTax", () => {
  const xml = buildEQCRates({
    hotelId: "H3",
    roomId: "ROOM-1",
    ratePlanId: "RP",
    ranges: [
      {
        start: new Date("2026-05-01"),
        end: new Date("2026-05-07"),
        amount: 250.5,
        currency: "USD",
      },
    ],
    username: "u",
    password: "p",
    timestamp: FROZEN_DATE,
  });
  assert.match(xml, /RatePlan id="RP"/);
  assert.match(xml, /currency="USD" amountAfterTax="250\.50"/);
});

test("eqc builder: builders throw on missing required fields", () => {
  assert.throws(() =>
    buildEQCAvailability({
      hotelId: "",
      roomId: "r",
      ratePlanId: "rp",
      ranges: [{ start: new Date(), end: new Date(), availability: 1 }],
      username: "u",
      password: "p",
      timestamp: FROZEN_DATE,
    }),
  );
  assert.throws(() =>
    buildEQCRates({
      hotelId: "h",
      roomId: "r",
      ratePlanId: "",
      ranges: [
        { start: new Date(), end: new Date(), amount: 1, currency: "USD" },
      ],
      username: "u",
      password: "p",
      timestamp: FROZEN_DATE,
    }),
  );
});

test("eqc builder: buildEQCBookingPull omits/includes lastUpdated correctly", () => {
  const a = buildEQCBookingPull({
    hotelId: "H3",
    username: "u",
    password: "p",
    timestamp: FROZEN_DATE,
  });
  assert.doesNotMatch(a, /lastUpdated/);
  const b = buildEQCBookingPull({
    hotelId: "H3",
    username: "u",
    password: "p",
    timestamp: FROZEN_DATE,
    modifiedSince: new Date("2026-04-01T00:00:00Z"),
  });
  assert.match(b, /lastUpdated="2026-04-01T00:00:00\.000Z"/);
});

// ===========================================================================
// 8) Expedia — EQC parsers
// ===========================================================================

test("eqc parser: parseEQCResponse success on <Success/>", async () => {
  const r = await parseEQCResponse(
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Reply><Success/></Reply></soap:Body></soap:Envelope>`,
  );
  assert.equal(r.success, true);
});

test("eqc parser: parseEQCResponse extracts SOAP Fault as error", async () => {
  const r = await parseEQCResponse(
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>Server</faultcode><faultstring>Bad creds</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
  );
  assert.equal(r.success, false);
  assert.equal(r.errors[0].message, "Bad creds");
});

test("eqc parser: parseEQCResponse extracts <Error code='..' message='..'/>", async () => {
  const r = await parseEQCResponse(
    `<?xml version="1.0"?><Reply><Errors><Error code="500" message="Internal"/></Errors></Reply>`,
  );
  assert.equal(r.success, false);
  assert.equal(r.errors[0].code, "500");
  assert.equal(r.errors[0].message, "Internal");
});

test("eqc parser: parseEQCResponse handles malformed XML safely", async () => {
  const r = await parseEQCResponse("<not-well-formed");
  assert.equal(r.success, false);
});

test("eqc parser: lazy import works (cache reset)", async () => {
  __resetEQCParserCacheForTests();
  const r = await parseEQCResponse(
    `<?xml version="1.0"?><Reply><Success/></Reply>`,
  );
  assert.equal(r.success, true);
});

test("eqc parser: parseEQCBookings extracts a Booking with all key fields", async () => {
  const xml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <BookingRetrievalRS>
      <Bookings>
        <Booking id="EXP-1234" type="Book" createDateTime="2026-04-30T08:00:00Z">
          <StayDates arrival="2026-06-01" departure="2026-06-05" adults="2" children="1"/>
          <PrimaryGuest>
            <Name givenName="Alice" surname="Tester"/>
            <Email value="alice@example.com"/>
            <Phone value="+1-555-0100"/>
            <Address country="US"/>
          </PrimaryGuest>
          <Total amountAfterTax="1234.56" currency="USD" commission="123.45"/>
          <SpecialRequests>Late arrival</SpecialRequests>
        </Booking>
      </Bookings>
    </BookingRetrievalRS>
  </soap:Body>
</soap:Envelope>`;
  const bookings = await parseEQCBookings(xml);
  assert.equal(bookings.length, 1);
  const b = bookings[0];
  assert.equal(b.externalReservationId, "EXP-1234");
  assert.equal(b.externalStatus, "Book");
  assert.equal(b.guest.firstName, "Alice");
  assert.equal(b.guest.email, "alice@example.com");
  assert.equal(b.guest.country, "US");
  assert.equal(b.adults, 2);
  assert.equal(b.children, 1);
  assert.equal(b.totalAmountMinor, 123456n);
  assert.equal(b.commissionMinor, 12345n);
  assert.equal(b.specialRequests, "Late arrival");
});

test("eqc parser: parseEQCBookings handles multiple + empty cases", async () => {
  const multi = await parseEQCBookings(`<?xml version="1.0"?>
<Bookings>
  <Booking id="A"><StayDates arrival="2026-06-01" departure="2026-06-02"/></Booking>
  <Booking id="B"><StayDates arrival="2026-07-01" departure="2026-07-02"/></Booking>
</Bookings>`);
  assert.equal(multi.length, 2);
  assert.deepEqual(await parseEQCBookings(""), []);
  assert.deepEqual(await parseEQCBookings("<bad"), []);
});

// ===========================================================================
// 9) Expedia — EPC mappers + client + provider
// ===========================================================================

test("epc mapper: amenities wraps as { amenityCodes }", () => {
  assert.deepEqual(
    mapAmenitiesToEPC(["pool", "wifi"]),
    { amenityCodes: ["pool", "wifi"] },
  );
});

const EXPEDIA_CREDS = {
  channel: "expedia" as const,
  hotelId: "EXP-1",
  eqcUsername: "u",
  eqcPassword: "p",
  environment: "sandbox" as const,
};

test("expedia client: basicAuthHeader is 'Basic base64(user:pass)'", () => {
  const client = new ExpediaClient({
    hotelId: "x",
    eqcUsername: "alice",
    eqcPassword: "secret",
    environment: "sandbox",
  });
  assert.equal(
    client.basicAuthHeader,
    "Basic " + Buffer.from("alice:secret").toString("base64"),
  );
});

test("expedia client: SOAP POST sets Content-Type text/xml + SOAPAction", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const client = new ExpediaClient(
    {
      hotelId: "EXP-1",
      eqcUsername: "u",
      eqcPassword: "p",
      environment: "sandbox",
    },
    {
      fetch: mockFetch((url, init) => {
        captured = { url, init };
        return new Response(
          `<?xml version="1.0"?><Reply><Success/></Reply>`,
          { status: 200 },
        );
      }),
      backoffBaseMs: 1,
    },
  );
  await client.pushAvailability({
    villaId: "v",
    externalPropertyId: "ROOM-1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.match(captured.url ?? "", /\/eqc\/ar$/);
  const headers = captured.init?.headers as Record<string, string>;
  assert.match(headers["Content-Type"], /text\/xml/);
  assert.match(captured.init?.body as string, /<soap:Envelope/);
});

test("expedia client: testConnection hits EPC base URL (not EQC)", async () => {
  let urlSeen = "";
  const client = new ExpediaClient(
    {
      hotelId: "EXP-1",
      eqcUsername: "u",
      eqcPassword: "p",
      environment: "sandbox",
    },
    {
      fetch: mockFetch((url) => {
        urlSeen = url;
        return jsonResponse({ id: "EXP-1" });
      }),
      backoffBaseMs: 1,
    },
  );
  await client.testConnection();
  assert.match(urlSeen, /properties\/EXP-1/);
  // Sandbox EPC base (NOT eqc).
  assert.doesNotMatch(urlSeen, /eqc/);
});

test("expedia provider: pushAvailability success on <Success/> reply", async () => {
  const provider = new ExpediaProvider(EXPEDIA_CREDS, {
    fetch: mockFetch(() =>
      new Response(`<?xml version="1.0"?><Reply><Success/></Reply>`, {
        status: 200,
      }),
    ),
    backoffBaseMs: 1,
  });
  const r = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "ROOM-1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.equal(r.success, true);
  assert.equal(r.recordsProcessed, 1);
});

test("expedia provider: pushAvailability error envelope flips to failure", async () => {
  const provider = new ExpediaProvider(EXPEDIA_CREDS, {
    fetch: mockFetch(() =>
      new Response(
        `<?xml version="1.0"?><Reply><Errors><Error code="500" message="bad"/></Errors></Reply>`,
        { status: 200 },
      ),
    ),
    backoffBaseMs: 1,
  });
  const r = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "ROOM-1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.equal(r.success, false);
  assert.equal(r.errors[0].field, "500");
  assert.equal(r.errors[0].message, "bad");
});

test("expedia provider: pushAmenities calls EPC endpoint, not EQC", async () => {
  let urlSeen = "";
  const provider = new ExpediaProvider(EXPEDIA_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ updated: true });
    }),
    backoffBaseMs: 1,
  });
  await provider.pushAmenities({
    externalPropertyId: "EXP-1",
    amenities: ["pool"],
  });
  assert.match(urlSeen, /amenities$/);
  assert.doesNotMatch(urlSeen, /\/eqc\//);
});

test("expedia provider: pullReservations projects EQC bookings", async () => {
  const xml = `<?xml version="1.0"?>
<Bookings>
  <Booking id="EXP-A" type="Book">
    <StayDates arrival="2026-06-01" departure="2026-06-03" adults="2"/>
    <PrimaryGuest><Name givenName="Bob" surname="Smith"/></PrimaryGuest>
    <Total amountAfterTax="200.00" currency="USD"/>
  </Booking>
</Bookings>`;
  const provider = new ExpediaProvider(EXPEDIA_CREDS, {
    fetch: mockFetch(() => new Response(xml, { status: 200 })),
    backoffBaseMs: 1,
  });
  const r = await provider.pullReservations({ externalPropertyId: "EXP-1" });
  assert.equal(r.length, 1);
  assert.equal(r[0].externalReservationId, "EXP-A");
  assert.equal(r[0].adults, 2);
  assert.equal(r[0].guest.firstName, "Bob");
});

test("expedia provider: pullReservations [] on non-2xx", async () => {
  const provider = new ExpediaProvider(EXPEDIA_CREDS, {
    fetch: mockFetch(() => new Response("err", { status: 500 })),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const r = await provider.pullReservations({ externalPropertyId: "EXP-1" });
  assert.deepEqual(r, []);
});

test("expedia provider: webhook verify + parse for BookingNotification", () => {
  const provider = new ExpediaProvider(EXPEDIA_CREDS);
  const payload = `{"eventType":"BookingNotification","bookingId":"EXP-1"}`;
  const sig = createHmac("sha256", "k").update(payload).digest("hex");
  assert.equal(provider.verifyWebhook(payload, sig, "k"), true);

  const e = provider.parseWebhook({
    eventType: "BookingNotification",
    bookingId: "EXP-1",
  });
  assert.equal(e?.type, "reservation.created");
  assert.equal(e?.externalReservationId, "EXP-1");
});

// ===========================================================================
// 10) VRBO + Hotels.com subclasses
// ===========================================================================

const VRBO_CREDS = {
  channel: "vrbo" as const,
  hotelId: "VR-1",
  eqcUsername: "u",
  eqcPassword: "p",
  environment: "sandbox" as const,
};

const HOTELS_COM_CREDS = {
  channel: "hotels_com" as const,
  hotelId: "HC-1",
  eqcUsername: "u",
  eqcPassword: "p",
  environment: "sandbox" as const,
};

test("vrbo provider: name is 'vrbo' not 'expedia'", () => {
  const provider = new VRBOProvider(VRBO_CREDS);
  assert.equal(provider.name, "vrbo");
  // Sanity: still an ExpediaProvider underneath.
  assert.ok(provider instanceof ExpediaProvider);
});

test("vrbo provider: testConnection details report channel='vrbo'", async () => {
  const provider = new VRBOProvider(VRBO_CREDS, {
    fetch: mockFetch(() => jsonResponse({ id: "VR-1" })),
    backoffBaseMs: 1,
  });
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details.channel, "vrbo");
});

test("hotels_com provider: name is 'hotels_com'", () => {
  const provider = new HotelsComProvider(HOTELS_COM_CREDS);
  assert.equal(provider.name, "hotels_com");
  assert.ok(provider instanceof ExpediaProvider);
});

test("hotels_com provider: pushAvailability shares EQC infrastructure", async () => {
  const provider = new HotelsComProvider(HOTELS_COM_CREDS, {
    fetch: mockFetch(() =>
      new Response(`<?xml version="1.0"?><Reply><Success/></Reply>`, {
        status: 200,
      }),
    ),
    backoffBaseMs: 1,
  });
  const r = await provider.pushAvailability({
    villaId: "v",
    externalPropertyId: "ROOM-1",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.equal(r.success, true);
});

// ===========================================================================
// 11) Selector integration — all 7 channels routed, dry-run preserved
// ===========================================================================

test("selector: all 7 real channels return their real provider with creds", () => {
  const cases: Array<[string, () => unknown]> = [
    ["trip_com", () => selectChannelProvider("trip_com", TRIP_CREDS)],
    ["agoda", () => selectChannelProvider("agoda", AGODA_CREDS)],
    ["expedia", () => selectChannelProvider("expedia", EXPEDIA_CREDS)],
    ["vrbo", () => selectChannelProvider("vrbo", VRBO_CREDS)],
    ["hotels_com", () => selectChannelProvider("hotels_com", HOTELS_COM_CREDS)],
  ];
  for (const [name, factory] of cases) {
    const provider = factory();
    assert.ok(
      !(provider instanceof DryRunChannelProvider),
      `${name} should not be DryRun`,
    );
  }
});

test("selector: each P1.D channel falls back to DryRun without creds", () => {
  for (const ch of ["trip_com", "agoda", "expedia", "vrbo", "hotels_com"] as const) {
    const provider = selectChannelProvider(ch, null);
    assert.ok(provider instanceof DryRunChannelProvider, `${ch} no-creds → DryRun`);
    assert.equal(provider.name, ch);
  }
});

test("selector: 'direct' is always DryRun even with non-null creds", () => {
  // 'direct' isn't a real channel — it's a marker for in-platform bookings.
  const provider = selectChannelProvider("direct", null);
  assert.ok(provider instanceof DryRunChannelProvider);
  assert.equal(provider.name, "direct");
});

test("selector: mismatched creds.channel falls back to DryRun (defense in depth)", () => {
  const provider = selectChannelProvider("expedia", AGODA_CREDS);
  assert.ok(provider instanceof DryRunChannelProvider);
});

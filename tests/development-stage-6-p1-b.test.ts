/**
 * Stage 6.P1.B — Booking.com provider tests.
 *
 * Covers:
 *   - Credentials encryption helpers (round-trip, redaction, key derivation)
 *   - OTA XML builders (3 builders × structure + escaping)
 *   - OTA XML parsers (success/error envelope, reservation extraction)
 *   - BookingComClient (auth header, retry/backoff, 429, 5xx, timeout, network)
 *   - BookingComProvider (push/pull/webhook/test methods)
 *   - mapAvailabilityToRanges + mapRatesToRanges coalescing
 *
 * Test infra: pure node:test. Network calls go through an injected
 * `fetch` mock — no real Booking.com traffic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildOTAAvailNotif,
  buildOTARateNotif,
  buildOTAResRetrieve,
  escapeXml,
} from "../src/lib/channel-manager/providers/booking-com/ota-builders";
import {
  parseOTAResponse,
  parseOTAReservations,
  __resetParserCacheForTests,
} from "../src/lib/channel-manager/providers/booking-com/ota-parsers";
import {
  BookingComClient,
} from "../src/lib/channel-manager/providers/booking-com/client";
import {
  BookingComProvider,
  mapAvailabilityToRanges,
  mapRatesToRanges,
} from "../src/lib/channel-manager/providers/booking-com/provider";
import {
  encryptCredentials,
  decryptCredentials,
  redactCredentials,
  isEncryptedBlob,
  deriveCredentialsKey,
} from "../src/lib/channel-manager/credentials-crypto";
import { selectChannelProvider } from "../src/lib/channel-manager";

const TEST_SECRET = "test-secret-not-for-production-32chars-minimum-okay";
const FROZEN_DATE = new Date("2026-05-06T10:00:00.000Z");

// ===========================================================================
// 1) Credentials encryption
// ===========================================================================

test("crypto: round-trip encrypt → decrypt restores plaintext exactly", () => {
  const plain = JSON.stringify({
    channel: "booking_com",
    username: "u",
    password: "p",
    hotelId: "12345",
    environment: "sandbox",
  });
  const blob = encryptCredentials(plain, TEST_SECRET);
  assert.ok(isEncryptedBlob(blob));
  const recovered = decryptCredentials(blob, TEST_SECRET);
  assert.equal(recovered, plain);
});

test("crypto: encryption is non-deterministic (random IV per call)", () => {
  const plain = JSON.stringify({ channel: "booking_com", x: 1 });
  const a = encryptCredentials(plain, TEST_SECRET);
  const b = encryptCredentials(plain, TEST_SECRET);
  assert.notEqual(a.c, b.c, "ciphertexts must differ");
  assert.equal(a.v, b.v);
  assert.equal(a.k, b.k);
});

test("crypto: decrypt with wrong secret throws (auth tag fails)", () => {
  const blob = encryptCredentials(
    JSON.stringify({ channel: "booking_com" }),
    TEST_SECRET,
  );
  assert.throws(() =>
    decryptCredentials(blob, "wrong-secret-also-32chars-long-buthowwwww"),
  );
});

test("crypto: tampered ciphertext throws on decrypt", () => {
  const blob = encryptCredentials(
    JSON.stringify({ channel: "booking_com", x: 1 }),
    TEST_SECRET,
  );
  const tampered = { ...blob, c: blob.c.slice(0, -2) + "AA" };
  assert.throws(() => decryptCredentials(tampered, TEST_SECRET));
});

test("crypto: deriveCredentialsKey rejects short secrets + bad versions", () => {
  assert.throws(() => deriveCredentialsKey("short", 1));
  assert.throws(() => deriveCredentialsKey(TEST_SECRET, 0));
  assert.throws(() => deriveCredentialsKey(TEST_SECRET, 256));
  // Different versions yield different keys — required for rotation.
  const k1 = deriveCredentialsKey(TEST_SECRET, 1);
  const k2 = deriveCredentialsKey(TEST_SECRET, 2);
  assert.notDeepEqual(k1, k2);
});

test("crypto: redactCredentials strips secret-bearing fields", () => {
  const redacted = redactCredentials({
    channel: "booking_com",
    username: "alice",
    password: "DO-NOT-LOG",
    hotelId: "1234",
    environment: "production",
  });
  // Channel + safe metadata only.
  assert.equal(redacted.channel, "booking_com");
  assert.equal(redacted.hotelId, "1234");
  assert.equal(redacted.environment, "production");
  // Secrets stripped.
  assert.equal(redacted.username, undefined);
  assert.equal(redacted.password, undefined);
});

test("crypto: redactCredentials handles null + non-object inputs safely", () => {
  assert.deepEqual(redactCredentials(null), {});
  assert.deepEqual(redactCredentials(undefined), {});
});

test("crypto: isEncryptedBlob is true only for the exact envelope shape", () => {
  assert.equal(isEncryptedBlob(null), false);
  assert.equal(isEncryptedBlob({}), false);
  assert.equal(isEncryptedBlob({ v: 1, k: 1 }), false);
  assert.equal(isEncryptedBlob({ v: 1, k: 1, c: "" }), false);
  assert.equal(isEncryptedBlob({ v: 1, k: 1, c: "x" }), true);
});

// ===========================================================================
// 2) OTA XML builders
// ===========================================================================

test("builder: escapeXml escapes all 5 entities", () => {
  assert.equal(escapeXml("&"), "&amp;");
  assert.equal(escapeXml("<"), "&lt;");
  assert.equal(escapeXml(">"), "&gt;");
  assert.equal(escapeXml('"'), "&quot;");
  assert.equal(escapeXml("'"), "&apos;");
  assert.equal(escapeXml("a&b<c>"), "a&amp;b&lt;c&gt;");
});

test("builder: buildOTAAvailNotif produces well-formed OTA envelope", () => {
  const xml = buildOTAAvailNotif({
    hotelId: "9999",
    roomId: "ROOM-A",
    timestamp: FROZEN_DATE,
    ranges: [
      {
        start: new Date("2026-05-01"),
        end: new Date("2026-05-07"),
        availability: 1,
      },
    ],
  });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<OTA_HotelInvCountNotifRQ[^>]*Version="1\.0"/);
  assert.match(xml, /TimeStamp="2026-05-06T10:00:00\.000Z"/);
  assert.match(xml, /HotelCode="9999"/);
  assert.match(xml, /InvTypeCode="ROOM-A"/);
  assert.match(xml, /Start="2026-05-01" End="2026-05-07"/);
  assert.match(xml, /CountType="2" Count="1"/);
});

test("builder: buildOTAAvailNotif emits one Inventory block per range", () => {
  const xml = buildOTAAvailNotif({
    hotelId: "h",
    roomId: "r",
    timestamp: FROZEN_DATE,
    ranges: [
      { start: new Date("2026-05-01"), end: new Date("2026-05-03"), availability: 1 },
      { start: new Date("2026-05-04"), end: new Date("2026-05-06"), availability: 0 },
    ],
  });
  const blocks = xml.match(/<Inventory>/g) ?? [];
  assert.equal(blocks.length, 2);
});

test("builder: buildOTAAvailNotif clamps negative availability to 0", () => {
  const xml = buildOTAAvailNotif({
    hotelId: "h",
    roomId: "r",
    timestamp: FROZEN_DATE,
    ranges: [{ start: new Date("2026-05-01"), end: new Date("2026-05-01"), availability: -5 }],
  });
  assert.match(xml, /Count="0"/);
});

test("builder: buildOTAAvailNotif escapes hotelId + roomId (XML injection guard)", () => {
  const xml = buildOTAAvailNotif({
    hotelId: 'hot"id',
    roomId: "room<id>",
    timestamp: FROZEN_DATE,
    ranges: [{ start: new Date("2026-05-01"), end: new Date("2026-05-01"), availability: 1 }],
  });
  assert.match(xml, /HotelCode="hot&quot;id"/);
  assert.match(xml, /InvTypeCode="room&lt;id&gt;"/);
});

test("builder: buildOTAAvailNotif requires hotelId + roomId + non-empty ranges", () => {
  assert.throws(() =>
    buildOTAAvailNotif({
      hotelId: "",
      roomId: "r",
      timestamp: FROZEN_DATE,
      ranges: [{ start: new Date(), end: new Date(), availability: 1 }],
    }),
  );
  assert.throws(() =>
    buildOTAAvailNotif({
      hotelId: "h",
      roomId: "",
      timestamp: FROZEN_DATE,
      ranges: [{ start: new Date(), end: new Date(), availability: 1 }],
    }),
  );
  assert.throws(() =>
    buildOTAAvailNotif({
      hotelId: "h",
      roomId: "r",
      timestamp: FROZEN_DATE,
      ranges: [],
    }),
  );
});

test("builder: buildOTARateNotif uses AmountAfterTax + currency code", () => {
  const xml = buildOTARateNotif({
    hotelId: "h",
    roomId: "r",
    ratePlanId: "RP-STANDARD",
    timestamp: FROZEN_DATE,
    ranges: [
      {
        start: new Date("2026-05-01"),
        end: new Date("2026-05-07"),
        amount: 250.5,
        currency: "USD",
      },
    ],
  });
  assert.match(xml, /<OTA_HotelRateAmountNotifRQ/);
  assert.match(xml, /RatePlanCode="RP-STANDARD"/);
  assert.match(xml, /AmountAfterTax="250\.50" CurrencyCode="USD"/);
});

test("builder: buildOTARateNotif requires ratePlanId", () => {
  assert.throws(() =>
    buildOTARateNotif({
      hotelId: "h",
      roomId: "r",
      ratePlanId: "",
      timestamp: FROZEN_DATE,
      ranges: [
        {
          start: new Date("2026-05-01"),
          end: new Date("2026-05-01"),
          amount: 100,
          currency: "USD",
        },
      ],
    }),
  );
});

test("builder: buildOTAResRetrieve omits LastModifyDateTime when no since", () => {
  const xml = buildOTAResRetrieve({
    hotelId: "9999",
    timestamp: FROZEN_DATE,
  });
  assert.match(xml, /<OTA_HotelResRetrieveRQ/);
  assert.match(xml, /HotelCode="9999"/);
  assert.doesNotMatch(xml, /LastModifyDateTime/);
});

test("builder: buildOTAResRetrieve includes LastModifyDateTime when since provided", () => {
  const xml = buildOTAResRetrieve({
    hotelId: "h",
    timestamp: FROZEN_DATE,
    modifiedSince: new Date("2026-04-01T00:00:00.000Z"),
  });
  assert.match(xml, /LastModifyDateTime="2026-04-01T00:00:00\.000Z"/);
});

test("builder: buildOTAResRetrieve clamps limit to [1, 200]", () => {
  const xml1 = buildOTAResRetrieve({
    hotelId: "h",
    timestamp: FROZEN_DATE,
    limit: -10,
  });
  assert.match(xml1, /MaxResponses="1"/);
  const xml2 = buildOTAResRetrieve({
    hotelId: "h",
    timestamp: FROZEN_DATE,
    limit: 9999,
  });
  assert.match(xml2, /MaxResponses="200"/);
});

// ===========================================================================
// 3) OTA XML parsers
// ===========================================================================

test("parser: parseOTAResponse returns success on <Success/> envelope", async () => {
  const xml = `<?xml version="1.0"?><Reply xmlns="..."><Success/></Reply>`;
  const result = await parseOTAResponse(xml);
  assert.equal(result.success, true);
  assert.deepEqual(result.errors, []);
});

test("parser: parseOTAResponse returns errors with code + message on <Errors>", async () => {
  const xml = `<?xml version="1.0"?>
<Reply>
  <Errors>
    <Error Code="450" ShortText="Invalid hotel ID"/>
    <Error Code="451" ShortText="Date range out of bounds"/>
  </Errors>
</Reply>`;
  const result = await parseOTAResponse(xml);
  assert.equal(result.success, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].code, "450");
  assert.equal(result.errors[0].message, "Invalid hotel ID");
});

test("parser: parseOTAResponse fails closed on missing both Success+Errors", async () => {
  const xml = `<?xml version="1.0"?><Reply><Other/></Reply>`;
  const result = await parseOTAResponse(xml);
  assert.equal(result.success, false);
  assert.match(result.errors[0].message, /missing both/);
});

test("parser: parseOTAResponse handles malformed XML without throwing", async () => {
  const xml = "<not><well-formed";
  const result = await parseOTAResponse(xml);
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
});

test("parser: parseOTAResponse handles empty input safely", async () => {
  const result = await parseOTAResponse("");
  assert.equal(result.success, false);
});

test("parser: lazy fast-xml-parser import (cache reset to verify load path)", async () => {
  __resetParserCacheForTests();
  // First call triggers the dynamic import — must not throw.
  const result = await parseOTAResponse(
    `<?xml version="1.0"?><Reply><Success/></Reply>`,
  );
  assert.equal(result.success, true);
});

test("parser: parseOTAReservations extracts a reservation with all key fields", async () => {
  const xml = `<?xml version="1.0"?>
<OTA_HotelResRetrieveRS xmlns="..." TimeStamp="2026-05-06T10:00:00Z">
  <Success/>
  <ReservationsList>
    <HotelReservation ResStatus="Book" CreateDateTime="2026-04-30T08:00:00Z">
      <UniqueID Type="14" ID="BK-1234567"/>
      <RoomStays>
        <RoomStay>
          <TimeSpan Start="2026-06-01" End="2026-06-08"/>
          <GuestCounts>
            <GuestCount AgeQualifyingCode="10" Count="2"/>
            <GuestCount AgeQualifyingCode="8" Count="1"/>
          </GuestCounts>
          <Total AmountAfterTax="1750.00" CurrencyCode="USD"/>
        </RoomStay>
      </RoomStays>
      <ResGuests>
        <ResGuest>
          <Profiles>
            <ProfileInfo>
              <Profile>
                <Customer>
                  <PersonName>
                    <GivenName>Alice</GivenName>
                    <Surname>Tester</Surname>
                  </PersonName>
                  <Email StringValue="alice@example.com"/>
                  <Telephone PhoneNumber="+1-555-0100"/>
                  <CitizenCountryName Code="US"/>
                </Customer>
              </Profile>
            </ProfileInfo>
          </Profiles>
        </ResGuest>
      </ResGuests>
      <SpecialRequests>Late check-in, please.</SpecialRequests>
    </HotelReservation>
  </ReservationsList>
</OTA_HotelResRetrieveRS>`;
  const reservations = await parseOTAReservations(xml);
  assert.equal(reservations.length, 1);
  const r = reservations[0];
  assert.equal(r.externalReservationId, "BK-1234567");
  assert.equal(r.externalStatus, "Book");
  assert.equal(r.guest.firstName, "Alice");
  assert.equal(r.guest.lastName, "Tester");
  assert.equal(r.guest.email, "alice@example.com");
  assert.equal(r.guest.phone, "+1-555-0100");
  assert.equal(r.guest.country, "US");
  assert.equal(r.adults, 2);
  assert.equal(r.children, 1);
  assert.equal(r.totalAmountMinor, 175000n);
  assert.equal(r.currency, "USD");
  assert.equal(r.paymentCollectedBy, "channel");
  assert.equal(r.specialRequests, "Late check-in, please.");
  assert.equal(r.checkIn.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(r.checkOut.toISOString().slice(0, 10), "2026-06-08");
});

test("parser: parseOTAReservations handles multiple reservations", async () => {
  const xml = `<?xml version="1.0"?>
<OTA_HotelResRetrieveRS>
  <ReservationsList>
    <HotelReservation ResStatus="Book">
      <UniqueID ID="BK-1"/>
      <RoomStays><RoomStay>
        <TimeSpan Start="2026-06-01" End="2026-06-03"/>
        <Total AmountAfterTax="100.00" CurrencyCode="USD"/>
      </RoomStay></RoomStays>
    </HotelReservation>
    <HotelReservation ResStatus="Cancel">
      <UniqueID ID="BK-2"/>
      <RoomStays><RoomStay>
        <TimeSpan Start="2026-07-01" End="2026-07-05"/>
        <Total AmountAfterTax="500.00" CurrencyCode="EUR"/>
      </RoomStay></RoomStays>
    </HotelReservation>
  </ReservationsList>
</OTA_HotelResRetrieveRS>`;
  const reservations = await parseOTAReservations(xml);
  assert.equal(reservations.length, 2);
  assert.equal(reservations[0].externalStatus, "Book");
  assert.equal(reservations[1].externalStatus, "Cancel");
  assert.equal(reservations[1].currency, "EUR");
});

test("parser: parseOTAReservations returns [] for empty / malformed XML", async () => {
  assert.deepEqual(await parseOTAReservations(""), []);
  assert.deepEqual(await parseOTAReservations("<not-well-formed"), []);
  assert.deepEqual(
    await parseOTAReservations(`<?xml version="1.0"?><Empty/>`),
    [],
  );
});

test("parser: parseOTAReservations preserves rawPayload for debugging", async () => {
  const xml = `<?xml version="1.0"?>
<HotelReservation ResStatus="Book">
  <UniqueID ID="BK-99"/>
  <RoomStays><RoomStay>
    <TimeSpan Start="2026-06-01" End="2026-06-02"/>
    <Total AmountAfterTax="50.00" CurrencyCode="USD"/>
  </RoomStay></RoomStays>
</HotelReservation>`;
  const reservations = await parseOTAReservations(xml);
  assert.equal(reservations.length, 1);
  assert.ok(reservations[0].rawPayload);
  assert.equal(typeof reservations[0].rawPayload, "object");
});

// ===========================================================================
// 4) BookingComClient — fetch injection + retry/backoff
// ===========================================================================

const TEST_CREDS = {
  channel: "booking_com" as const,
  username: "alice",
  password: "secret",
  hotelId: "9999",
  environment: "sandbox" as const,
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    return handler(typeof url === "string" ? url : url.toString(), init);
  };
}

function xmlReply(success = true) {
  return new Response(
    success
      ? `<?xml version="1.0"?><Reply><Success/></Reply>`
      : `<?xml version="1.0"?><Reply><Errors><Error Code="450" ShortText="bad"/></Errors></Reply>`,
    { status: 200 },
  );
}

test("client: authHeader builds HTTP Basic with base64(username:password)", () => {
  const client = new BookingComClient(TEST_CREDS);
  const expected = "Basic " + Buffer.from("alice:secret").toString("base64");
  assert.equal(client.authHeader, expected);
});

test("client: baseUrl flips between sandbox and production", () => {
  const sandbox = new BookingComClient(TEST_CREDS);
  assert.match(sandbox.baseUrl, /hotels-test/);
  const prod = new BookingComClient({ ...TEST_CREDS, environment: "production" });
  assert.match(prod.baseUrl, /hotels"|hotels$/);
});

test("client: pushAvailability sends POST with text/xml + auth header", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const client = new BookingComClient(TEST_CREDS, {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return xmlReply(true);
    }),
    backoffBaseMs: 1,
  });
  await client.pushAvailability({
    roomId: "ROOM-A",
    ranges: [{ start: new Date("2026-05-01"), end: new Date("2026-05-01"), availability: 1 }],
    timestamp: FROZEN_DATE,
  });
  assert.match(captured.url ?? "", /\/availability$/);
  assert.equal(captured.init?.method, "POST");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["Authorization"], client.authHeader);
  assert.match(headers["Content-Type"], /text\/xml/);
  assert.match(captured.init?.body as string, /<OTA_HotelInvCountNotifRQ/);
});

test("client: 429 triggers retry until max attempts (then succeeds when server stops)", async () => {
  let calls = 0;
  const client = new BookingComClient(TEST_CREDS, {
    fetch: mockFetch(() => {
      calls++;
      if (calls < 3) return new Response("rate limited", { status: 429 });
      return xmlReply(true);
    }),
    backoffBaseMs: 1,
    maxRetries: 3,
  });
  const result = await client.pushAvailability({
    roomId: "r",
    ranges: [{ start: new Date(), end: new Date(), availability: 1 }],
    timestamp: FROZEN_DATE,
  });
  assert.equal(result.status, 200);
  assert.equal(result.apiCallsCount, 3);
  assert.equal(calls, 3);
});

test("client: 5xx triggers retry; final 5xx is returned to caller", async () => {
  let calls = 0;
  const client = new BookingComClient(TEST_CREDS, {
    fetch: mockFetch(() => {
      calls++;
      return new Response("oops", { status: 503 });
    }),
    backoffBaseMs: 1,
    maxRetries: 3,
  });
  const result = await client.pushAvailability({
    roomId: "r",
    ranges: [{ start: new Date(), end: new Date(), availability: 1 }],
    timestamp: FROZEN_DATE,
  });
  assert.equal(result.status, 503);
  assert.equal(result.apiCallsCount, 3);
  assert.equal(calls, 3);
});

test("client: 4xx (other than 429) returns immediately, no retry", async () => {
  let calls = 0;
  const client = new BookingComClient(TEST_CREDS, {
    fetch: mockFetch(() => {
      calls++;
      return new Response("nope", { status: 401 });
    }),
    backoffBaseMs: 1,
    maxRetries: 3,
  });
  const result = await client.pushAvailability({
    roomId: "r",
    ranges: [{ start: new Date(), end: new Date(), availability: 1 }],
    timestamp: FROZEN_DATE,
  });
  assert.equal(result.status, 401);
  assert.equal(calls, 1);
});

test("client: thrown fetch error retries up to maxRetries then throws", async () => {
  let calls = 0;
  const client = new BookingComClient(TEST_CREDS, {
    fetch: mockFetch(() => {
      calls++;
      throw new Error("network down");
    }),
    backoffBaseMs: 1,
    maxRetries: 3,
  });
  await assert.rejects(
    () =>
      client.pushAvailability({
        roomId: "r",
        ranges: [{ start: new Date(), end: new Date(), availability: 1 }],
        timestamp: FROZEN_DATE,
      }),
    /failed after 3 attempts/,
  );
  assert.equal(calls, 3);
});

test("client: testConnection hits /test endpoint", async () => {
  let urlSeen = "";
  const client = new BookingComClient(TEST_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return new Response("ok", { status: 200 });
    }),
    backoffBaseMs: 1,
  });
  const result = await client.testConnection();
  assert.match(urlSeen, /\/test$/);
  assert.equal(result.status, 200);
});

test("client: pushAmenities sends JSON body keyed by hotel_id", async () => {
  let bodySeen = "";
  const client = new BookingComClient(TEST_CREDS, {
    fetch: mockFetch((_, init) => {
      bodySeen = init?.body as string;
      return new Response("ok", { status: 200 });
    }),
    backoffBaseMs: 1,
  });
  await client.pushAmenities(["pool", "wifi"]);
  const parsed = JSON.parse(bodySeen);
  assert.equal(parsed.hotel_id, "9999");
  assert.deepEqual(parsed.amenities, ["pool", "wifi"]);
});

// ===========================================================================
// 5) BookingComProvider — uses mocked client to exercise the full pipeline
// ===========================================================================

function makeProvider(
  fetch: typeof globalThis.fetch,
  overrides: Partial<typeof TEST_CREDS> = {},
): BookingComProvider {
  return new BookingComProvider({ ...TEST_CREDS, ...overrides }, {
    fetch,
    backoffBaseMs: 1,
  });
}

test("provider: implements ChannelManagerProvider (no missing methods)", () => {
  const provider = new BookingComProvider(TEST_CREDS);
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
});

test("provider: pushAvailability — success path returns counts + apiCallsCount=1", async () => {
  const provider = makeProvider(mockFetch(() => xmlReply(true)));
  const result = await provider.pushAvailability({
    villaId: "v1",
    externalPropertyId: "ROOM-A",
    startDate: new Date("2026-05-01"),
    endDate: new Date("2026-05-03"),
    availabilityPerDay: new Map([
      ["2026-05-01", 1],
      ["2026-05-02", 1],
      ["2026-05-03", 0],
    ]),
  });
  assert.equal(result.success, true);
  assert.equal(result.recordsProcessed, 3);
  assert.equal(result.recordsSucceeded, 3);
  assert.equal(result.apiCallsCount, 1);
});

test("provider: pushAvailability — error envelope flips success to false with parsed messages", async () => {
  const provider = makeProvider(mockFetch(() => xmlReply(false)));
  const result = await provider.pushAvailability({
    villaId: "v1",
    externalPropertyId: "r",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.equal(result.success, false);
  assert.equal(result.recordsFailed, 1);
  assert.ok(result.errors[0].message.includes("bad"));
  assert.equal(result.errors[0].field, "450");
});

test("provider: pushAvailability — empty input returns zero result, no API call", async () => {
  const provider = makeProvider(
    mockFetch(() => {
      throw new Error("should not call");
    }),
  );
  const result = await provider.pushAvailability({
    villaId: "v1",
    externalPropertyId: "r",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map(),
  });
  assert.equal(result.recordsProcessed, 0);
  assert.equal(result.apiCallsCount, 0);
});

test("provider: pushAvailability — thrown network error returns failure SyncResult (does not propagate)", async () => {
  const provider = makeProvider(
    mockFetch(() => {
      throw new Error("DNS failure");
    }),
  );
  const result = await provider.pushAvailability({
    villaId: "v1",
    externalPropertyId: "r",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([["2026-05-01", 1]]),
  });
  assert.equal(result.success, false);
  assert.match(result.errors[0].message, /DNS failure|after 3 attempts/);
});

test("provider: pushRates — success path", async () => {
  const provider = makeProvider(mockFetch(() => xmlReply(true)));
  const result = await provider.pushRates({
    villaId: "v1",
    externalPropertyId: "ROOM-A",
    ratePlanId: "RP-STANDARD",
    startDate: new Date("2026-05-01"),
    endDate: new Date("2026-05-02"),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 25000n, currency: "USD" }],
      ["2026-05-02", { amountMinor: 25000n, currency: "USD" }],
    ]),
  });
  assert.equal(result.success, true);
  assert.equal(result.recordsProcessed, 2);
});

test("provider: pushAmenities — non-2xx returns failure with truncated body", async () => {
  const provider = makeProvider(
    mockFetch(() => new Response("nope nope nope", { status: 422 })),
  );
  const result = await provider.pushAmenities({
    externalPropertyId: "r",
    amenities: ["pool", "wifi"],
  });
  assert.equal(result.success, false);
  assert.match(result.errors[0].message, /HTTP 422/);
});

test("provider: pullReservations — projects parsed XML to ChannelReservationData[]", async () => {
  const sampleXml = `<?xml version="1.0"?>
<OTA_HotelResRetrieveRS>
  <Success/>
  <ReservationsList>
    <HotelReservation ResStatus="Book" CreateDateTime="2026-04-30T08:00:00Z">
      <UniqueID ID="BK-A1"/>
      <RoomStays><RoomStay>
        <TimeSpan Start="2026-06-01" End="2026-06-04"/>
        <GuestCounts><GuestCount AgeQualifyingCode="10" Count="2"/></GuestCounts>
        <Total AmountAfterTax="450.00" CurrencyCode="USD"/>
      </RoomStay></RoomStays>
      <ResGuests><ResGuest><Profiles><ProfileInfo><Profile><Customer>
        <PersonName><GivenName>Bob</GivenName><Surname>Smith</Surname></PersonName>
      </Customer></Profile></ProfileInfo></Profiles></ResGuest></ResGuests>
    </HotelReservation>
  </ReservationsList>
</OTA_HotelResRetrieveRS>`;
  const provider = makeProvider(
    mockFetch(() => new Response(sampleXml, { status: 200 })),
  );
  const reservations = await provider.pullReservations({
    externalPropertyId: "9999",
  });
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].externalReservationId, "BK-A1");
  assert.equal(reservations[0].adults, 2);
  assert.equal(reservations[0].totalAmountMinor, 45000n);
});

test("provider: pullReservations — non-2xx returns empty array (does not throw cron)", async () => {
  const provider = makeProvider(
    mockFetch(() => new Response("server error", { status: 500 })),
  );
  const reservations = await provider.pullReservations({
    externalPropertyId: "9999",
  });
  assert.deepEqual(reservations, []);
});

// ===========================================================================
// 6) Webhook verification + parsing
// ===========================================================================

test("webhook: verifyWebhook accepts HMAC-SHA256 over raw body", () => {
  const provider = new BookingComProvider(TEST_CREDS);
  const payload = `{"event":"reservation_new"}`;
  const secret = "shared-secret";
  const sig = require("node:crypto")
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  assert.equal(provider.verifyWebhook(payload, sig, secret), true);
});

test("webhook: verifyWebhook accepts the 'sha256=' prefix variant", () => {
  const provider = new BookingComProvider(TEST_CREDS);
  const payload = `{"event":"reservation_modified"}`;
  const secret = "another-secret";
  const sig =
    "sha256=" +
    require("node:crypto")
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
  assert.equal(provider.verifyWebhook(payload, sig, secret), true);
});

test("webhook: verifyWebhook rejects mismatched signature (constant-time)", () => {
  const provider = new BookingComProvider(TEST_CREDS);
  const payload = `{"event":"x"}`;
  const wrongSig = "0".repeat(64);
  assert.equal(provider.verifyWebhook(payload, wrongSig, "secret"), false);
});

test("webhook: verifyWebhook rejects missing secret or signature", () => {
  const provider = new BookingComProvider(TEST_CREDS);
  assert.equal(provider.verifyWebhook("payload", "", "secret"), false);
  assert.equal(provider.verifyWebhook("payload", "sig", ""), false);
});

test("webhook: parseWebhook normalizes Booking event names to canonical types", () => {
  const provider = new BookingComProvider(TEST_CREDS);
  const cases: Array<[string, string]> = [
    ["reservation_new", "reservation.created"],
    ["reservation_modified", "reservation.modified"],
    ["reservation_cancelled", "reservation.cancelled"],
    ["reservation_canceled", "reservation.cancelled"],
    ["rate_modified", "rate.modified"],
    ["inventory_modified", "inventory.modified"],
  ];
  for (const [bookingEvent, expected] of cases) {
    const event = provider.parseWebhook({
      event: bookingEvent,
      reservation_id: "BK-1",
    });
    assert.ok(event, `expected event for ${bookingEvent}`);
    assert.equal(event!.type, expected);
  }
});

test("webhook: parseWebhook returns null for unknown event types", () => {
  const provider = new BookingComProvider(TEST_CREDS);
  assert.equal(provider.parseWebhook({ event: "unknown_event" }), null);
  assert.equal(provider.parseWebhook({}), null);
});

test("webhook: parseWebhook extracts reservation_id + timestamp", () => {
  const provider = new BookingComProvider(TEST_CREDS);
  const event = provider.parseWebhook({
    event: "reservation_new",
    reservation_id: "BK-XYZ",
    timestamp: "2026-05-06T12:00:00Z",
  });
  assert.ok(event);
  assert.equal(event!.externalReservationId, "BK-XYZ");
  assert.equal(event!.timestamp.toISOString(), "2026-05-06T12:00:00.000Z");
});

// ===========================================================================
// 7) testConnection
// ===========================================================================

test("testConnection: success path reports connected:true with status 200", async () => {
  const provider = makeProvider(
    mockFetch(() => new Response("OK", { status: 200 })),
  );
  const result = await provider.testConnection();
  assert.equal(result.connected, true);
  assert.equal(result.details.channel, "booking_com");
  assert.equal(result.details.status, 200);
});

test("testConnection: 401 reports connected:false (auth failed)", async () => {
  const provider = makeProvider(
    mockFetch(() => new Response("unauthorized", { status: 401 })),
  );
  const result = await provider.testConnection();
  assert.equal(result.connected, false);
  assert.equal(result.details.status, 401);
});

test("testConnection: thrown error degrades to connected:false with error details", async () => {
  const provider = makeProvider(
    mockFetch(() => {
      throw new Error("DNS failure");
    }),
  );
  const result = await provider.testConnection();
  assert.equal(result.connected, false);
  assert.match(String(result.details.error), /failed after 3 attempts|DNS failure/);
});

// ===========================================================================
// 8) Range coalescing helpers
// ===========================================================================

test("coalesce: mapAvailabilityToRanges merges contiguous days with same availability", () => {
  const input = {
    villaId: "v1",
    externalPropertyId: "p",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([
      ["2026-05-01", 1],
      ["2026-05-02", 1],
      ["2026-05-03", 1],
      ["2026-05-04", 0],
      ["2026-05-05", 0],
      ["2026-05-06", 1],
    ]),
  };
  const ranges = mapAvailabilityToRanges(input);
  assert.equal(ranges.length, 3);
  assert.equal(ranges[0].availability, 1);
  assert.equal(ranges[0].start.toISOString().slice(0, 10), "2026-05-01");
  assert.equal(ranges[0].end.toISOString().slice(0, 10), "2026-05-03");
  assert.equal(ranges[1].availability, 0);
  assert.equal(ranges[2].start.toISOString().slice(0, 10), "2026-05-06");
});

test("coalesce: mapAvailabilityToRanges handles single day + non-contiguous", () => {
  const ranges = mapAvailabilityToRanges({
    villaId: "v1",
    externalPropertyId: "p",
    startDate: new Date(),
    endDate: new Date(),
    availabilityPerDay: new Map([
      ["2026-05-01", 1],
      ["2026-05-05", 1],
    ]),
  });
  assert.equal(ranges.length, 2);
});

test("coalesce: mapRatesToRanges merges by amount + currency", () => {
  const ranges = mapRatesToRanges({
    villaId: "v1",
    externalPropertyId: "p",
    ratePlanId: "rp",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 25000n, currency: "USD" }],
      ["2026-05-02", { amountMinor: 25000n, currency: "USD" }],
      ["2026-05-03", { amountMinor: 30000n, currency: "USD" }],
    ]),
  });
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].amount, 250);
  assert.equal(ranges[1].amount, 300);
});

// ===========================================================================
// 9) Selector integration (P1.B promotion)
// ===========================================================================

test("selector integration: returns BookingComProvider for booking_com + creds", () => {
  const provider = selectChannelProvider("booking_com", {
    channel: "booking_com",
    username: "u",
    password: "p",
    hotelId: "1",
    environment: "sandbox",
  });
  assert.ok(provider instanceof BookingComProvider);
  assert.equal(provider.name, "booking_com");
});

test("selector integration: dry-run preserved when booking_com creds are null", () => {
  const provider = selectChannelProvider("booking_com", null);
  // Imported from index — we verify it's not the BookingComProvider class.
  assert.ok(!(provider instanceof BookingComProvider));
  assert.equal(provider.name, "booking_com");
});

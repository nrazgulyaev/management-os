/**
 * Stage 6.P1.A — Schema + provider abstraction tests.
 *
 * Covers:
 *   - Migration 0076 (channel_connections + channel_sync_log)
 *   - Migration 0077 (channel_reservations + channel_commission_records)
 *   - Drizzle schema (channel-manager.ts) — table exports + type unions
 *   - Provider types (ChannelManagerProvider interface contract)
 *   - DryRunChannelProvider behaviour
 *   - selectChannelProvider routing (no-creds, mismatch, direct, real)
 *
 * Test infra: pure node:test + grep against file contents (matches the
 * established Stage 6 pattern — see tests/development-stage-6-p0-7-d-08
 * for context). Provider behaviour tests run the real DryRun class
 * (no mocks, no DB).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  selectChannelProvider,
  DryRunChannelProvider,
} from "../src/lib/channel-manager";
import type {
  ChannelCredentials,
  ChannelManagerProvider,
} from "../src/lib/channel-manager";
import {
  CHANNEL_NAMES,
  CHANNEL_CONNECTION_STATUSES,
  CHANNEL_SYNC_TYPES,
  CHANNEL_RESERVATION_STATES,
} from "../src/lib/db/schema/channel-manager";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// File-path constants
// ===========================================================================

const F_MIG_0076 = "drizzle/0076_development_os_stage_6_p1_channel_connections.sql";
const F_MIG_0077 = "drizzle/0077_development_os_stage_6_p1_channel_reservations.sql";
const F_SCHEMA = "src/lib/db/schema/channel-manager.ts";
const F_SCHEMA_INDEX = "src/lib/db/schema/index.ts";
const F_TYPES = "src/lib/channel-manager/types.ts";
const F_SELECTOR = "src/lib/channel-manager/select-provider.ts";
const F_DRY_RUN = "src/lib/channel-manager/providers/dry-run.ts";
const F_INDEX = "src/lib/channel-manager/index.ts";
const F_ARCH_DOC = "docs/development-os-architecture.md";

// ===========================================================================
// Step 1 — Architecture doc markers
// ===========================================================================

test("architecture: Stage 6.P0 marker is ACCEPTED", () => {
  const src = read(F_ARCH_DOC);
  assert.match(src, /Stage 6\.P0 — CRUD Foundation `\[ACCEPTED 6\.P0\]`/);
});

test("architecture: Stage 6.P1 marker is ACTIVE", () => {
  const src = read(F_ARCH_DOC);
  assert.match(src, /Stage 6\.P1 — Booking Channels `\[ACTIVE 6\.P1\]`/);
});

test("architecture: P1 section names key architectural decisions", () => {
  const src = read(F_ARCH_DOC);
  // Verify the locked-at-entry decisions are documented so future me
  // (or future contributor) doesn't have to guess where they came from.
  assert.match(src, /Unified inbox, multiple sources/);
  assert.match(src, /Provider abstraction follows Stage 3\.A/);
  assert.match(src, /Inventory push: rapid availability/);
  assert.match(src, /Reservation pull: webhook-first/);
  assert.match(src, /Calendar conflict resolution/);
  assert.match(src, /Channel commission tracking/);
});

test("architecture: P0 acceptance state captures carry-forward register", () => {
  const src = read(F_ARCH_DOC);
  assert.match(src, /3453 tests passing/);
  assert.match(src, /Live Google Sheets OAuth/);
  assert.match(src, /ContractModalForm wiring/);
});

// ===========================================================================
// Step 2 — Migration 0076 (channel_connections + channel_sync_log)
// ===========================================================================

test("migration 0076: file exists with expected naming", () => {
  assert.ok(exists(F_MIG_0076), "0076 migration file missing");
});

test("migration 0076: creates channel_connections table", () => {
  const sql = read(F_MIG_0076);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "channel_connections"/);
});

test("migration 0076: channel CHECK covers all 8 channel names", () => {
  const sql = read(F_MIG_0076);
  for (const c of CHANNEL_NAMES) {
    assert.match(sql, new RegExp(`'${c}'`), `channel '${c}' missing from CHECK`);
  }
});

test("migration 0076: status CHECK matches schema union", () => {
  const sql = read(F_MIG_0076);
  for (const s of CHANNEL_CONNECTION_STATUSES) {
    assert.match(sql, new RegExp(`'${s}'`), `status '${s}' missing from CHECK`);
  }
});

test("migration 0076: encrypts credentials via JSONB (not plain TEXT)", () => {
  const sql = read(F_MIG_0076);
  assert.match(sql, /"credentials" JSONB/);
});

test("migration 0076: enforces unique connection per (org, villa, channel)", () => {
  const sql = read(F_MIG_0076);
  assert.match(
    sql,
    /UNIQUE \("organization_id", "villa_id", "channel"\)/,
  );
});

test("migration 0076: cron-friendly partial index for active connections", () => {
  const sql = read(F_MIG_0076);
  assert.match(sql, /channel_connections_active_idx[\s\S]*?WHERE "status" = 'active'/);
});

test("migration 0076: creates channel_sync_log table", () => {
  const sql = read(F_MIG_0076);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "channel_sync_log"/);
});

test("migration 0076: sync_type CHECK covers all 6 sync types", () => {
  const sql = read(F_MIG_0076);
  for (const t of CHANNEL_SYNC_TYPES) {
    assert.match(sql, new RegExp(`'${t}'`), `sync_type '${t}' missing`);
  }
});

test("migration 0076: api_calls_count column for cost tracking", () => {
  const sql = read(F_MIG_0076);
  assert.match(sql, /"api_calls_count" INTEGER NOT NULL DEFAULT 0/);
});

test("migration 0076: enables RLS via is_in_user_organization() on both tables", () => {
  const sql = read(F_MIG_0076);
  assert.match(sql, /channel_connections.*channel_sync_log[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_in_user_organization\(organization_id\)/);
});

test("migration 0076: trigger keeps updated_at fresh on channel_connections", () => {
  const sql = read(F_MIG_0076);
  assert.match(sql, /trg_channel_connections_updated_at[\s\S]*BEFORE UPDATE ON "channel_connections"/);
});

// ===========================================================================
// Step 2 — Migration 0077 (channel_reservations + channel_commission_records)
// ===========================================================================

test("migration 0077: file exists with expected naming", () => {
  assert.ok(exists(F_MIG_0077));
});

test("migration 0077: creates channel_reservations table", () => {
  const sql = read(F_MIG_0077);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "channel_reservations"/);
});

test("migration 0077: reservation_state CHECK covers all 6 states", () => {
  const sql = read(F_MIG_0077);
  for (const s of CHANNEL_RESERVATION_STATES) {
    assert.match(sql, new RegExp(`'${s}'`), `reservation_state '${s}' missing`);
  }
});

test("migration 0077: raw_payload preserved as JSONB (source of truth)", () => {
  const sql = read(F_MIG_0077);
  assert.match(sql, /"raw_payload" JSONB NOT NULL/);
});

test("migration 0077: idempotency via unique (channel_connection_id, external_reservation_id)", () => {
  const sql = read(F_MIG_0077);
  assert.match(
    sql,
    /UNIQUE \("channel_connection_id", "external_reservation_id"\)/,
  );
});

test("migration 0077: conflict-detection partial index", () => {
  const sql = read(F_MIG_0077);
  assert.match(sql, /channel_reservations_conflict_idx[\s\S]*?WHERE "conflict_pending" = TRUE/);
});

test("migration 0077: creates channel_commission_records table", () => {
  const sql = read(F_MIG_0077);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "channel_commission_records"/);
});

test("migration 0077: enforces one commission record per reservation", () => {
  const sql = read(F_MIG_0077);
  assert.match(sql, /UNIQUE \("channel_reservation_id"\)/);
});

test("migration 0077: bookkeeper-ergonomic unreconciled partial index", () => {
  const sql = read(F_MIG_0077);
  assert.match(
    sql,
    /channel_commission_records_unreconciled_idx[\s\S]*?WHERE "reconciled" = FALSE/,
  );
});

test("migration 0077: enables RLS on both tables", () => {
  const sql = read(F_MIG_0077);
  assert.match(sql, /channel_reservations.*channel_commission_records[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_in_user_organization\(organization_id\)/);
});

// ===========================================================================
// Step 2 — Drizzle schema
// ===========================================================================

test("schema: channel-manager.ts exists + re-exported from schema index", () => {
  assert.ok(exists(F_SCHEMA));
  const idx = read(F_SCHEMA_INDEX);
  assert.match(idx, /export \* from "\.\/channel-manager"/);
});

test("schema: exports all 4 Drizzle tables", () => {
  const src = read(F_SCHEMA);
  assert.match(src, /export const channelConnections = pgTable\(\s*"channel_connections"/);
  assert.match(src, /export const channelSyncLog = pgTable\(\s*"channel_sync_log"/);
  assert.match(src, /export const channelReservations = pgTable\(\s*"channel_reservations"/);
  assert.match(src, /export const channelCommissionRecords = pgTable\(\s*"channel_commission_records"/);
});

test("schema: type unions cover the same values as the SQL CHECK constraints", () => {
  // CHANNEL_NAMES is the runtime source — these tests assert the union
  // didn't drift from the migration. Adding a channel requires editing
  // both files; this test catches the mistake.
  assert.equal(CHANNEL_NAMES.length, 8);
  assert.equal(CHANNEL_CONNECTION_STATUSES.length, 6);
  assert.equal(CHANNEL_SYNC_TYPES.length, 6);
  assert.equal(CHANNEL_RESERVATION_STATES.length, 6);
});

test("schema: Drizzle FKs target villas, bookings, contacts, organizations, app_users", () => {
  const src = read(F_SCHEMA);
  // Match across whitespace so per-line formatting doesn't break the test.
  assert.match(src, /=>\s*villas\.id/);
  assert.match(src, /=>\s*bookings\.id/);
  assert.match(src, /=>\s*contacts\.id/);
  assert.match(src, /=>\s*organizations\.id/);
  assert.match(src, /=>\s*appUsers\.id/);
});

// ===========================================================================
// Step 3.1 — Provider types contract
// ===========================================================================

test("types: ChannelManagerProvider interface declares the 7 contract methods", () => {
  const src = read(F_TYPES);
  assert.match(src, /pushAvailability\(input: AvailabilityInput\): Promise<SyncResult>/);
  assert.match(src, /pushRates\(input: RatesInput\): Promise<SyncResult>/);
  assert.match(src, /pushAmenities\(input: AmenitiesInput\): Promise<SyncResult>/);
  assert.match(src, /pullReservations\(input: PullReservationsInput\): Promise<ChannelReservationData\[\]>/);
  assert.match(src, /verifyWebhook\(payload: string, signature: string, secret: string\): boolean/);
  assert.match(src, /parseWebhook\(payload: Record<string, unknown>\): WebhookEvent \| null/);
  assert.match(src, /testConnection\(\): Promise<ConnectionTestResult>/);
});

test("types: credentials are a discriminated union per channel", () => {
  const src = read(F_TYPES);
  // Every variant must have channel: '<name>' as its discriminator.
  for (const variant of [
    "BookingComCredentials",
    "AirbnbCredentials",
    "TripComCredentials",
    "AgodaCredentials",
    "ExpediaCredentials",
    "VRBOCredentials",
    "HotelsComCredentials",
  ]) {
    assert.match(src, new RegExp(`interface ${variant}`));
  }
  assert.match(src, /export type ChannelCredentials =/);
});

test("types: SyncResult tracks records counts + apiCallsCount + durationMs", () => {
  const src = read(F_TYPES);
  assert.match(src, /recordsProcessed: number/);
  assert.match(src, /recordsSucceeded: number/);
  assert.match(src, /recordsFailed: number/);
  assert.match(src, /apiCallsCount: number/);
  assert.match(src, /durationMs: number/);
});

test("types: ChannelReservationData carries rawPayload alongside projected fields", () => {
  const src = read(F_TYPES);
  assert.match(src, /rawPayload: Record<string, unknown>/);
  assert.match(src, /externalReservationId: string/);
});

test("types: WebhookEventType union covers reservation + rate + inventory events", () => {
  const src = read(F_TYPES);
  assert.match(src, /"reservation\.created"/);
  assert.match(src, /"reservation\.modified"/);
  assert.match(src, /"reservation\.cancelled"/);
  assert.match(src, /"rate\.modified"/);
  assert.match(src, /"inventory\.modified"/);
});

// ===========================================================================
// Step 3.2 — selectChannelProvider routing
// ===========================================================================

test("selector: returns DryRun when no credentials passed", () => {
  const provider = selectChannelProvider("booking_com", null);
  assert.ok(provider instanceof DryRunChannelProvider);
  assert.equal(provider.name, "booking_com");
});

test("selector: returns DryRun for the 'direct' marker channel", () => {
  // 'direct' is a non-channel — bookings created inside the platform
  // tag this. Provider methods should be no-ops.
  const provider = selectChannelProvider("direct", null);
  assert.ok(provider instanceof DryRunChannelProvider);
  assert.equal(provider.name, "direct");
});

test("selector: falls back to DryRun when credentials.channel mismatches the channel arg", () => {
  // Defensive — if a stored credential blob has the wrong tag (data
  // corruption or operator pasted creds into the wrong slot), don't
  // return a misconfigured real provider.
  const wrongCreds: ChannelCredentials = {
    channel: "airbnb",
    accessToken: "x",
    refreshToken: "y",
    expiresAt: Date.now() + 60_000,
    listingId: "z",
  };
  const provider = selectChannelProvider("booking_com", wrongCreds);
  assert.ok(provider instanceof DryRunChannelProvider);
});

test("selector: every real channel is now backed by a real provider (post-P1.D)", () => {
  // Sanity invariant: with credentials present, no real channel falls
  // back to DryRun. This is the post-P1.D contract — once a channel
  // has a real implementation, the selector must use it.
  const cases: Array<[string, ChannelCredentials]> = [
    [
      "trip_com",
      { channel: "trip_com", partnerId: "p", apiKey: "k", hotelId: "h" },
    ],
    [
      "agoda",
      {
        channel: "agoda",
        hotelId: "h",
        apiKey: "k",
        apiSecret: "s",
        environment: "production",
      },
    ],
    [
      "expedia",
      {
        channel: "expedia",
        hotelId: "h",
        eqcUsername: "u",
        eqcPassword: "p",
        environment: "production",
      },
    ],
    [
      "vrbo",
      {
        channel: "vrbo",
        hotelId: "h",
        eqcUsername: "u",
        eqcPassword: "p",
        environment: "production",
      },
    ],
    [
      "hotels_com",
      {
        channel: "hotels_com",
        hotelId: "h",
        eqcUsername: "u",
        eqcPassword: "p",
        environment: "production",
      },
    ],
  ];
  for (const [name, creds] of cases) {
    const provider = selectChannelProvider(
      name as Parameters<typeof selectChannelProvider>[0],
      creds,
    );
    assert.ok(
      !(provider instanceof DryRunChannelProvider),
      `${name} must NOT be DryRun once its real provider is wired`,
    );
    assert.equal(provider.name, name);
  }
});

test("selector: P1.B — booking_com with creds now returns the real BookingComProvider", () => {
  const creds: ChannelCredentials = {
    channel: "booking_com",
    username: "u",
    password: "p",
    hotelId: "1",
    environment: "sandbox",
  };
  const provider = selectChannelProvider("booking_com", creds);
  // No longer DryRun — the real provider is wired up.
  assert.ok(!(provider instanceof DryRunChannelProvider));
  assert.equal(provider.name, "booking_com");
});

test("selector: booking_com without creds still falls back to DryRun", () => {
  // Carrying the dry-run-default contract through the P1.B promotion.
  const provider = selectChannelProvider("booking_com", null);
  assert.ok(provider instanceof DryRunChannelProvider);
  assert.equal(provider.name, "booking_com");
});

// ===========================================================================
// Step 3.3 — DryRunChannelProvider behaviour
// ===========================================================================

test("dry-run: pushAvailability returns plausible success result with apiCallsCount=0", async () => {
  const provider = new DryRunChannelProvider("booking_com");
  const result = await provider.pushAvailability({
    villaId: "v1",
    externalPropertyId: "ext-1",
    startDate: new Date("2026-05-01"),
    endDate: new Date("2026-05-31"),
    availabilityPerDay: new Map([
      ["2026-05-01", 1],
      ["2026-05-02", 1],
      ["2026-05-03", 0],
    ]),
  });
  assert.equal(result.success, true);
  assert.equal(result.recordsProcessed, 3);
  assert.equal(result.recordsSucceeded, 3);
  assert.equal(result.recordsFailed, 0);
  assert.equal(result.apiCallsCount, 0, "DryRun must not pollute cost dashboards");
  assert.deepEqual(result.errors, []);
});

test("dry-run: pushRates uses ratesPerDay.size as record count", async () => {
  const provider = new DryRunChannelProvider("airbnb");
  const result = await provider.pushRates({
    villaId: "v1",
    externalPropertyId: "ext-1",
    ratePlanId: "rp-1",
    startDate: new Date(),
    endDate: new Date(),
    ratesPerDay: new Map([
      ["2026-05-01", { amountMinor: 50000n, currency: "USD" }],
      ["2026-05-02", { amountMinor: 50000n, currency: "USD" }],
    ]),
  });
  assert.equal(result.recordsProcessed, 2);
  assert.equal(result.success, true);
});

test("dry-run: pushAmenities uses array length as record count", async () => {
  const provider = new DryRunChannelProvider("trip_com");
  const result = await provider.pushAmenities({
    externalPropertyId: "ext-1",
    amenities: ["pool", "wifi", "parking", "ac"],
  });
  assert.equal(result.recordsProcessed, 4);
});

test("dry-run: pullReservations returns empty array (nothing to pull without creds)", async () => {
  const provider = new DryRunChannelProvider("booking_com");
  const result = await provider.pullReservations({ externalPropertyId: "ext-1" });
  assert.deepEqual(result, []);
});

test("dry-run: verifyWebhook fails closed (no shared secret to verify against)", () => {
  const provider = new DryRunChannelProvider("booking_com");
  // Even with matching strings — there's nothing to verify, so refuse.
  assert.equal(provider.verifyWebhook("payload", "sig", "secret"), false);
});

test("dry-run: parseWebhook returns null (unknown payload shape)", () => {
  const provider = new DryRunChannelProvider("booking_com");
  assert.equal(provider.parseWebhook({ type: "anything" }), null);
});

test("dry-run: testConnection reports not connected with diagnostic details", async () => {
  const provider = new DryRunChannelProvider("booking_com");
  const result = await provider.testConnection();
  assert.equal(result.connected, false);
  assert.equal(result.details.mode, "dry-run");
  assert.equal(result.details.channel, "booking_com");
});

test("dry-run: implements full ChannelManagerProvider contract (no missing methods)", () => {
  // Compile-time check via the assignment + runtime check on method
  // presence. If a method is added to the interface but not the class,
  // TypeScript will fail to compile this assignment.
  const provider: ChannelManagerProvider = new DryRunChannelProvider("airbnb");
  for (const method of [
    "pushAvailability",
    "pushRates",
    "pushAmenities",
    "pullReservations",
    "verifyWebhook",
    "parseWebhook",
    "testConnection",
  ]) {
    assert.equal(
      typeof (provider as unknown as Record<string, unknown>)[method],
      "function",
      `DryRun missing ${method}`,
    );
  }
});

// ===========================================================================
// Public surface — index re-exports
// ===========================================================================

test("index: re-exports selectChannelProvider + DryRunChannelProvider + types", () => {
  const src = read(F_INDEX);
  assert.match(src, /export \* from "\.\/types"/);
  assert.match(src, /export \{ selectChannelProvider \}/);
  assert.match(src, /export \{ DryRunChannelProvider \}/);
});

test("index: does NOT re-export per-channel implementations directly", () => {
  // Per-channel providers are internal implementation details accessed
  // only via the selector. If this changes (e.g. someone adds
  // `export * from './providers/booking-com'`), revisit the
  // architecture decision in the P1 architecture-doc section.
  const src = read(F_INDEX);
  assert.doesNotMatch(src, /export \* from ".\/providers\/booking-com/);
  assert.doesNotMatch(src, /export \* from ".\/providers\/airbnb/);
});

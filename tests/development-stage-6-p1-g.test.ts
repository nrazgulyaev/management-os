/**
 * Stage 6.P1.G — cron jobs + webhook routes + integrations dashboard
 * + service-layer orchestration tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// File path constants
// ===========================================================================

const F_CRON_INVENTORY =
  "src/lib/development/server/cron/channel-inventory-sync-job.ts";
const F_CRON_RATES =
  "src/lib/development/server/cron/channel-rates-sync-job.ts";
const F_CRON_RESERVATIONS =
  "src/lib/development/server/cron/channel-reservations-pull-job.ts";
const F_CRON_CONFLICT =
  "src/lib/development/server/cron/channel-conflict-detector-job.ts";
const F_CRON_COMMISSION =
  "src/lib/development/server/cron/channel-commission-reconciliation-job.ts";

const F_ROUTE_INVENTORY = "src/app/api/cron/channel-inventory-sync/route.ts";
const F_ROUTE_RATES = "src/app/api/cron/channel-rates-sync/route.ts";
const F_ROUTE_RESERVATIONS =
  "src/app/api/cron/channel-reservations-pull/route.ts";
const F_ROUTE_CONFLICT = "src/app/api/cron/channel-conflict-detector/route.ts";
const F_ROUTE_COMMISSION =
  "src/app/api/cron/channel-commission-reconciliation/route.ts";

const F_WEBHOOK_HANDLER = "src/lib/channel-manager/webhook-handler.ts";
const F_WEBHOOK_BOOKING =
  "src/app/api/webhooks/channels/booking-com/route.ts";
const F_WEBHOOK_AIRBNB = "src/app/api/webhooks/channels/airbnb/route.ts";
const F_WEBHOOK_TRIP = "src/app/api/webhooks/channels/trip-com/route.ts";
const F_WEBHOOK_AGODA = "src/app/api/webhooks/channels/agoda/route.ts";
const F_WEBHOOK_EXPEDIA = "src/app/api/webhooks/channels/expedia/route.ts";
const F_WEBHOOK_VRBO = "src/app/api/webhooks/channels/vrbo/route.ts";
const F_WEBHOOK_HOTELS_COM =
  "src/app/api/webhooks/channels/hotels-com/route.ts";

const F_INTEGRATIONS_PAGE =
  "src/app/(development-app)/development-os/integrations/page.tsx";
const F_SERVICE = "src/lib/channel-manager/service.ts";

const F_DISPATCHER = "src/features/jobs/actions.ts";
const F_CRON_INDEX = "src/lib/development/server/cron/index.ts";
const F_CRON_CHECKLIST = "docs/VERCEL-CRON-CHECKLIST.md";
const F_ARCH_DOC = "docs/development-os-architecture.md";

const F_DOC_ARCHITECTURE = "docs/CHANNEL-MANAGER-ARCHITECTURE.md";
const F_DOC_PARTNER = "docs/PARTNER-PROGRAM-SETUP.md";
const F_DOC_COMPLETE = "docs/STAGE-6-P1-COMPLETE.md";

// ===========================================================================
// 1) Cron handlers
// ===========================================================================

test("cron handlers: all 5 files exist", () => {
  for (const f of [
    F_CRON_INVENTORY,
    F_CRON_RATES,
    F_CRON_RESERVATIONS,
    F_CRON_CONFLICT,
    F_CRON_COMMISSION,
  ]) {
    assert.ok(exists(f), `${f} missing`);
  }
});

test("cron handlers: each imports from server-only + uses RunStatus values", () => {
  for (const f of [
    F_CRON_INVENTORY,
    F_CRON_RATES,
    F_CRON_RESERVATIONS,
    F_CRON_CONFLICT,
    F_CRON_COMMISSION,
  ]) {
    const src = read(f);
    assert.match(src, /^import "server-only";/m);
    // No "ok" / "partial" — those aren't valid RunStatus values.
    assert.doesNotMatch(src, /status: "ok"/);
    assert.doesNotMatch(src, /"partial":/);
  }
});

test("cron handlers: inventory-sync iterates active connections + calls service", () => {
  const src = read(F_CRON_INVENTORY);
  assert.match(src, /listActiveConnectionsForCron/);
  assert.match(src, /syncInventoryForConnection/);
});

test("cron handlers: rates-sync skips connections with no rates configured", () => {
  const src = read(F_CRON_RATES);
  assert.match(src, /skipped/);
  assert.match(src, /syncRatesForConnection/);
});

test("cron handlers: reservations-pull tracks created/updated/conflicts metrics", () => {
  const src = read(F_CRON_RESERVATIONS);
  assert.match(src, /pullAndIngestReservationsForConnection/);
  for (const o of ["created", "updated", "conflict_pending"]) {
    assert.match(src, new RegExp(`"${o}"`));
  }
});

test("cron handlers: conflict-detector calls detectAndFlagConflicts", () => {
  const src = read(F_CRON_CONFLICT);
  assert.match(src, /detectAndFlagConflicts/);
});

test("cron handlers: commission-reconciliation calls reconcileCommissionRecords", () => {
  const src = read(F_CRON_COMMISSION);
  assert.match(src, /reconcileCommissionRecords/);
});

// ===========================================================================
// 2) Cron routes
// ===========================================================================

test("cron routes: all 5 route files exist", () => {
  for (const f of [
    F_ROUTE_INVENTORY,
    F_ROUTE_RATES,
    F_ROUTE_RESERVATIONS,
    F_ROUTE_CONFLICT,
    F_ROUTE_COMMISSION,
  ]) {
    assert.ok(exists(f), `${f} missing`);
  }
});

test("cron routes: each delegates to handleCronJobRequest with the matching job key", () => {
  const cases: Array<[string, string]> = [
    [F_ROUTE_INVENTORY, "channel_inventory_sync"],
    [F_ROUTE_RATES, "channel_rates_sync"],
    [F_ROUTE_RESERVATIONS, "channel_reservations_pull"],
    [F_ROUTE_CONFLICT, "channel_conflict_detector"],
    [F_ROUTE_COMMISSION, "channel_commission_reconciliation"],
  ];
  for (const [path, key] of cases) {
    const src = read(path);
    assert.match(src, /handleCronJobRequest/);
    assert.match(src, new RegExp(`"${key}"`));
  }
});

test("dispatcher: all 5 channel jobs registered (KNOWN_JOBS + JobKey + executeJob switch)", () => {
  const src = read(F_DISPATCHER);
  for (const k of [
    "channel_inventory_sync",
    "channel_rates_sync",
    "channel_reservations_pull",
    "channel_conflict_detector",
    "channel_commission_reconciliation",
  ]) {
    // The string appears in three places: KNOWN_JOBS Set, JobKey union,
    // executeJob switch — that's the load-bearing trio for dispatch.
    const matches = src.match(new RegExp(`"${k}"`, "g"));
    assert.ok(
      matches && matches.length >= 2,
      `${k} should appear ≥2× (KNOWN_JOBS + executeJob); got ${matches?.length ?? 0}`,
    );
  }
});

test("dispatcher: each channel job has runChannel* import + executeJob case", () => {
  const src = read(F_DISPATCHER);
  for (const handler of [
    "runChannelInventorySync",
    "runChannelRatesSync",
    "runChannelReservationsPull",
    "runChannelConflictDetector",
    "runChannelCommissionReconciliation",
  ]) {
    assert.match(src, new RegExp(handler));
  }
});

test("cron/index.ts: re-exports all 5 channel handlers", () => {
  const src = read(F_CRON_INDEX);
  for (const h of [
    "runChannelInventorySync",
    "runChannelRatesSync",
    "runChannelReservationsPull",
    "runChannelConflictDetector",
    "runChannelCommissionReconciliation",
  ]) {
    assert.match(src, new RegExp(`export \\{ ${h} \\}`));
  }
});

// ===========================================================================
// 3) VERCEL-CRON-CHECKLIST
// ===========================================================================

test("cron checklist: lists all 5 channel routes in the routes table", () => {
  const src = read(F_CRON_CHECKLIST);
  for (const path of [
    "/api/cron/channel-inventory-sync",
    "/api/cron/channel-rates-sync",
    "/api/cron/channel-reservations-pull",
    "/api/cron/channel-conflict-detector",
    "/api/cron/channel-commission-reconciliation",
  ]) {
    assert.match(src, new RegExp(path.replace(/[/-]/g, "\\$&")));
  }
});

test("cron checklist: includes vercel.json crons entries with correct schedules", () => {
  const src = read(F_CRON_CHECKLIST);
  // Schedules per the launch prompt.
  assert.match(src, /\/api\/cron\/channel-inventory-sync"[,\s]+"schedule": "\*\/15 \* \* \* \*"/);
  assert.match(src, /\/api\/cron\/channel-rates-sync"[,\s]+"schedule": "\*\/30 \* \* \* \*"/);
  assert.match(src, /\/api\/cron\/channel-reservations-pull"[,\s]+"schedule": "\*\/5 \* \* \* \*"/);
  assert.match(src, /\/api\/cron\/channel-conflict-detector"[,\s]+"schedule": "0 \* \* \* \*"/);
  assert.match(src, /\/api\/cron\/channel-commission-reconciliation"[,\s]+"schedule": "0 2 \* \* \*"/);
});

// ===========================================================================
// 4) Webhook routes
// ===========================================================================

test("webhook routes: all 7 channel routes exist", () => {
  for (const f of [
    F_WEBHOOK_BOOKING,
    F_WEBHOOK_AIRBNB,
    F_WEBHOOK_TRIP,
    F_WEBHOOK_AGODA,
    F_WEBHOOK_EXPEDIA,
    F_WEBHOOK_VRBO,
    F_WEBHOOK_HOTELS_COM,
  ]) {
    assert.ok(exists(f), `${f} missing`);
  }
});

test("webhook routes: each delegates to handleChannelWebhook with the right channel + signature header", () => {
  const cases: Array<[string, string, string]> = [
    [F_WEBHOOK_BOOKING, "booking_com", "x-booking-signature"],
    [F_WEBHOOK_AIRBNB, "airbnb", "x-airbnb-signature"],
    [F_WEBHOOK_TRIP, "trip_com", "x-trip-signature"],
    [F_WEBHOOK_AGODA, "agoda", "x-agoda-signature"],
    [F_WEBHOOK_EXPEDIA, "expedia", "x-expedia-signature"],
    [F_WEBHOOK_VRBO, "vrbo", "x-vrbo-signature"],
    [F_WEBHOOK_HOTELS_COM, "hotels_com", "x-hotels-com-signature"],
  ];
  for (const [path, channel, header] of cases) {
    const src = read(path);
    assert.match(src, /handleChannelWebhook/);
    assert.match(src, new RegExp(`channel: "${channel}"`));
    assert.match(src, new RegExp(`signatureHeader: "${header}"`));
  }
});

test("webhook handler: shared helper exists with correct exports", () => {
  assert.ok(exists(F_WEBHOOK_HANDLER));
  const src = read(F_WEBHOOK_HANDLER);
  assert.match(src, /^import "server-only";/m);
  assert.match(src, /export async function handleChannelWebhook/);
  assert.match(src, /export const PICK_PROPERTY_ID/);
});

test("webhook handler: returns 401 on signature failure (channels back off, don't retry)", () => {
  const src = read(F_WEBHOOK_HANDLER);
  assert.match(src, /invalid signature/);
  assert.match(src, /status: 401/);
});

test("webhook handler: returns 404 on missing connection (config issue, not auth)", () => {
  const src = read(F_WEBHOOK_HANDLER);
  assert.match(src, /no matching channel connection/);
  assert.match(src, /status: 404/);
});

test("webhook handler: returns 200 quickly on success (no inline post-processing)", () => {
  const src = read(F_WEBHOOK_HANDLER);
  // Success path is a plain JSON response — no fire-and-forget tasks.
  assert.match(src, /ok: true/);
  assert.match(src, /status: 200/);
});

test("webhook handler: PICK_PROPERTY_ID covers all 7 real channels (not direct)", () => {
  const src = read(F_WEBHOOK_HANDLER);
  for (const c of [
    "booking_com",
    "airbnb",
    "trip_com",
    "agoda",
    "expedia",
    "vrbo",
    "hotels_com",
  ]) {
    assert.match(src, new RegExp(`${c}: \\(p:`));
  }
  // Direct is intentionally NOT in the picker map (direct isn't a real channel).
  assert.doesNotMatch(src, /direct: \(p:/);
});

// ===========================================================================
// 5) Service layer additions
// ===========================================================================

test("service: P1.G additions (sync helpers + webhook orchestration) exported", () => {
  const src = read(F_SERVICE);
  for (const fn of [
    "syncInventoryForConnection",
    "syncRatesForConnection",
    "pullAndIngestReservationsForConnection",
    "handleWebhookForChannel",
    "listActiveConnectionsForCron",
    "detectAndFlagConflicts",
    "reconcileCommissionRecords",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `${fn} missing`,
    );
  }
});

test("service: syncInventoryForConnection skips non-active connections", () => {
  const src = read(F_SERVICE);
  // Status check before dispatching: only active connections sync.
  assert.match(
    src,
    /if \(connection\.status !== "active"\)[\s\S]*?skipping/,
  );
});

test("service: syncInventoryForConnection logs to channel_sync_log + updates last_inventory_sync_*", () => {
  const src = read(F_SERVICE);
  assert.match(src, /db\.insert\(channelSyncLog\)/);
  assert.match(src, /lastInventorySyncAt: new Date\(\)/);
  assert.match(src, /lastInventorySyncStatus/);
});

test("service: handleWebhookForChannel routes by event type to the right handler", () => {
  const src = read(F_SERVICE);
  // Reservation events → handleIncomingReservation.
  assert.match(src, /event\.type === "reservation\.created"/);
  // Rate / inventory events → flagged for follow-up sync.
  assert.match(src, /rate_sync_triggered/);
  assert.match(src, /inventory_sync_triggered/);
});

test("service: handleWebhookForChannel verifies signature before processing", () => {
  const src = read(F_SERVICE);
  // Verification short-circuits before parsing the payload.
  assert.match(src, /provider\.verifyWebhook/);
  // Failed verification logs to sync_log + returns invalid signature.
  assert.match(src, /signature verification failed/);
});

test("service: detectAndFlagConflicts skips cancelled/no_show reservations", () => {
  const src = read(F_SERVICE);
  assert.match(
    src,
    /reservationState === "cancelled"[\s\S]*?reservationState === "no_show"/,
  );
});

test("service: reconcileCommissionRecords auto-reconciles invoice+payment-both-true rows", () => {
  const src = read(F_SERVICE);
  assert.match(src, /eq\(channelCommissionRecords\.invoiceReceived, true\)/);
  assert.match(src, /eq\(channelCommissionRecords\.paymentMade, true\)/);
});

// ===========================================================================
// 6) Integrations dashboard
// ===========================================================================

test("integrations page: exists + renders channel manager card with stats", () => {
  assert.ok(exists(F_INTEGRATIONS_PAGE));
  const src = read(F_INTEGRATIONS_PAGE);
  assert.match(src, /Channel manager/);
  assert.match(src, /Active connections/);
  assert.match(src, /Connections in error/);
  assert.match(src, /API calls \(7d\)/);
});

test("integrations page: links to channels grid + inbox + conflicts", () => {
  const src = read(F_INTEGRATIONS_PAGE);
  assert.match(src, /\/development-os\/channels"/);
  assert.match(src, /\/development-os\/channels\/inbox/);
  assert.match(src, /\/development-os\/channels\/conflicts/);
});

test("integrations page: roadmap placeholder cards present (Stage 10.B-CLEANUP changed P-stage badges to 'Soon')", () => {
  const src = read(F_INTEGRATIONS_PAGE);
  // Stage 10.B-CLEANUP renamed the per-card stage prop from internal
  // phase refs (P2..P6) to user-meaningful "Soon" badges. The 5 roadmap
  // categories themselves remain.
  for (const title of [
    'title="Communications"',
    'title="Banking + Payments"',
    'title="Marketing + Analytics"',
    'title="Productivity"',
    'title="AI Agents"',
  ]) {
    assert.ok(src.includes(title), `expected placeholder ${title}`);
  }
  const soonCount = src.match(/stage="Soon"/g) ?? [];
  assert.ok(
    soonCount.length >= 5,
    `expected ≥5 'Soon' placeholder badges, got ${soonCount.length}`,
  );
});

// ===========================================================================
// 7) Documentation
// ===========================================================================

test("docs: CHANNEL-MANAGER-ARCHITECTURE exists with all 7 channels", () => {
  assert.ok(exists(F_DOC_ARCHITECTURE));
  const src = read(F_DOC_ARCHITECTURE);
  for (const c of [
    "Booking.com",
    "Airbnb",
    "Trip.com",
    "Agoda",
    "Expedia",
    "VRBO",
    "Hotels.com",
  ]) {
    assert.match(src, new RegExp(c.replace(/\./g, "\\.")));
  }
});

test("docs: PARTNER-PROGRAM-SETUP exists with apply-here links for each channel", () => {
  assert.ok(exists(F_DOC_PARTNER));
  const src = read(F_DOC_PARTNER);
  // Each channel has a "Where to apply" line with a real URL.
  for (const c of [
    "partner.booking.com",
    "airbnb.com/partner",
    "trip.com",
    "ycs.agoda.com",
    "expediapartnercentral.com",
  ]) {
    assert.match(src, new RegExp(c.replace(/\./g, "\\.")));
  }
});

test("docs: STAGE-6-P1-COMPLETE rollup doc exists", () => {
  assert.ok(exists(F_DOC_COMPLETE));
});

test("architecture doc: Stage 6.P1 + Stage 6.P2 both marked ACCEPTED", () => {
  // Stage 6.P2 closed at the end of P2.F; the ACTIVE marker has moved
  // forward (currently to P3 once that sub-stage is opened).
  const src = read(F_ARCH_DOC);
  assert.match(src, /Stage 6\.P1 — Booking Channels `\[ACCEPTED 6\.P1\]`/);
  assert.match(src, /Stage 6\.P2 — Communications `\[ACCEPTED 6\.P2\]`/);
});

test("architecture doc: P1 acceptance state captures cron + webhook + provider counts", () => {
  const src = read(F_ARCH_DOC);
  assert.match(src, /78 cron routes/);
  assert.match(src, /7 channel webhook routes/);
  assert.match(src, /7 channel providers shipped/);
});

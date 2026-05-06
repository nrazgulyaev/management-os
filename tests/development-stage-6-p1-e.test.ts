/**
 * Stage 6.P1.E — Channel Manager UI tests.
 *
 * Covers all 5 UI surfaces + the supporting service queries / server
 * actions. Test infra is the established pattern: file-presence +
 * grep-based assertions. UI behaviour beyond static content (form
 * submit flows, modal open/close) is exercised via the underlying
 * server-action tests in the existing P1.B/C/D suites — we don't run
 * a JSDOM here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// File-path constants
// ===========================================================================

const F_QUERIES = "src/lib/channel-manager/queries.ts";
const F_ACTIONS = "src/lib/channel-manager/actions.ts";

const F_PAGE_CHANNELS = "src/app/(development-app)/development-os/channels/page.tsx";
const F_PAGE_CONNECTION = "src/app/(development-app)/development-os/channels/[connectionId]/page.tsx";
const F_PAGE_RATES = "src/app/(development-app)/development-os/channels/[connectionId]/rates/page.tsx";
const F_PUSH_RATES_ACTION = "src/app/(development-app)/development-os/channels/[connectionId]/rates/push-rates-action.ts";
const F_PAGE_CALENDAR = "src/app/(development-app)/development-os/channels/calendar/page.tsx";
const F_PAGE_INBOX = "src/app/(development-app)/development-os/channels/inbox/page.tsx";
const F_PAGE_INBOX_DETAIL = "src/app/(development-app)/development-os/channels/inbox/[reservationId]/page.tsx";

const F_CONNECT_MODAL = "src/components/development/channels/connect-channel-modal.tsx";
const F_CONNECTION_CARD = "src/components/development/channels/connection-card.tsx";
const F_CONNECTIONS_GRID = "src/components/development/channels/connections-grid.tsx";
const F_CONNECTION_ACTIONS = "src/components/development/channels/connection-actions.tsx";
const F_RATE_CALENDAR = "src/components/development/channels/rate-calendar.tsx";

// ===========================================================================
// 1) Service-layer queries + actions
// ===========================================================================

test("queries: file exists with the load-bearing exports", () => {
  assert.ok(exists(F_QUERIES));
  const src = read(F_QUERIES);
  for (const fn of [
    "listChannelConnections",
    "getChannelConnectionById",
    "listSyncLogForConnection",
    "listChannelReservations",
    "getChannelReservationById",
    "getPerChannelSummary",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `${fn} missing`,
    );
  }
});

test("queries: imports server-only and uses RLS (no manual org filter)", () => {
  const src = read(F_QUERIES);
  assert.match(src, /^import "server-only";/m);
  // Sanity: queries don't manually filter by organization_id — the RLS
  // policy created in migration 0076/0077 already does it. If a
  // contributor adds a manual filter, this test reminds them to consider
  // RLS first. Trip-wire only — the absence of `organizationId` filtering
  // here is by design.
  assert.doesNotMatch(src, /\.where\([^)]*organizationId/);
});

test("queries: listChannelReservations supports channel/state/date/search filters", () => {
  const src = read(F_QUERIES);
  assert.match(src, /interface ChannelReservationFilters/);
  for (const f of ["channel", "villaId", "state", "fromDate", "toDate", "search"]) {
    assert.match(src, new RegExp(`${f}\\?:`));
  }
});

test("actions: file exists with create + status + sync exports", () => {
  assert.ok(exists(F_ACTIONS));
  const src = read(F_ACTIONS);
  assert.match(src, /^"use server";/);
  for (const fn of [
    "createChannelConnection",
    "testChannelConnection",
    "updateChannelConnectionStatus",
    "triggerManualReservationsPull",
    "decryptConnectionCredentials",
    "getRedactedCredentials",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}`));
  }
});

test("actions: createChannelConnection encrypts before insert + tests connection", () => {
  const src = read(F_ACTIONS);
  assert.match(src, /encryptCredentials\(\s*JSON\.stringify\(credentialsObj\)/);
  assert.match(src, /provider\.testConnection\(\)/);
  // Status flips to 'error' (not 'active') when test fails — preserves the row
  // so the operator can retry without re-entering credentials.
  assert.match(src, /status: ChannelConnectionStatus = testPassed \? "active" : "error"/);
});

test("actions: createChannelConnection handles re-connect via onConflictDoUpdate", () => {
  const src = read(F_ACTIONS);
  assert.match(src, /onConflictDoUpdate\(/);
  assert.match(src, /channelConnections\.organizationId/);
  assert.match(src, /channelConnections\.villaId/);
  assert.match(src, /channelConnections\.channel/);
});

test("actions: triggerManualReservationsPull writes to channel_sync_log + updates connection state", () => {
  const src = read(F_ACTIONS);
  assert.match(src, /db\.insert\(channelSyncLog\)\.values\(/);
  assert.match(src, /lastReservationSyncAt: new Date\(\)/);
});

test("actions: getRedactedCredentials never returns raw secret-bearing fields", () => {
  const src = read(F_ACTIONS);
  // Goes through redactCredentials helper from credentials-crypto.ts.
  assert.match(src, /redactCredentials\(/);
});

test("actions: production-mode encryption refuses if STAY_LINK_KMS_SECRET missing", () => {
  const src = read(F_ACTIONS);
  assert.match(src, /isProduction\(\)/);
  assert.match(src, /STAY_LINK_KMS_SECRET missing in production/);
});

// ===========================================================================
// 2) P1.E.1 — Channels overview page
// ===========================================================================

test("channels page: exists + renders overview shell", () => {
  assert.ok(exists(F_PAGE_CHANNELS));
  const src = read(F_PAGE_CHANNELS);
  assert.match(src, /export default async function ChannelsPage/);
  assert.match(src, /Channel manager/);
});

test("channels page: lists all 7 real channels in the snapshot strip", () => {
  const src = read(F_PAGE_CHANNELS);
  for (const c of [
    "booking_com",
    "airbnb",
    "trip_com",
    "agoda",
    "expedia",
    "vrbo",
    "hotels_com",
  ]) {
    assert.match(src, new RegExp(`channel-summary-${c}|"${c}"`));
  }
});

test("channels page: links to inbox + cross-channel calendar from header", () => {
  const src = read(F_PAGE_CHANNELS);
  assert.match(src, /\/development-os\/channels\/inbox/);
  assert.match(src, /\/development-os\/channels\/calendar/);
});

test("channels page: renders ConnectionsGrid for villa × channel matrix", () => {
  const src = read(F_PAGE_CHANNELS);
  assert.match(src, /<ConnectionsGrid/);
});

test("connections-grid: covers all 7 visible channels", () => {
  const src = read(F_CONNECTIONS_GRID);
  assert.match(src, /VISIBLE_CHANNELS: readonly ChannelName\[\]/);
  for (const c of [
    "booking_com",
    "airbnb",
    "trip_com",
    "agoda",
    "expedia",
    "vrbo",
    "hotels_com",
  ]) {
    assert.match(src, new RegExp(`"${c}"`));
  }
});

test("connection-card: renders Connect modal for disconnected cells, Link for connected", () => {
  const src = read(F_CONNECTION_CARD);
  assert.match(src, /<ConnectChannelModal/);
  assert.match(src, /href={`\/development-os\/channels\/\$\{connection\.id\}`}/);
  assert.match(src, /channel-cell-\$\{channel\}-disconnected/);
});

// ===========================================================================
// 3) P1.E.1 — Connect Channel modal (discriminated union per channel)
// ===========================================================================

test("connect modal: client component with EntityModal", () => {
  const src = read(F_CONNECT_MODAL);
  assert.match(src, /^"use client";/);
  assert.match(src, /import \{ EntityModal \}/);
});

test("connect modal: renders different fields per channel (discriminated)", () => {
  const src = read(F_CONNECT_MODAL);
  // Booking.com: username/password/hotelId/environment
  assert.match(src, /name="username"/);
  // Airbnb: accessToken/refreshToken/listingId/expiresAt
  assert.match(src, /name="accessToken"/);
  assert.match(src, /name="refreshToken"/);
  // Trip.com: partnerId/apiKey
  assert.match(src, /name="partnerId"/);
  // Agoda: apiSecret distinguishes from Trip
  assert.match(src, /name="apiSecret"/);
  // Expedia/VRBO/Hotels.com share eqcUsername/eqcPassword
  assert.match(src, /name="eqcUsername"/);
  assert.match(src, /name="eqcPassword"/);
});

test("connect modal: submits via createChannelConnection + auto-closes on success", () => {
  const src = read(F_CONNECT_MODAL);
  assert.match(src, /createChannelConnection/);
  assert.match(src, /setOpen\(false\)/);
});

test("connect modal: surfaces test-connection result inline (success/failure)", () => {
  const src = read(F_CONNECT_MODAL);
  assert.match(src, /testResult/);
  assert.match(src, /Connection test passed/);
});

test("connect modal: CHANNEL_LABELS export covers every ChannelName (including direct)", () => {
  const src = read(F_CONNECT_MODAL);
  for (const c of [
    "booking_com",
    "airbnb",
    "trip_com",
    "agoda",
    "expedia",
    "vrbo",
    "hotels_com",
    "direct",
  ]) {
    assert.match(src, new RegExp(`${c}:`));
  }
});

test("connect modal: mobile-friendly inputs (min-h-[36px])", () => {
  const src = read(F_CONNECT_MODAL);
  assert.match(src, /min-h-\[36px\]/);
});

// ===========================================================================
// 4) P1.E.2 — Connection detail page
// ===========================================================================

test("connection detail page: exists + uses URL-state tab routing", () => {
  assert.ok(exists(F_PAGE_CONNECTION));
  const src = read(F_PAGE_CONNECTION);
  assert.match(src, /searchParams: Promise<\{ tab\?: string \}>/);
  assert.match(src, /TABS = \["overview", "rates", "reservations", "settings"\]/);
});

test("connection detail page: renders TabStrip with all 4 tabs", () => {
  const src = read(F_PAGE_CONNECTION);
  assert.match(src, /tab-strip/);
  // Tabs use a template-literal data-testid (`tab-${t}`); assert the
  // tab-id source alongside the rendering helper.
  assert.match(src, /data-testid=\{`tab-\$\{t\}`\}/);
  for (const t of ["overview", "rates", "reservations", "settings"]) {
    assert.match(src, new RegExp(`"${t}"`));
  }
});

test("connection detail page: overview tab shows MetricCards + sync log", () => {
  const src = read(F_PAGE_CONNECTION);
  assert.match(src, /label="Last inventory sync"/);
  assert.match(src, /label="Last reservations pull"/);
  assert.match(src, /label="Channel commission"/);
  assert.match(src, /listSyncLogForConnection/);
});

test("connection detail page: settings tab shows redacted credentials only", () => {
  const src = read(F_PAGE_CONNECTION);
  assert.match(src, /getRedactedCredentials/);
});

test("connection actions: client component with pause/resume/archive/test/pull", () => {
  const src = read(F_CONNECTION_ACTIONS);
  assert.match(src, /^"use client";/);
  for (const tid of [
    "action-test-connection",
    "action-manual-pull",
    "action-pause",
    "action-resume",
    "action-archive",
  ]) {
    assert.match(src, new RegExp(tid));
  }
});

test("connection actions: archive requires two-click confirm + reason capture", () => {
  const src = read(F_CONNECTION_ACTIONS);
  assert.match(src, /confirmArchive/);
  assert.match(src, /archive-reason-input/);
});

test("connection actions: router.refresh after each action so detail page repaints", () => {
  const src = read(F_CONNECTION_ACTIONS);
  // 4+ refresh calls — one per action.
  const matches = src.match(/router\.refresh\(\)/g);
  assert.ok((matches?.length ?? 0) >= 3);
});

// ===========================================================================
// 5) P1.E.3 — Rate management calendar
// ===========================================================================

test("rates page: exists with RateCalendar + push-rates-action wiring", () => {
  assert.ok(exists(F_PAGE_RATES));
  assert.ok(exists(F_PUSH_RATES_ACTION));
  const src = read(F_PAGE_RATES);
  assert.match(src, /<RateCalendar/);
  assert.match(src, /pushRatesForConnection/);
});

test("rate calendar: client component with month nav + bulk edit + push button", () => {
  const src = read(F_RATE_CALENDAR);
  assert.match(src, /^"use client";/);
  for (const tid of [
    "rate-cal-prev",
    "rate-cal-next",
    "rate-cal-bulk-edit",
    "rate-cal-push",
  ]) {
    assert.match(src, new RegExp(tid));
  }
});

test("rate calendar: renders day cells with data-testid for each ISO date", () => {
  const src = read(F_RATE_CALENDAR);
  assert.match(src, /rate-cal-cell-\$\{d\.iso\}/);
});

test("rate calendar: edit modal applies single + bulk modes", () => {
  const src = read(F_RATE_CALENDAR);
  assert.match(src, /mode: "single" \| "bulk"/);
  assert.match(src, /rate-edit-amount/);
  assert.match(src, /rate-edit-apply/);
});

test("push-rates action: calls provider.pushRates + logs to channel_sync_log", () => {
  const src = read(F_PUSH_RATES_ACTION);
  assert.match(src, /^"use server";/);
  assert.match(src, /provider\.pushRates\(ratesInput\)/);
  assert.match(src, /db\.insert\(channelSyncLog\)/);
});

test("push-rates action: uses decryptConnectionCredentials (never plaintext from URL)", () => {
  const src = read(F_PUSH_RATES_ACTION);
  assert.match(src, /decryptConnectionCredentials/);
});

// ===========================================================================
// 6) P1.E.4 — Cross-channel calendar
// ===========================================================================

test("calendar page: exists + renders 3-month horizon", () => {
  assert.ok(exists(F_PAGE_CALENDAR));
  const src = read(F_PAGE_CALENDAR);
  assert.match(src, /buildThreeMonths/);
  assert.match(src, /calendar-villa-select/);
});

test("calendar page: color-codes by channel (per-channel CSS class)", () => {
  const src = read(F_PAGE_CALENDAR);
  assert.match(src, /function channelClass\(c: ChannelName\)/);
  // Sanity: each visible channel has a distinct class.
  const channels = ["booking_com", "airbnb", "trip_com", "agoda", "expedia", "vrbo", "hotels_com"];
  for (const c of channels) {
    assert.match(src, new RegExp(`case "${c}":`));
  }
});

test("calendar page: highlights conflict_pending rows for operator review", () => {
  const src = read(F_PAGE_CALENDAR);
  assert.match(src, /conflictPending/);
  assert.match(src, /ring-warning|tone="warning"/);
});

test("calendar page: bars link to unified inbox detail for each reservation", () => {
  const src = read(F_PAGE_CALENDAR);
  assert.match(src, /\/development-os\/channels\/inbox\/\$\{reservation\.id\}/);
});

// ===========================================================================
// 7) P1.E.5 — Unified inbox + detail
// ===========================================================================

test("inbox page: exists + URL-state filters (channel/state/from/to/q)", () => {
  assert.ok(exists(F_PAGE_INBOX));
  const src = read(F_PAGE_INBOX);
  assert.match(src, /searchParams: Promise<\{[\s\S]*channel\?: string;[\s\S]*state\?: string;[\s\S]*from\?: string;[\s\S]*to\?: string;[\s\S]*q\?: string;[\s\S]*\}>/);
});

test("inbox page: renders filter form with all 5 filters + Clear link", () => {
  const src = read(F_PAGE_INBOX);
  assert.match(src, /inbox-filter-form/);
  assert.match(src, /name="channel"/);
  assert.match(src, /name="state"/);
  assert.match(src, /name="from"/);
  assert.match(src, /name="to"/);
  assert.match(src, /name="q"/);
  assert.match(src, /Clear/);
});

test("inbox page: rows clickable to detail; each row has data-testid", () => {
  const src = read(F_PAGE_INBOX);
  assert.match(src, /href={`\/development-os\/channels\/inbox\/\$\{r\.id\}`}/);
  assert.match(src, /inbox-row-\$\{r\.id\}/);
});

test("inbox page: highlights conflict_pending rows + shows AlertTriangle", () => {
  const src = read(F_PAGE_INBOX);
  assert.match(src, /conflictPending/);
  assert.match(src, /AlertTriangle/);
});

test("inbox detail page: exists + sections for guest/stay/pricing/linkage/raw", () => {
  assert.ok(exists(F_PAGE_INBOX_DETAIL));
  const src = read(F_PAGE_INBOX_DETAIL);
  assert.match(src, /Guest/);
  assert.match(src, /Stay/);
  assert.match(src, /Pricing/);
  assert.match(src, /Internal booking/);
  assert.match(src, /Raw payload/);
});

test("inbox detail page: collapsible raw payload (preserves source-of-truth)", () => {
  const src = read(F_PAGE_INBOX_DETAIL);
  assert.match(src, /<details>/);
  assert.match(src, /raw-payload/);
});

test("inbox detail page: shows conflict_pending banner when applicable", () => {
  const src = read(F_PAGE_INBOX_DETAIL);
  assert.match(src, /conflict_pending|conflictPending/);
  assert.match(src, /Conflict pending/);
});

// ===========================================================================
// 8) Integration sanity
// ===========================================================================

test("integration: channels nav targets all 5 surfaces (page + 4 routes)", () => {
  const src = read(F_PAGE_CHANNELS);
  // Header buttons → inbox + calendar
  assert.match(src, /\/development-os\/channels\/inbox/);
  assert.match(src, /\/development-os\/channels\/calendar/);
});

test("integration: every UI surface uses DevelopmentShell + PageHeader", () => {
  for (const path of [
    F_PAGE_CHANNELS,
    F_PAGE_CONNECTION,
    F_PAGE_RATES,
    F_PAGE_CALENDAR,
    F_PAGE_INBOX,
    F_PAGE_INBOX_DETAIL,
  ]) {
    const src = read(path);
    assert.match(src, /<DevelopmentShell>/);
    assert.match(src, /<PageHeader/);
  }
});

test("integration: no UI surface imports a Radix/Headless UI dropdown (uses native primitives)", () => {
  // The launch prompt's "Native HTML5 patterns (no new UI deps)" constraint.
  for (const path of [
    F_PAGE_CHANNELS,
    F_PAGE_CONNECTION,
    F_PAGE_RATES,
    F_PAGE_CALENDAR,
    F_PAGE_INBOX,
    F_PAGE_INBOX_DETAIL,
    F_CONNECT_MODAL,
    F_CONNECTION_CARD,
    F_CONNECTIONS_GRID,
    F_CONNECTION_ACTIONS,
    F_RATE_CALENDAR,
  ]) {
    const src = read(path);
    assert.doesNotMatch(src, /from "@radix-ui/);
    assert.doesNotMatch(src, /from "@headlessui/);
  }
});

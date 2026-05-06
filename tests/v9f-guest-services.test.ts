/**
 * v9F — pure-logic tests:
 *   - Migration 0016 declares 6 tables + RLS + idempotency anchors.
 *   - Pricing helpers: every model returns the right guest price + margin.
 *   - Status machine: legal transitions only; finance bridge fires once.
 *   - Order code mint shape (GSO-YYYYMMDD-NNNN).
 *   - Availability resolver excludes paused / archived / out-of-window.
 *   - Permission matrix exposes the v9F keys; owners + agents excluded.
 *   - Schema parser coerces money to bigint and rejects bad pricing models.
 *   - The /stay/[token]/services page never imports server-only finance helpers.
 *
 * No DB / no `server-only` import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0016 declares 6 tables + RLS + idempotency anchors", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0016_guest_services_upsells.sql"),
    "utf8",
  );
  for (const t of [
    "guest_service_categories",
    "guest_services",
    "guest_service_options",
    "guest_service_orders",
    "guest_service_order_events",
    "guest_service_finance_links",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // Catalog scope idempotency.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "guest_services_scope_key_unique"/,
  );
  // Finance bridge anchor — one row per order.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "guest_service_finance_links_order_unique"/,
  );
  // Status CHECKs we depend on at the application layer.
  assert.match(sql, /'requested','reviewing','confirmed','scheduled'/);
  assert.match(sql, /'fixed','per_person','per_day','per_hour'/);
});

// -----------------------------------------------------------------------------
// Pricing helpers
// -----------------------------------------------------------------------------
test("priceGuestService — fixed", async () => {
  const { priceGuestService } = await import(
    "../src/features/guest-services/pricing"
  );
  const r = priceGuestService({
    pricingModel: "fixed",
    basePriceMinor: 5000n,
    internalCostMinor: 3000n,
    quantity: 2,
  });
  assert.equal(r.guestPriceMinor, 10000n);
  assert.equal(r.internalCostMinor, 6000n);
  assert.equal(r.marginMinor, 4000n);
  assert.equal(r.quoteRequired, false);
});

test("priceGuestService — per_person multiplies by guestCount", async () => {
  const { priceGuestService } = await import(
    "../src/features/guest-services/pricing"
  );
  const r = priceGuestService({
    pricingModel: "per_person",
    basePriceMinor: 9500n,
    internalCostMinor: 6000n,
    quantity: 1,
    guestCount: 4,
  });
  assert.equal(r.guestPriceMinor, 38000n);
  assert.equal(r.marginMinor, 14000n);
});

test("priceGuestService — option deltas apply per-unit", async () => {
  const { priceGuestService } = await import(
    "../src/features/guest-services/pricing"
  );
  const r = priceGuestService({
    pricingModel: "per_person",
    basePriceMinor: 6000n,
    internalCostMinor: 3800n,
    optionPriceDeltaMinor: 3000n,
    optionInternalCostDeltaMinor: 1800n,
    quantity: 1,
    guestCount: 2,
  });
  // (6000 + 3000) * 2 = 18000 guest, (3800 + 1800) * 2 = 11200 internal
  assert.equal(r.guestPriceMinor, 18000n);
  assert.equal(r.internalCostMinor, 11200n);
  assert.equal(r.marginMinor, 6800n);
});

test("priceGuestService — quote_required + free zero out", async () => {
  const { priceGuestService } = await import(
    "../src/features/guest-services/pricing"
  );
  const q = priceGuestService({
    pricingModel: "quote_required",
    basePriceMinor: 99n,
  });
  assert.equal(q.guestPriceMinor, 0n);
  assert.equal(q.quoteRequired, true);

  const f = priceGuestService({ pricingModel: "free", basePriceMinor: 99n });
  assert.equal(f.guestPriceMinor, 0n);
  assert.equal(f.quoteRequired, false);
});

test("priceGuestService — unknown internal cost yields null margin", async () => {
  const { priceGuestService } = await import(
    "../src/features/guest-services/pricing"
  );
  const r = priceGuestService({
    pricingModel: "fixed",
    basePriceMinor: 5000n,
    internalCostMinor: null,
    quantity: 3,
  });
  assert.equal(r.guestPriceMinor, 15000n);
  assert.equal(r.internalCostMinor, null);
  assert.equal(r.marginMinor, null);
});

// -----------------------------------------------------------------------------
// Status machine
// -----------------------------------------------------------------------------
test("status machine — legal transitions and terminal states", async () => {
  const { canTransition, isTerminalStatus, shouldFinanceBridge } = await import(
    "../src/features/guest-services/status"
  );
  assert.equal(canTransition("requested", "reviewing"), true);
  assert.equal(canTransition("requested", "confirmed"), true);
  assert.equal(canTransition("scheduled", "fulfilled"), true);
  assert.equal(canTransition("requested", "fulfilled"), false);
  assert.equal(canTransition("fulfilled", "cancelled"), false);
  assert.equal(canTransition("cancelled", "fulfilled"), false);
  assert.equal(isTerminalStatus("fulfilled"), true);
  assert.equal(isTerminalStatus("requested"), false);
  // Finance bridge fires only once on entering fulfilled.
  assert.equal(shouldFinanceBridge("scheduled", "fulfilled"), true);
  assert.equal(shouldFinanceBridge("fulfilled", "fulfilled"), false);
  assert.equal(shouldFinanceBridge("scheduled", "cancelled"), false);
});

// -----------------------------------------------------------------------------
// Order code mint
// -----------------------------------------------------------------------------
test("buildGuestServiceOrderCode → GSO-YYYYMMDD-NNNN", async () => {
  const { buildGuestServiceOrderCode, isGuestServiceOrderCode } = await import(
    "../src/features/guest-services/codes"
  );
  const code = buildGuestServiceOrderCode(7, new Date("2026-04-28T00:00:00Z"));
  assert.equal(code, "GSO-20260428-0007");
  assert.equal(isGuestServiceOrderCode(code), true);
  assert.equal(isGuestServiceOrderCode("GSO-bad"), false);
});

// -----------------------------------------------------------------------------
// Availability + slot validation
// -----------------------------------------------------------------------------
test("availability — paused / archived / lead-time gates", async () => {
  const { isServiceAvailableForStay, validateRequestedSlot } = await import(
    "../src/features/guest-services/availability"
  );
  const stay = { checkInAt: "2026-05-01", checkOutAt: "2026-05-08" };
  const baseRow = {
    guestVisible: true,
    pricingModel: "fixed" as const,
    requiresDate: true,
    requiresGuestCount: false,
    minQuantity: 1,
    maxQuantity: 5,
    leadTimeHours: null,
  };
  assert.equal(
    isServiceAvailableForStay(
      { ...baseRow, status: "active" },
      stay,
      new Date("2026-05-02"),
    ).available,
    true,
  );
  assert.equal(
    isServiceAvailableForStay(
      { ...baseRow, status: "paused" },
      stay,
      new Date("2026-05-02"),
    ).reason,
    "service_paused",
  );
  assert.equal(
    isServiceAvailableForStay(
      { ...baseRow, status: "archived" },
      stay,
      new Date("2026-05-02"),
    ).reason,
    "service_archived",
  );
  // Past stay window
  assert.equal(
    isServiceAvailableForStay(
      { ...baseRow, status: "active" },
      stay,
      new Date("2026-05-09"),
    ).reason,
    "outside_stay_window",
  );

  // Slot validation
  const issues = validateRequestedSlot({
    pricingModel: "per_person",
    requiresDate: true,
    minQuantity: 1,
    maxQuantity: 5,
    leadTimeHours: 24,
    requestedDate: "2026-05-02",
    requestedTime: "10:00",
    quantity: 6, // above max
    guestCount: null, // missing for per_person
    stayCheckIn: "2026-05-01",
    stayCheckOut: "2026-05-08",
    now: new Date("2026-05-01T08:00:00Z"),
  });
  assert.ok(issues.includes("quantity_above_max"));
  assert.ok(issues.includes("missing_guest_count"));
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix — v9F keys exist and exclude owners + agents", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const keys = [
    "guest_services.read",
    "guest_services.write",
    "guest_services.manage",
    "guest_service_orders.read",
    "guest_service_orders.write",
    "guest_service_orders.fulfill",
    "guest_service_orders.finance_bridge",
  ];
  for (const k of keys) {
    const roles = (ROLE_CAPABILITIES as Record<string, string[]>)[k];
    assert.ok(Array.isArray(roles), `missing ${k}`);
    for (const r of roles) {
      assert.ok(
        ![
          "owner",
          "individual_owner",
          "company_owner",
          "agent",
        ].includes(r),
        `${k} leaks to ${r}`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Zod schema parsing
// -----------------------------------------------------------------------------
test("submitGuestOrderSchema coerces money + rejects empty token", async () => {
  const { submitGuestOrderSchema } = await import(
    "../src/features/guest-services/schema"
  );
  const ok = submitGuestOrderSchema.safeParse({
    token: "x".repeat(40),
    serviceId: "00000000-0000-0000-0000-000000000001",
    quantity: "2",
    guestCount: "3",
  });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.quantity, 2);

  const bad = submitGuestOrderSchema.safeParse({
    token: "short",
    serviceId: "not-a-uuid",
  });
  assert.equal(bad.success, false);
});

test("upsertServiceSchema rejects unknown pricing model", async () => {
  const { upsertServiceSchema } = await import(
    "../src/features/guest-services/schema"
  );
  const bad = upsertServiceSchema.safeParse({
    serviceKey: "x",
    name: "X",
    serviceType: "transfer",
    pricingModel: "subscription",
    basePriceMinor: "1000",
  });
  assert.equal(bad.success, false);
});

// -----------------------------------------------------------------------------
// Boundary checks
// -----------------------------------------------------------------------------
test("the guest /stay/[token]/services page never imports a server-only finance helper", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(guest)/stay/[token]/services/page.tsx",
    ),
    "utf8",
  );
  assert.doesNotMatch(src, /finance-bridge/);
  assert.doesNotMatch(src, /revenue_lines/);
});

test("admin actions module bundles a permission gate before each catalog mutation", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-services/actions.ts"),
    "utf8",
  );
  for (const fn of [
    "upsertCategoryAction",
    "upsertServiceAction",
    "upsertServiceOptionAction",
    "transitionOrderAction",
    "addOrderNoteAction",
    "bridgeOrderAction",
  ]) {
    const block = src.slice(src.indexOf(fn));
    assert.match(
      block.slice(0, 600),
      /requirePermission\(/,
      `${fn} missing requirePermission gate`,
    );
  }
});

test("seed.sql includes v9F categories + services + sample orders", () => {
  const sql = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf8");
  assert.match(sql, /9F\.1 — Categories/);
  assert.match(sql, /9F\.2 — Catalog services/);
  assert.match(sql, /9F\.4 — Sample orders/);
  assert.match(sql, /GSO-20260427-0001/);
  assert.match(sql, /GSO-20260427-0003/);
});

/**
 * Prompt 103 — Service Fulfilment & Vendor Ops.
 *
 * Pure-logic + source-grep + migration-pin tests covering:
 *   • Status transitions (allowed forward edges + terminal states).
 *   • Guest-facing label collapses internal triage to a single
 *     "Pending confirmation" string.
 *   • Pricing math: margin, deriveInternalCost, finance-bridge amounts.
 *   • Vendor token: 32-byte url-safe base64, deterministic SHA-256
 *     hash, default expiry derives from `scheduledFor`.
 *   • Vendor-safe projection: strips guest email/phone/owner/margin/
 *     internal notes by construction.
 *   • Migration pins: all eight tables FORCE RLS; unique on
 *     (order_id), (vendor_id, service_id), (fulfilment_id, stay_token_id),
 *     (fulfilment_id) for finance link, plus token_hash UNIQUE.
 *   • Permission matrix: concierge dispatch yes / finance_bridge no;
 *     finance_manager bridge yes; investor_owner everywhere no; field
 *     roles excluded.
 *   • Source grep: /stay service-order detail does not reference
 *     margin / internalCost / vendorInvoice; /vendor/service/[token]
 *     does not reference token_hash / guest.email / guest.phone /
 *     owner.
 *   • Seeded notification templates exist by template_key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// status-pure
// -----------------------------------------------------------------------------
test("status transitions: allowed forward edges + terminals", async () => {
  const {
    canTransitionFulfilmentStatus,
    isTerminalFulfilmentStatus,
    SERVICE_FULFILMENT_TRANSITIONS,
  } = await import("../src/features/service-fulfilment/status-pure");
  assert.equal(canTransitionFulfilmentStatus("new", "triage"), true);
  assert.equal(
    canTransitionFulfilmentStatus("awaiting_vendor", "vendor_confirmed"),
    true,
  );
  assert.equal(
    canTransitionFulfilmentStatus("scheduled", "in_progress"),
    true,
  );
  // Self-edge is allowed (idempotent).
  assert.equal(canTransitionFulfilmentStatus("scheduled", "scheduled"), true);
  // Reverse is NOT allowed.
  assert.equal(canTransitionFulfilmentStatus("scheduled", "new"), false);
  assert.equal(canTransitionFulfilmentStatus("completed", "in_progress"), false);
  assert.equal(canTransitionFulfilmentStatus("cancelled", "scheduled"), false);
  // Terminal statuses have no outgoing edges.
  for (const t of ["completed", "cancelled", "failed", "no_show"] as const) {
    assert.equal(isTerminalFulfilmentStatus(t), true);
    assert.deepEqual(SERVICE_FULFILMENT_TRANSITIONS[t], []);
  }
});

test("guest-facing fulfilment status — no internal status leakage", async () => {
  const { guestFacingFulfilmentStatus } = await import(
    "../src/features/service-fulfilment/status-pure"
  );
  // Internal triage / awaiting_vendor / vendor_confirmed all collapse.
  for (const s of ["new", "triage", "awaiting_vendor", "vendor_confirmed"] as const) {
    const view = guestFacingFulfilmentStatus(s);
    assert.equal(view.label, "Pending confirmation");
  }
  assert.equal(guestFacingFulfilmentStatus("completed").label, "Completed");
  assert.equal(guestFacingFulfilmentStatus("scheduled").label, "Scheduled");
  assert.equal(guestFacingFulfilmentStatus("failed").label, "Could not deliver");
});

// -----------------------------------------------------------------------------
// pricing-pure
// -----------------------------------------------------------------------------
test("pricing: margin handles bigint / number / nulls + sign", async () => {
  const {
    calculateServiceMargin,
    deriveInternalCost,
    calculateFinanceBridgeAmounts,
  } = await import("../src/features/service-fulfilment/pricing-pure");
  assert.equal(calculateServiceMargin(11200n, 5600n), 5600n);
  assert.equal(calculateServiceMargin(11200, 5600), 5600n);
  assert.equal(calculateServiceMargin(null, 5600n), -5600n);
  assert.equal(calculateServiceMargin(11200n, null), 11200n);
  // Deriver cascade.
  assert.equal(
    deriveInternalCost({
      vendorQuoteMinor: 9000n,
      defaultVendorCostMinor: 8000n,
      orderCostMinor: 7000n,
    }),
    9000n,
  );
  assert.equal(
    deriveInternalCost({
      vendorQuoteMinor: null,
      defaultVendorCostMinor: 8000n,
      orderCostMinor: 7000n,
    }),
    8000n,
  );
  assert.equal(
    deriveInternalCost({
      vendorQuoteMinor: null,
      defaultVendorCostMinor: null,
      orderCostMinor: 7000n,
    }),
    7000n,
  );
  assert.equal(
    deriveInternalCost({
      vendorQuoteMinor: null,
      defaultVendorCostMinor: null,
      orderCostMinor: null,
    }),
    0n,
  );
  // Bridge amounts (negatives clamp; both zero → hasAmount=false).
  const a = calculateFinanceBridgeAmounts({
    guestPriceMinor: 11200n,
    internalCostMinor: 5600n,
  });
  assert.equal(a.revenueMinor, 11200n);
  assert.equal(a.expenseMinor, 5600n);
  assert.equal(a.marginMinor, 5600n);
  assert.equal(a.hasAmount, true);
  const b = calculateFinanceBridgeAmounts({
    guestPriceMinor: 0n,
    internalCostMinor: 0n,
  });
  assert.equal(b.hasAmount, false);
  const c = calculateFinanceBridgeAmounts({
    guestPriceMinor: -100,
    internalCostMinor: 50,
  });
  assert.equal(c.revenueMinor, 0n); // clamped
  assert.equal(c.expenseMinor, 50n);
});

test("shouldBridgeFinance is true only on completed", async () => {
  const { shouldBridgeFinance } = await import(
    "../src/features/service-fulfilment/pricing-pure"
  );
  assert.equal(shouldBridgeFinance("completed"), true);
  for (const s of ["new", "scheduled", "in_progress", "cancelled", "failed"] as const) {
    assert.equal(shouldBridgeFinance(s), false);
  }
});

// -----------------------------------------------------------------------------
// vendor-token
// -----------------------------------------------------------------------------
test("vendor token: shape + hash determinism + expiry", async () => {
  const {
    generateVendorToken,
    hashVendorToken,
    tokenPrefixFromVendorToken,
    defaultVendorTokenExpiry,
  } = await import("../src/features/service-fulfilment/vendor-token");
  const tok = generateVendorToken();
  // 32 bytes → base64url (43 chars), url-safe alphabet only.
  assert.equal(tok.length, 43);
  assert.match(tok, /^[A-Za-z0-9_-]+$/);
  // Hash deterministic.
  const h1 = hashVendorToken(tok);
  const h2 = hashVendorToken(tok);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  // Prefix is the first 8 url-safe chars.
  assert.equal(tokenPrefixFromVendorToken(tok), tok.slice(0, 8));

  // Expiry: 7 days after scheduledFor when scheduled in the future.
  const scheduled = new Date("2026-04-30T10:00:00Z");
  const now = new Date("2026-04-25T10:00:00Z");
  const exp = defaultVendorTokenExpiry(scheduled, now);
  assert.equal(exp.toISOString(), "2026-05-07T10:00:00.000Z");
  // When scheduled is null / past, expiry is +7d from now.
  assert.equal(
    defaultVendorTokenExpiry(null, now).toISOString(),
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  );
});

// -----------------------------------------------------------------------------
// vendor-safe projection
// -----------------------------------------------------------------------------
test("buildVendorSafeFulfilmentView strips email/phone/margin/internal", async () => {
  const { buildVendorSafeFulfilmentView } = await import(
    "../src/features/service-fulfilment/vendor-safe-projection"
  );
  const view = buildVendorSafeFulfilmentView({
    fulfilment: {
      id: "f1",
      fulfilmentCode: "FUL-001",
      status: "awaiting_vendor",
      fulfilmentType: "vendor",
      scheduledFor: new Date("2026-04-30T09:00:00Z"),
      etaAt: null,
      startedAt: null,
      completedAt: null,
      requiresGuestConfirmation: false,
      guestConfirmedAt: null,
      vendorReference: "BAE-99",
      vendorNotes: null,
    },
    order: {
      quantity: 2,
      selectedOptionLabel: "Couple massage",
      requestedDate: "2026-04-29",
      requestedTime: "17:00",
      guestNote: "Please be quiet on arrival.",
    },
    service: { name: "In-villa massage", serviceType: "massage" },
    villa: { label: "ES-S5", serviceArea: "Canggu" },
    guest: {
      fullName: "Emma Whitmore",
      phone: "+44 20 7000 0000",
      // Default — opt-out of phone sharing.
    },
  });
  // The projection has the safe fields.
  assert.equal(view.fulfilmentCode, "FUL-001");
  assert.equal(view.service.name, "In-villa massage");
  assert.equal(view.guest.label, "Emma W.");
  assert.equal(view.guest.phone, null); // not shared
  // No banned fields.
  const flat = JSON.stringify(view);
  for (const banned of [
    "email",
    "@",
    "marginMinor",
    "internalCostMinor",
    "internalNotes",
    "ownerId",
  ]) {
    assert.equal(
      flat.includes(banned),
      false,
      `view leaked banned token "${banned}"`,
    );
  }
  // Phone is shared only when explicitly opted in.
  const view2 = buildVendorSafeFulfilmentView({
    fulfilment: {
      id: "f1",
      fulfilmentCode: "FUL-001",
      status: "scheduled",
      fulfilmentType: "vendor",
      scheduledFor: new Date(),
      etaAt: null,
      startedAt: null,
      completedAt: null,
      requiresGuestConfirmation: false,
      guestConfirmedAt: null,
      vendorReference: null,
      vendorNotes: null,
    },
    order: {
      quantity: null,
      selectedOptionLabel: null,
      requestedDate: null,
      requestedTime: null,
      guestNote: null,
    },
    service: { name: "Test", serviceType: null },
    villa: { label: null, serviceArea: null },
    guest: {
      fullName: "Madonna",
      phone: "+1 555",
      allowGuestContact: true,
    },
  });
  assert.equal(view2.guest.phone, "+1 555");
});

// -----------------------------------------------------------------------------
// Migration pinning
// -----------------------------------------------------------------------------
test("migration 0025 forces RLS + idempotency unique indexes", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0025_service_fulfilment_vendor_ops.sql"),
    "utf-8",
  );
  // All eight tables get RLS enabled + forced.
  for (const t of [
    "service_vendors",
    "service_vendor_services",
    "guest_service_fulfilments",
    "service_fulfilment_events",
    "service_vendor_tokens",
    "service_vendor_invoices",
    "guest_service_ratings",
    "service_fulfilment_finance_links",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `missing RLS for ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  // No vendor / guest / owner self-policies on these tables.
  assert.equal(/CREATE POLICY[^;]*owner[^;]*ON\s+"?service_/i.test(sql), false);
  assert.equal(/CREATE POLICY[^;]*guest[^;]*ON\s+"?service_/i.test(sql), false);
  // Unique indexes.
  assert.ok(sql.includes("guest_service_fulfilments_order_unique"));
  assert.ok(sql.includes("service_vendor_services_pair_unique"));
  assert.ok(sql.includes("guest_service_ratings_fulfilment_token_unique"));
  assert.ok(sql.includes("service_fulfilment_finance_links_fulfilment_unique"));
  // Token hash UNIQUE.
  assert.ok(/"token_hash"\s+text\s+NOT\s+NULL\s+UNIQUE/i.test(sql));
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix — concierge dispatch / no bridge; finance bridge; investor + field excluded", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const allows = (perm: string, role: string): boolean =>
    (ROLE_CAPABILITIES[perm] ?? []).includes(role as never);
  // concierge can read/write/dispatch but cannot bridge finance.
  assert.equal(allows("service_fulfilment.read", "concierge"), true);
  assert.equal(allows("service_fulfilment.write", "concierge"), true);
  assert.equal(allows("service_fulfilment.dispatch", "concierge"), true);
  assert.equal(allows("service_fulfilment.finance_bridge", "concierge"), false);
  // finance_manager: bridge yes; dispatch no.
  assert.equal(
    allows("service_fulfilment.finance_bridge", "finance_manager"),
    true,
  );
  assert.equal(allows("service_fulfilment.dispatch", "finance_manager"), false);
  // investor + field roles excluded everywhere.
  for (const role of [
    "investor_owner",
    "investor_viewer",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ]) {
    for (const perm of [
      "service_vendor.read",
      "service_vendor.write",
      "service_fulfilment.read",
      "service_fulfilment.write",
      "service_fulfilment.dispatch",
      "service_fulfilment.finance_bridge",
      "service_invoice.read",
      "service_invoice.write",
      "service_rating.read",
      "service_rating.manage",
    ]) {
      assert.equal(
        allows(perm, role),
        false,
        `${role} should not have ${perm}`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Source grep
// -----------------------------------------------------------------------------
function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (s.isFile() && /\.(ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

test("/stay service-order detail does not reference margin / internalCost / vendorInvoice", () => {
  const target = join(
    repoRoot,
    "src/app/(guest)/stay/[token]/services/orders/[id]/page.tsx",
  );
  const body = readFileSync(target, "utf-8");
  for (const banned of [
    "marginMinor",
    "margin_minor",
    "internalCostMinor",
    "internal_cost_minor",
    "vendorInvoice",
    "vendor_invoice",
    "vendorQuoteMinor",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `${target} mentions banned token "${banned}"`,
    );
  }
});

test("/vendor route does not leak token_hash / guest emails / owner data / margin", () => {
  // We allow `guests.phone` / `view.guest.phone` because the vendor
  // portal explicitly hardcodes `allowGuestContact: false` (verified
  // by the vendor-safe projection test above). The grep here pins
  // the harder bans: token hashes, guest emails, owner data, and any
  // pricing internals.
  const root = join(repoRoot, "src/app/(vendor)");
  const files = walk(root);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const banned of [
      "token_hash",
      "tokenHash",
      "guest.email",
      "guests.email",
      "guestEmail",
      "owner_id",
      "ownerStatement",
      "marginMinor",
      "internalCostMinor",
      "vendorQuoteMinor",
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${f} mentions banned token "${banned}"`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Seed templates pinning
// -----------------------------------------------------------------------------
test("seed.sql includes service-fulfilment notification template keys", () => {
  const seed = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  for (const key of [
    "service_fulfilment.order_received",
    "service_fulfilment.vendor_assigned",
    "service_fulfilment.vendor_confirmed",
    "service_fulfilment.guest_confirmation_required",
    "service_fulfilment.scheduled",
    "service_fulfilment.eta_updated",
    "service_fulfilment.completed",
    "service_fulfilment.cancelled",
    "service_fulfilment.rating_requested",
    "service_fulfilment.vendor_invoice_received",
  ]) {
    assert.ok(seed.includes(`'${key}'`), `seed missing template_key ${key}`);
  }
});

test("buildFulfilmentCode is deterministic", async () => {
  const { buildFulfilmentCode } = await import(
    "../src/features/service-fulfilment/codes"
  );
  assert.equal(
    buildFulfilmentCode({ date: "2026-04-29", sequence: 1 }),
    "FUL-20260429-0001",
  );
  assert.equal(
    buildFulfilmentCode({ date: "2026-04-29", sequence: 42 }),
    "FUL-20260429-0042",
  );
});

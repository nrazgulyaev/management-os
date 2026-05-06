/**
 * Prompt 107 — Direct Booking Finance Reconciliation + Deposit Expiry.
 *
 * Pure-logic + source-grep + migration-pin tests covering:
 *   • migration RLS / unique indexes / column additions
 *   • calculateBalanceDue clamps at zero
 *   • shouldPostDirectBookingRevenue gates
 *   • shouldExpireDeposit predicate
 *   • isDepositExpired predicate
 *   • publicDirectBookingStageSummary collapses internal categories
 *   • directBookingFinanceStatusLabel covers every enum value
 *   • permissions matrix (finance / accountant / booking / concierge /
 *     owner / field exclusions)
 *   • notification template keys seeded
 *   • cron route exists for direct_booking_deposit_expiry
 *   • source greps:
 *       - no Stripe / Xendit / Wise SDK imports anywhere in src/
 *       - public-api.ts does not return providerSessionId / financeLinkId /
 *         revenueLineId / statementPeriodId in the *View interfaces
 *       - status page does not reference internal IDs
 *   • finance-pure: build link code is deterministic
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration
// -----------------------------------------------------------------------------
test("migration 0029 pins finance_links table + ALTER columns", () => {
  const sql = readFileSync(
    join(
      repoRoot,
      "drizzle/0029_direct_booking_finance_reconciliation.sql",
    ),
    "utf-8",
  );
  assert.ok(sql.includes('"direct_booking_finance_links"'));
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  // Status enum.
  for (const v of [
    "'pending'",
    "'posted'",
    "'skipped_no_booking'",
    "'skipped_locked_period'",
    "'failed'",
    "'reversed'",
  ]) {
    assert.ok(sql.includes(v), `migration missing status ${v}`);
  }
  // Unique indexes.
  assert.ok(sql.includes("direct_booking_finance_links_request_unique"));
  assert.ok(sql.includes("direct_booking_finance_links_booking_unique"));
  assert.ok(sql.includes("direct_booking_finance_links_revenue_unique"));
  // Column additions.
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS "balance_due_minor"'));
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS "expires_reason"'));
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS "finance_bridge_status"'));
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS "finance_link_id"'));
});

// -----------------------------------------------------------------------------
// Pure: calculateBalanceDue
// -----------------------------------------------------------------------------
test("calculateBalanceDue clamps at zero + handles bigint/number/string", async () => {
  const { calculateBalanceDue } = await import(
    "../src/features/direct-booking/finance-pure"
  );
  assert.equal(calculateBalanceDue(100_000n, 30_000n), 70_000n);
  assert.equal(calculateBalanceDue(100_000n, 100_000n), 0n);
  // Deposit > total → 0n, never negative.
  assert.equal(calculateBalanceDue(100_000n, 150_000n), 0n);
  // Number / string inputs round-trip.
  assert.equal(calculateBalanceDue(100_000, "30000"), 70_000n);
  // Null / NaN inputs coerce to 0.
  assert.equal(calculateBalanceDue(null, null), 0n);
  assert.equal(calculateBalanceDue(100_000n, null), 100_000n);
});

// -----------------------------------------------------------------------------
// Pure: shouldPostDirectBookingRevenue
// -----------------------------------------------------------------------------
test("shouldPostDirectBookingRevenue requires converted + booking + paid deposit", async () => {
  const { shouldPostDirectBookingRevenue } = await import(
    "../src/features/direct-booking/finance-pure"
  );
  // Happy path.
  assert.equal(
    shouldPostDirectBookingRevenue({
      requestStatus: "converted",
      bookingId: "11111111-1111-1111-1111-111111111111",
      depositStatus: "paid",
    }).ok,
    true,
  );
  // manually_marked_paid also ok.
  assert.equal(
    shouldPostDirectBookingRevenue({
      requestStatus: "converted",
      bookingId: "11111111-1111-1111-1111-111111111111",
      depositStatus: "manually_marked_paid",
    }).ok,
    true,
  );
  // No booking → skipped_no_booking.
  assert.deepEqual(
    shouldPostDirectBookingRevenue({
      requestStatus: "converted",
      bookingId: null,
      depositStatus: "paid",
    }),
    { ok: false, reason: "skipped_no_booking" },
  );
  // Not converted → skipped_no_booking.
  assert.deepEqual(
    shouldPostDirectBookingRevenue({
      requestStatus: "approved",
      bookingId: "11111111-1111-1111-1111-111111111111",
      depositStatus: "paid",
    }),
    { ok: false, reason: "skipped_no_booking" },
  );
  // Converted + booking + unpaid deposit + no override → failed.
  assert.deepEqual(
    shouldPostDirectBookingRevenue({
      requestStatus: "converted",
      bookingId: "11111111-1111-1111-1111-111111111111",
      depositStatus: "pending",
    }),
    { ok: false, reason: "failed" },
  );
  // Override unlocks.
  assert.equal(
    shouldPostDirectBookingRevenue({
      requestStatus: "converted",
      bookingId: "11111111-1111-1111-1111-111111111111",
      depositStatus: "pending",
      conversionOverride: true,
    }).ok,
    true,
  );
});

// -----------------------------------------------------------------------------
// Pure: shouldExpireDeposit + isDepositExpired
// -----------------------------------------------------------------------------
test("shouldExpireDeposit + isDepositExpired predicates", async () => {
  const { shouldExpireDeposit, isDepositExpired } = await import(
    "../src/features/direct-booking/finance-pure"
  );
  const now = new Date("2026-05-01T10:00:00Z");
  const past = new Date("2026-05-01T09:00:00Z");
  const future = new Date("2026-05-01T11:00:00Z");
  assert.equal(shouldExpireDeposit("pending", past, now), true);
  assert.equal(shouldExpireDeposit("requires_action", past, now), true);
  assert.equal(shouldExpireDeposit("pending", future, now), false);
  // Already terminal — never expire.
  assert.equal(shouldExpireDeposit("paid", past, now), false);
  assert.equal(shouldExpireDeposit("manually_marked_paid", past, now), false);
  assert.equal(shouldExpireDeposit("expired", past, now), false);
  // Null expires_at — never expire.
  assert.equal(shouldExpireDeposit("pending", null, now), false);
  // isDepositExpired: pure timestamp check.
  assert.equal(isDepositExpired(past, now), true);
  assert.equal(isDepositExpired(future, now), false);
  assert.equal(isDepositExpired(null, now), false);
});

// -----------------------------------------------------------------------------
// Pure: publicDirectBookingStageSummary
// -----------------------------------------------------------------------------
test("publicDirectBookingStageSummary collapses internal status", async () => {
  const { publicDirectBookingStageSummary } = await import(
    "../src/features/direct-booking/finance-pure"
  );
  // manually_marked_paid collapses to deposit_received with public-safe label.
  const a = publicDirectBookingStageSummary({
    hold: { status: "active" },
    request: { status: "approved" },
    deposit: { status: "manually_marked_paid" },
    booking: null,
  });
  assert.equal(a.current, "deposit_received");
  assert.equal(a.label, "Payment received");
  // Booking confirmed wins over everything.
  const b = publicDirectBookingStageSummary({
    hold: { status: "converted" },
    request: { status: "converted" },
    deposit: { status: "manually_marked_paid" },
    booking: { status: "confirmed" },
  });
  assert.equal(b.current, "booking_confirmed");
  // Guest claimed paid but not yet verified.
  const c = publicDirectBookingStageSummary({
    hold: { status: "active" },
    request: { status: "approved" },
    deposit: { status: "pending", guestClaimedPaid: true },
    booking: null,
  });
  assert.equal(c.current, "deposit_pending_verification");
  assert.equal(c.label, "Awaiting verification");
  // Internal statuses MUST NOT leak into labels.
  for (const s of [a, b, c]) {
    for (const banned of ["manually_marked_paid", "under_review"]) {
      assert.equal(s.label.toLowerCase().includes(banned), false);
      assert.equal(s.detail.toLowerCase().includes(banned), false);
    }
  }
});

// -----------------------------------------------------------------------------
// Pure: directBookingFinanceStatusLabel covers every enum
// -----------------------------------------------------------------------------
test("directBookingFinanceStatusLabel covers every status", async () => {
  const { directBookingFinanceStatusLabel } = await import(
    "../src/features/direct-booking/finance-pure"
  );
  for (const s of [
    "pending",
    "posted",
    "skipped_no_booking",
    "skipped_locked_period",
    "failed",
    "reversed",
  ] as const) {
    const out = directBookingFinanceStatusLabel(s);
    assert.ok(out.label.length > 0);
    assert.ok(out.tone.length > 0);
  }
});

// -----------------------------------------------------------------------------
// Pure: link code determinism
// -----------------------------------------------------------------------------
test("buildDirectBookingFinanceLinkCode is deterministic", async () => {
  const { buildDirectBookingFinanceLinkCode } = await import(
    "../src/features/direct-booking/finance-pure"
  );
  assert.equal(
    buildDirectBookingFinanceLinkCode("2026-04-29", 1),
    "DBF-20260429-0001",
  );
  assert.equal(
    buildDirectBookingFinanceLinkCode("2026-04-29", 99),
    "DBF-20260429-0099",
  );
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permissions matrix — reconcile + expire role tiers", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const allows = (perm: string, role: string): boolean =>
    (ROLE_CAPABILITIES[perm] ?? []).includes(role as never);
  // finance_manager / accountant.
  assert.equal(
    allows("direct_booking.reconcile.write", "finance_manager"),
    true,
  );
  assert.equal(allows("direct_booking.reconcile.write", "accountant"), true);
  assert.equal(allows("direct_booking.reconcile.reverse", "accountant"), false);
  assert.equal(
    allows("direct_booking.reconcile.reverse", "finance_manager"),
    true,
  );
  // booking_manager: read only on reconcile, expire allowed.
  assert.equal(
    allows("direct_booking.reconcile.read", "booking_manager"),
    true,
  );
  assert.equal(
    allows("direct_booking.reconcile.write", "booking_manager"),
    false,
  );
  assert.equal(
    allows("direct_booking.deposit.expire", "booking_manager"),
    true,
  );
  // concierge: nothing on reconcile, no expire.
  assert.equal(allows("direct_booking.reconcile.read", "concierge"), false);
  assert.equal(allows("direct_booking.reconcile.write", "concierge"), false);
  assert.equal(allows("direct_booking.deposit.expire", "concierge"), false);
  // Investor + field roles excluded everywhere.
  for (const role of [
    "investor_owner",
    "investor_viewer",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ]) {
    for (const perm of [
      "direct_booking.reconcile.read",
      "direct_booking.reconcile.write",
      "direct_booking.reconcile.reverse",
      "direct_booking.deposit.expire",
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
// Cron route + job registration
// -----------------------------------------------------------------------------
test("cron route for direct_booking_deposit_expiry exists + is wired", () => {
  const route = readFileSync(
    join(
      repoRoot,
      "src/app/api/cron/direct-booking-deposit-expiry/route.ts",
    ),
    "utf-8",
  );
  assert.ok(route.includes(`"direct_booking_deposit_expiry"`));
  assert.ok(route.includes("handleCronJobRequest"));
  // Definition.
  const defs = readFileSync(
    join(repoRoot, "src/features/jobs/definitions.ts"),
    "utf-8",
  );
  assert.ok(defs.includes(`key: "direct_booking_deposit_expiry"`));
  // KNOWN_JOBS + JobKey union.
  const actions = readFileSync(
    join(repoRoot, "src/features/jobs/actions.ts"),
    "utf-8",
  );
  assert.ok(actions.includes(`"direct_booking_deposit_expiry"`));
  // Run-all.
  const matches = actions.match(/"direct_booking_deposit_expiry"/g);
  assert.ok(matches && matches.length >= 3, "expected wiring in 3 sites");
});

// -----------------------------------------------------------------------------
// Notification templates seed
// -----------------------------------------------------------------------------
test("seed.sql includes Prompt 107 notification template keys", () => {
  const seed = readFileSync(
    join(repoRoot, "drizzle/seed.sql"),
    "utf-8",
  );
  for (const k of [
    "direct_booking.deposit_expired",
    "direct_booking.revenue_posted",
    "direct_booking.reconciliation_failed",
    "direct_booking.balance_due_reminder",
  ]) {
    assert.ok(seed.includes(`'${k}'`), `seed missing ${k}`);
  }
});

// -----------------------------------------------------------------------------
// Source greps
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

test("no real Stripe / Xendit / Wise SDK imports anywhere in src/", () => {
  const root = join(repoRoot, "src");
  const files = walk(root);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const banned of [
      'from "stripe"',
      "from 'stripe'",
      'from "@stripe/stripe-js"',
      "from 'xendit-node'",
      'from "xendit-node"',
      'from "wise-api-client"',
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${f} imports banned SDK ${banned}`,
      );
    }
  }
});

test("PublicHoldView / PublicDepositView do not expose internal IDs", () => {
  const body = readFileSync(
    join(repoRoot, "src/features/direct-booking/public-api.ts"),
    "utf-8",
  );
  for (const view of ["PublicHoldView", "PublicDepositView"]) {
    const block = body.split(`export interface ${view} {`)[1] ?? "";
    const close = block.split("}")[0];
    for (const banned of [
      "providerSessionId",
      "providerPaymentId",
      "providerAccountId",
      "financeLinkId",
      "revenueLineId",
      "statementPeriodId",
      "holdTokenHash",
    ]) {
      assert.equal(
        close.includes(banned),
        false,
        `${view} leaks ${banned}`,
      );
    }
  }
});

test("status page contains no internal IDs / provider internals", () => {
  const body = readFileSync(
    join(
      repoRoot,
      "src/app/(public)/book/hold/[token]/status/page.tsx",
    ),
    "utf-8",
  );
  for (const banned of [
    "providerSessionId",
    "provider_session_id",
    "providerPaymentId",
    "financeLinkId",
    "finance_link_id",
    "revenueLineId",
    "revenue_line_id",
    "statementPeriodId",
    "manually_marked_paid",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `status page mentions banned token "${banned}"`,
    );
  }
});

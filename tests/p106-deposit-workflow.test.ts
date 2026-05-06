/**
 * Prompt 106 — Direct Booking Deposit Workflow + Payment Provider Stub.
 *
 * Pure-logic + source-grep + migration-pin tests covering:
 *   • migration RLS / enum / indexes
 *   • calculateDepositAmount: percent + minimum + cap + clamp-to-total
 *   • depositAllowsBookingConversion + depositIsPayable
 *   • public deposit status labels (no internal leak)
 *   • manual stub provider does not call any external URL
 *   • notify-paid never auto-marks the deposit paid
 *     (handler appends event only — verified by source grep)
 *   • conversion gate blocks without paid deposit (schema accepts the
 *     `convertWithoutDeposit` override flag)
 *   • public deposit view shape carries no provider internals
 *   • permissions matrix excludes owners / field roles
 *   • notification template keys seeded
 *   • webhook idempotency unique pinned
 *   • payment-provider source grep — no Stripe/Xendit SDK imports;
 *     no `card_number` / `cvv` style fields anywhere on the public
 *     payment surface.
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
test("migration 0028 pins RLS / enums / indexes", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0028_direct_booking_deposit_workflow.sql"),
    "utf-8",
  );
  for (const t of [
    "payment_provider_accounts",
    "direct_booking_deposits",
    "direct_booking_deposit_events",
    "payment_webhook_events",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `missing RLS for ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  // Deposit status enum spans multiple lines — check each value.
  for (const v of [
    "'draft'",
    "'pending'",
    "'requires_action'",
    "'paid'",
    "'failed'",
    "'expired'",
    "'cancelled'",
    "'refunded'",
    "'manually_marked_paid'",
  ]) {
    assert.ok(sql.includes(v), `missing status ${v}`);
  }
  // Webhook unique partial index.
  assert.ok(sql.includes("payment_webhook_events_external_unique"));
  assert.ok(/WHERE\s+"external_event_id"\s+IS\s+NOT\s+NULL/i.test(sql));
});

// -----------------------------------------------------------------------------
// Pure: deposit amount calculation
// -----------------------------------------------------------------------------
test("calculateDepositAmount: percent + minimum + cap", async () => {
  const { calculateDepositAmount } = await import(
    "../src/features/direct-booking/deposits-pure"
  );
  // 30% of 100,000 = 30,000.
  assert.equal(
    calculateDepositAmount(100_000n, {
      kind: "percent",
      percent: 0.3,
    }),
    30_000n,
  );
  // 30% of 100,000 with $300 minimum (= 30,000 minor): bumps below.
  assert.equal(
    calculateDepositAmount(50_000n, {
      kind: "percent",
      percent: 0.3,
      minimumMinor: 30_000n,
    }),
    30_000n,
  );
  // Capped at total — 30% of 100,000 capped at 25,000.
  assert.equal(
    calculateDepositAmount(100_000n, {
      kind: "percent",
      percent: 0.3,
      maximumMinor: 25_000n,
    }),
    25_000n,
  );
  // Never exceeds total.
  assert.equal(
    calculateDepositAmount(20_000n, {
      kind: "fixed",
      fixedMinor: 100_000n,
    }),
    20_000n,
  );
  // Full-amount policy.
  assert.equal(
    calculateDepositAmount(50_000n, { kind: "full" }),
    50_000n,
  );
  // Negative / NaN safe.
  assert.equal(
    calculateDepositAmount(0n, { kind: "percent", percent: 0.3 }),
    0n,
  );
  assert.equal(
    calculateDepositAmount(100_000n, {
      kind: "percent",
      percent: NaN,
    }),
    0n,
  );
  // Default policy: 30% of $1,000 (100,000 minor) = $300 (30,000 minor),
  // floor 30,000 — no change.
  const { DEFAULT_DEPOSIT_POLICY } = await import(
    "../src/features/direct-booking/deposits-pure"
  );
  assert.equal(
    calculateDepositAmount(100_000n, DEFAULT_DEPOSIT_POLICY),
    30_000n,
  );
});

// -----------------------------------------------------------------------------
// Pure: status predicates
// -----------------------------------------------------------------------------
test("depositAllowsBookingConversion + depositIsPayable", async () => {
  const { depositAllowsBookingConversion, depositIsPayable } = await import(
    "../src/features/direct-booking/deposits-pure"
  );
  for (const s of ["paid", "manually_marked_paid"] as const) {
    assert.equal(depositAllowsBookingConversion(s), true);
  }
  for (const s of [
    "draft",
    "pending",
    "requires_action",
    "failed",
    "expired",
    "cancelled",
    "refunded",
  ] as const) {
    assert.equal(depositAllowsBookingConversion(s), false);
  }
  for (const s of ["draft", "pending", "requires_action"] as const) {
    assert.equal(depositIsPayable(s), true);
  }
  for (const s of [
    "paid",
    "manually_marked_paid",
    "failed",
    "expired",
    "cancelled",
    "refunded",
  ] as const) {
    assert.equal(depositIsPayable(s), false);
  }
});

// -----------------------------------------------------------------------------
// Pure: public labels collapse internal categories
// -----------------------------------------------------------------------------
test("publicDepositStatusLabel collapses internal", async () => {
  const { publicDepositStatusLabel, adminDepositStatusLabel } = await import(
    "../src/features/direct-booking/deposits-pure"
  );
  // pending / draft / requires_action all collapse to "Awaiting payment".
  for (const s of ["pending", "draft", "requires_action"] as const) {
    assert.equal(publicDepositStatusLabel(s).label, "Awaiting payment");
  }
  // paid / manually_marked_paid collapse to "Payment confirmed" — guests
  // never see the "manually" prefix.
  assert.equal(
    publicDepositStatusLabel("manually_marked_paid").label,
    "Payment confirmed",
  );
  // Admin view distinguishes the two.
  assert.equal(
    adminDepositStatusLabel("manually_marked_paid").label,
    "Manually marked paid",
  );
  // Public never returns "manually_marked_paid" verbatim.
  for (const s of [
    "draft",
    "pending",
    "requires_action",
    "paid",
    "manually_marked_paid",
    "failed",
    "expired",
    "cancelled",
    "refunded",
  ] as const) {
    const l = publicDepositStatusLabel(s).label;
    assert.equal(l.toLowerCase().includes("manually"), false);
    assert.equal(l.toLowerCase().includes("requires_action"), false);
  }
});

test("sanitizeProviderPayloadForPublic strips secrets / cards / tokens", async () => {
  const { sanitizeProviderPayloadForPublic } = await import(
    "../src/features/direct-booking/deposits-pure"
  );
  const out = sanitizeProviderPayloadForPublic({
    note: "ok to share",
    secret: "shh",
    api_key: "skl_xxx",
    card_number: "4242…",
    cvv: "111",
    iban: "DE…",
    nested: {
      private_key: "shhh",
      ok: "show",
    },
  });
  assert.equal("note" in out, true);
  assert.equal("nested" in out, true);
  for (const banned of ["secret", "api_key", "card_number", "cvv", "iban"]) {
    assert.equal(banned in out, false);
  }
  assert.equal("ok" in (out.nested as Record<string, unknown>), true);
  assert.equal(
    "private_key" in (out.nested as Record<string, unknown>),
    false,
  );
});

// -----------------------------------------------------------------------------
// Manual stub provider behaviour
// -----------------------------------------------------------------------------
test("manual stub provider creates session with internal payment_url + does not call externals", async () => {
  const { ManualStubProvider } = await import(
    "../src/features/payments/manual-stub-provider"
  );
  const provider = new ManualStubProvider({
    buildPaymentUrl: (a) =>
      `/book/hold/${a.holdToken}/payment?d=${a.depositId}`,
  });
  const session = await provider.createSession({
    depositId: "11111111-1111-1111-1111-111111111111",
    amountMinor: 30_000n,
    currency: "USD",
    returnUrl: "/book/hold/abc/payment",
    metadata: { holdToken: "abc" },
  });
  assert.equal(session.providerKey, "manual_stub");
  // The payment URL is the host-relative stub page — never a real PSP.
  assert.equal(
    session.paymentUrl,
    "/book/hold/abc/payment?d=11111111-1111-1111-1111-111111111111",
  );
  assert.match(session.sessionId, /^man_/);
  assert.ok(session.expiresAt instanceof Date);
  // Status is always pending — manual flow flips via admin action.
  const status = await provider.getStatus();
  assert.equal(status.kind, "pending");
  // Cancel is a no-op success.
  const cancel = await provider.cancelSession({
    depositId: "x",
    providerSessionId: "x",
  });
  assert.equal(cancel.ok, true);
});

// -----------------------------------------------------------------------------
// Source greps — public surface contains no payment SDK imports + no
// card-number fields. notify-paid handler never marks deposit paid.
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

test("no Stripe / Xendit SDK imports anywhere in src/", () => {
  const root = join(repoRoot, "src");
  const files = walk(root);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const banned of [
      'from "stripe"',
      "from 'stripe'",
      'from "@stripe/stripe-js"',
      'from "xendit-node"',
      "from 'xendit-node'",
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${f} imports banned SDK ${banned}`,
      );
    }
  }
});

test("public payment page has no card / cvv fields", () => {
  const files = [
    join(repoRoot, "src/app/(public)/book/hold/[token]/payment/page.tsx"),
    join(repoRoot, "src/components/book/notify-paid-button.tsx"),
  ];
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const banned of [
      "card_number",
      "cardNumber",
      "cardholder",
      "cvv",
      "ccv",
      'name="card"',
      "credit-card",
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${f} mentions banned token "${banned}"`,
      );
    }
  }
});

test("notify-paid handler appends a guest_claimed_paid event but never flips status", () => {
  const body = readFileSync(
    join(repoRoot, "src/features/direct-booking/public-api.ts"),
    "utf-8",
  );
  const fn = body.split("export async function handleNotifyDepositPaid")[1] ?? "";
  const close = fn.split("\n}\n")[0];
  // No `patchDepositStatus(... "paid"`.
  assert.equal(close.includes('patchDepositStatus'), false);
  assert.equal(close.includes("manually_marked_paid"), false);
  // It DOES append the event.
  assert.ok(close.includes("guest_claimed_paid"));
});

// -----------------------------------------------------------------------------
// Convert schema accepts the override flag
// -----------------------------------------------------------------------------
test("convertRequestSchema accepts convertWithoutDeposit + overrideReason", async () => {
  const { convertRequestSchema } = await import(
    "../src/features/direct-booking/schema"
  );
  const out = convertRequestSchema.safeParse({
    id: "11111111-1111-1111-1111-111111111111",
    finalStatus: "tentative",
    convertWithoutDeposit: "true",
    overrideReason: "VIP — invoice already paid",
  });
  assert.equal(out.success, true);
  if (out.success) {
    assert.equal(out.data.convertWithoutDeposit, true);
    assert.equal(out.data.overrideReason, "VIP — invoice already paid");
  }
  const noOverride = convertRequestSchema.safeParse({
    id: "11111111-1111-1111-1111-111111111111",
  });
  assert.equal(noOverride.success, true);
  if (noOverride.success) {
    assert.equal(noOverride.data.convertWithoutDeposit, false);
  }
});

// -----------------------------------------------------------------------------
// Permissions matrix
// -----------------------------------------------------------------------------
test("permissions matrix — finance / booking / concierge / owner / field tiers", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const allows = (perm: string, role: string): boolean =>
    (ROLE_CAPABILITIES[perm] ?? []).includes(role as never);
  // finance_manager / accountant.
  assert.equal(allows("payments.read", "finance_manager"), true);
  assert.equal(allows("payments.write", "finance_manager"), true);
  assert.equal(allows("payments.manage", "finance_manager"), true);
  assert.equal(
    allows("direct_booking.deposit.mark_paid", "finance_manager"),
    true,
  );
  assert.equal(allows("direct_booking.deposit.refund", "finance_manager"), true);
  assert.equal(allows("payments.read", "accountant"), true);
  assert.equal(
    allows("direct_booking.deposit.mark_paid", "accountant"),
    true,
  );
  assert.equal(allows("direct_booking.deposit.refund", "accountant"), false);
  // booking_manager.
  assert.equal(allows("direct_booking.deposit.read", "booking_manager"), true);
  assert.equal(allows("direct_booking.deposit.write", "booking_manager"), true);
  assert.equal(allows("direct_booking.deposit.refund", "booking_manager"), false);
  // concierge: read only.
  assert.equal(allows("direct_booking.deposit.read", "concierge"), true);
  assert.equal(allows("direct_booking.deposit.write", "concierge"), false);
  assert.equal(allows("direct_booking.deposit.mark_paid", "concierge"), false);
  // Investor + field roles excluded everywhere.
  for (const role of [
    "investor_owner",
    "investor_viewer",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ]) {
    for (const perm of [
      "payments.read",
      "payments.write",
      "payments.manage",
      "direct_booking.deposit.read",
      "direct_booking.deposit.write",
      "direct_booking.deposit.mark_paid",
      "direct_booking.deposit.refund",
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
// Seed pinning
// -----------------------------------------------------------------------------
test("seed.sql includes deposit notification template keys", () => {
  const seed = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  for (const key of [
    "direct_booking.deposit_created",
    "direct_booking.deposit_guest_claimed_paid",
    "direct_booking.deposit_marked_paid",
    "direct_booking.deposit_failed",
    "direct_booking.deposit_cancelled",
    "direct_booking.booking_confirmed",
  ]) {
    assert.ok(seed.includes(`'${key}'`), `seed missing ${key}`);
  }
});

test("seed.sql includes manual_stub provider account row", () => {
  const seed = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  assert.ok(seed.includes("'manual_stub'"));
  assert.ok(seed.includes("Manual stub (demo)"));
});

test("buildDepositCode is deterministic", async () => {
  const { buildDepositCode } = await import(
    "../src/features/direct-booking/deposits-pure"
  );
  assert.equal(buildDepositCode("2026-04-29", 1), "DEP-20260429-0001");
  assert.equal(buildDepositCode("2026-04-29", 42), "DEP-20260429-0042");
});

test("PublicDepositView shape carries no provider internals", () => {
  const body = readFileSync(
    join(repoRoot, "src/features/direct-booking/public-api.ts"),
    "utf-8",
  );
  const view = body.split("export interface PublicDepositView {")[1] ?? "";
  const close = view.split("}")[0];
  for (const banned of [
    "providerSessionId",
    "providerPaymentId",
    "configPrivateEncrypted",
    "providerAccountId",
    "createdBy",
  ]) {
    assert.equal(
      close.includes(banned),
      false,
      `PublicDepositView leaks ${banned}`,
    );
  }
});

/**
 * Prompt 109 — Guest Booking Notifications + Guest Status Center Polish.
 *
 * Pure-logic + source-grep + migration-pin tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0031 pins 4 guest-facing tables + RLS + dedupe + CHECKs", () => {
  const sql = readFileSync(
    join(
      repoRoot,
      "drizzle/0031_guest_booking_notifications_status_center.sql",
    ),
    "utf-8",
  );
  for (const t of [
    '"direct_booking_guest_notifications"',
    '"direct_booking_guest_status_snapshots"',
    '"direct_booking_guest_message_threads"',
    '"direct_booking_guest_messages"',
  ]) {
    assert.ok(sql.includes(t), `migration missing table ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("public.is_internal_user()"));
  // CHECK enums.
  assert.ok(sql.includes("severity_check"));
  assert.ok(sql.includes("'unread'"));
  assert.ok(sql.includes("'read'"));
  assert.ok(sql.includes("'archived'"));
  assert.ok(sql.includes("stage_check"));
  assert.ok(sql.includes("'quote_held'"));
  assert.ok(sql.includes("'request_submitted'"));
  assert.ok(sql.includes("'deposit_pending_confirmation'"));
  assert.ok(sql.includes("'deposit_confirmed'"));
  assert.ok(sql.includes("'failed'"));
  assert.ok(sql.includes("author_check"));
  assert.ok(sql.includes("'guest'"));
  assert.ok(sql.includes("'staff'"));
  assert.ok(sql.includes("'system'"));
  assert.ok(sql.includes("visibility_check"));
  assert.ok(sql.includes("'guest_visible'"));
  assert.ok(sql.includes("'internal_only'"));
  // Unique dedupe_key.
  assert.ok(sql.includes("direct_booking_guest_notifications_dedupe_unique"));
  // No public RLS policy.
  assert.equal(sql.includes("FOR SELECT TO anon"), false);
  assert.equal(sql.includes("public_self_read"), false);
});

// -----------------------------------------------------------------------------
// Pure: stage derivation
// -----------------------------------------------------------------------------
test("buildPublicDirectBookingStage covers every primary state", async () => {
  const { buildPublicDirectBookingStage } = await import(
    "../src/features/direct-booking/guest-status-pure"
  );
  // Active hold, no request → quote_held.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: null,
      deposit: null,
      booking: null,
    }),
    "quote_held",
  );
  // Submitted request → request_submitted.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "submitted" },
      deposit: null,
      booking: null,
    }),
    "request_submitted",
  );
  // Under review.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "under_review" },
      deposit: null,
      booking: null,
    }),
    "under_review",
  );
  // Approved + unpaid deposit → deposit_required.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "approved" },
      deposit: { status: "pending" },
      booking: null,
    }),
    "deposit_required",
  );
  // Guest claimed paid → deposit_pending_confirmation.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "approved" },
      deposit: { status: "pending", guestClaimedPaid: true },
      booking: null,
    }),
    "deposit_pending_confirmation",
  );
  // Manual paid → deposit_confirmed.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "approved" },
      deposit: { status: "manually_marked_paid" },
      booking: null,
    }),
    "deposit_confirmed",
  );
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "approved" },
      deposit: { status: "paid" },
      booking: null,
    }),
    "deposit_confirmed",
  );
  // Converted booking confirmed → confirmed.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "converted" },
      request: { status: "converted" },
      deposit: { status: "manually_marked_paid" },
      booking: {
        status: "confirmed",
        checkIn: "2026-06-10",
        checkOut: "2026-06-13",
      },
    }),
    "confirmed",
  );
  // Failed deposit → failed.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "approved" },
      deposit: { status: "failed" },
      booking: null,
    }),
    "failed",
  );
  // Expired hold/request/deposit → expired.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "expired" },
      request: null,
      deposit: null,
      booking: null,
    }),
    "expired",
  );
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "expired" },
      deposit: null,
      booking: null,
    }),
    "expired",
  );
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "approved" },
      deposit: { status: "expired" },
      booking: null,
    }),
    "expired",
  );
  // Cancelled wins.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "cancelled" },
      request: null,
      deposit: null,
      booking: null,
    }),
    "cancelled",
  );
  // Rejected wins.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "rejected" },
      deposit: null,
      booking: null,
    }),
    "rejected",
  );
});

test("buildPublicDirectBookingStage: terminal states override pending states", async () => {
  const { buildPublicDirectBookingStage } = await import(
    "../src/features/direct-booking/guest-status-pure"
  );
  // Even with a paid deposit, a cancelled hold is terminal cancelled.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "cancelled" },
      request: { status: "approved" },
      deposit: { status: "manually_marked_paid" },
      booking: null,
    }),
    "cancelled",
  );
  // Booking cancelled wins over an otherwise-paid deposit.
  assert.equal(
    buildPublicDirectBookingStage({
      hold: { status: "active" },
      request: { status: "converted" },
      deposit: { status: "paid" },
      booking: {
        status: "cancelled",
        checkIn: "2026-06-10",
        checkOut: "2026-06-13",
      },
    }),
    "cancelled",
  );
});

// -----------------------------------------------------------------------------
// Pure: copy + sanitisation
// -----------------------------------------------------------------------------
test("buildGuestStatusCopy returns non-empty headline/body with no internal vocabulary", async () => {
  const { buildGuestStatusCopy, PUBLIC_GUEST_STAGES } = await import(
    "../src/features/direct-booking/guest-status-pure"
  );
  const ctx = {
    token: "raw_token_123",
    hasDeposit: true,
    canNotifyPaid: true,
    canMessage: true,
  };
  const banned = [
    "manual_stub",
    "providerSession",
    "providerAccount",
    "depositId",
    "deposit_id",
    "financeLink",
    "finance_link",
    "webhook",
    "tokenHash",
    "manually_marked_paid",
  ];
  for (const stage of PUBLIC_GUEST_STAGES) {
    const c = buildGuestStatusCopy(stage, ctx);
    assert.ok(c.headline.length > 0, `${stage} missing headline`);
    assert.ok(c.body.length > 0, `${stage} missing body`);
    for (const b of banned) {
      assert.equal(
        c.headline.toLowerCase().includes(b.toLowerCase()),
        false,
        `${stage} headline leaks ${b}`,
      );
      assert.equal(
        c.body.toLowerCase().includes(b.toLowerCase()),
        false,
        `${stage} body leaks ${b}`,
      );
    }
  }
});

test("sanitizeGuestNotificationPayload drops every banned key", async () => {
  const { sanitizeGuestNotificationPayload } = await import(
    "../src/features/direct-booking/guest-status-pure"
  );
  const polluted = {
    publicTitle: "ok",
    providerSessionId: "ses_xxx",
    provider_session_id: "ses_xxx",
    providerAccountId: "acct_xxx",
    holdTokenHash: "deadbeef",
    tokenHash: "deadbeef",
    tokenPrefix: "abc",
    financeLinkId: "ff",
    finance_link_id: "ff",
    revenueLineId: "rl",
    revenue_line_id: "rl",
    statementPeriodId: "sp",
    statement_period_id: "sp",
    webhookPayload: "{}",
    webhook_payload: "{}",
    webhookEventId: "wh_x",
    configPrivateEncrypted: "x",
    decisionNote: "internal-only",
    rejectionInternalReason: "internal-only",
    safe: "ok",
  };
  const out = sanitizeGuestNotificationPayload(polluted);
  for (const banned of [
    "providerSessionId",
    "provider_session_id",
    "providerAccountId",
    "holdTokenHash",
    "tokenHash",
    "tokenPrefix",
    "financeLinkId",
    "finance_link_id",
    "revenueLineId",
    "revenue_line_id",
    "statementPeriodId",
    "statement_period_id",
    "webhookPayload",
    "webhook_payload",
    "webhookEventId",
    "configPrivateEncrypted",
    "decisionNote",
    "rejectionInternalReason",
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(out, banned),
      false,
      `did not drop ${banned}`,
    );
  }
  assert.equal(out.safe, "ok");
  assert.equal(out.publicTitle, "ok");
});

// -----------------------------------------------------------------------------
// Pure: stage transition → notification
// -----------------------------------------------------------------------------
test("buildNotificationForStageTransition produces expected keys + dedup", async () => {
  const { buildNotificationForStageTransition } = await import(
    "../src/features/direct-booking/guest-status-pure"
  );
  const ctx = {
    token: "raw",
    holdId: "hold-1",
    requestId: "req-1",
    depositId: "dep-1",
    bookingId: "book-1",
  };
  // No-op transition.
  assert.equal(
    buildNotificationForStageTransition("under_review", "under_review", ctx),
    null,
  );
  // request_submitted.
  const submitted = buildNotificationForStageTransition(
    null,
    "request_submitted",
    ctx,
  );
  assert.ok(submitted);
  assert.equal(submitted!.notificationKey, "request_received");
  assert.match(submitted!.dedupeKey, /book-1$/);
  // deposit_required.
  const depReq = buildNotificationForStageTransition(
    "under_review",
    "deposit_required",
    ctx,
  );
  assert.ok(depReq);
  assert.equal(depReq!.notificationKey, "deposit_requested");
  // confirmed.
  const confirmed = buildNotificationForStageTransition(
    "deposit_confirmed",
    "confirmed",
    ctx,
  );
  assert.ok(confirmed);
  assert.equal(confirmed!.notificationKey, "booking_confirmed");
  // failed.
  const failed = buildNotificationForStageTransition(
    "deposit_pending_confirmation",
    "failed",
    ctx,
  );
  assert.ok(failed);
  assert.equal(failed!.notificationKey, "deposit_failed");
  assert.equal(failed!.severity, "critical");
  // No-op stages: approved, in_house, completed, quote_held are not
  // user-facing transitions in this taxonomy.
  for (const s of ["approved", "in_house", "completed", "quote_held"] as const) {
    assert.equal(
      buildNotificationForStageTransition("under_review", s, ctx),
      null,
    );
  }
});

// -----------------------------------------------------------------------------
// Pure: messages
// -----------------------------------------------------------------------------
test("redactGuestMessage strips emails, phones, codes, tokens, password phrases", async () => {
  const { redactGuestMessage } = await import(
    "../src/features/direct-booking/guest-messages-pure"
  );
  // Email.
  assert.match(
    redactGuestMessage("Reach me at jane.doe@example.com please"),
    /\[redacted\]/,
  );
  assert.equal(
    redactGuestMessage("Reach me at jane.doe@example.com").includes("@"),
    false,
  );
  // Phone.
  assert.match(
    redactGuestMessage("Call me at +1 415-555-0199"),
    /\[redacted\]/,
  );
  // 6-digit code.
  assert.match(
    redactGuestMessage("My door code is 482931."),
    /\[redacted\]/,
  );
  // Long token / hash.
  const tokenLine = "the token is " + "a".repeat(40);
  assert.match(redactGuestMessage(tokenLine), /\[redacted\]/);
  // Password phrase.
  assert.match(
    redactGuestMessage("password is hunter2"),
    /\[redacted\]/,
  );
  assert.equal(
    redactGuestMessage("password is hunter2").toLowerCase().includes("hunter2"),
    false,
  );
  // Provider id.
  assert.match(
    redactGuestMessage("see ses_abcdef123 for the receipt"),
    /\[redacted\]/,
  );
  // Webhook id.
  assert.match(redactGuestMessage("wh_abcdef987"), /\[redacted\]/);
});

test("guestCanMessage gates terminal/failed states", async () => {
  const { guestCanMessage } = await import(
    "../src/features/direct-booking/guest-messages-pure"
  );
  for (const stage of [
    "quote_held",
    "request_submitted",
    "under_review",
    "deposit_required",
    "deposit_pending_confirmation",
    "approved",
    "confirmed",
  ] as const) {
    assert.equal(guestCanMessage(stage), true, `${stage} should allow messaging`);
  }
  for (const stage of [
    "expired",
    "cancelled",
    "rejected",
    "completed",
    "failed",
  ] as const) {
    assert.equal(guestCanMessage(stage), false, `${stage} should disallow messaging`);
  }
});

test("buildMessagePreview is guest-safe (latest entry only) + counts", async () => {
  const { buildMessagePreview } = await import(
    "../src/features/direct-booking/guest-messages-pure"
  );
  const empty = buildMessagePreview([], 0);
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.lastBody, null);
  const preview = buildMessagePreview(
    [
      {
        authorType: "guest",
        bodyRedacted: "first",
        createdAt: "2026-04-01T10:00:00Z",
      },
      {
        authorType: "staff",
        bodyRedacted: "latest staff message",
        createdAt: "2026-04-02T10:00:00Z",
      },
    ],
    1,
  );
  assert.equal(preview.totalCount, 2);
  assert.equal(preview.unreadCount, 1);
  assert.equal(preview.lastAuthor, "staff");
  assert.equal(preview.lastBody, "latest staff message");
});

// -----------------------------------------------------------------------------
// Permissions matrix
// -----------------------------------------------------------------------------
test("permissions matrix — guest_notifications + guest_messages role tiers", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const ctx = (
    role:
      | "concierge"
      | "booking_manager"
      | "finance_manager"
      | "investor_owner"
      | "investor_viewer"
      | "housekeeper"
      | "agent",
  ) => ({
    mode: "live" as const,
    appUser: null,
    roles: [role as never],
    isInternal: role !== "investor_owner" && role !== "investor_viewer",
    isSuperAdmin: false,
  });
  // concierge / booking_manager can manage messages.
  assert.equal(
    hasPermission(ctx("concierge"), "direct_booking.guest_messages.write"),
    true,
  );
  assert.equal(
    hasPermission(ctx("booking_manager"), "direct_booking.guest_messages.write"),
    true,
  );
  assert.equal(
    hasPermission(
      ctx("booking_manager"),
      "direct_booking.guest_messages.manage",
    ),
    true,
  );
  // finance_manager can read notifications but not write messages.
  assert.equal(
    hasPermission(ctx("finance_manager"), "direct_booking.guest_notifications.read"),
    true,
  );
  assert.equal(
    hasPermission(ctx("finance_manager"), "direct_booking.guest_messages.write"),
    false,
  );
  // investor_owner / investor_viewer / housekeeper / agent excluded.
  assert.equal(
    hasPermission(ctx("investor_owner"), "direct_booking.guest_messages.read"),
    false,
  );
  assert.equal(
    hasPermission(ctx("investor_viewer"), "direct_booking.guest_messages.read"),
    false,
  );
  assert.equal(
    hasPermission(ctx("housekeeper"), "direct_booking.guest_messages.read"),
    false,
  );
  assert.equal(
    hasPermission(ctx("agent"), "direct_booking.guest_notifications.read"),
    false,
  );
});

// -----------------------------------------------------------------------------
// Source greps
// -----------------------------------------------------------------------------
function readAllUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(p);
    }
  }
  return out;
}

test("public hold pages do not reference banned internal identifiers", () => {
  const root = join(repoRoot, "src/app/(public)/book/hold");
  const files = readAllUnder(root);
  const banned = [
    "providerSessionId",
    "provider_session_id",
    "providerAccountId",
    "provider_account_id",
    "holdTokenHash",
    "hold_token_hash",
    "tokenHash",
    "financeLinkId",
    "finance_link_id",
    "revenueLineId",
    "revenue_line_id",
    "statementPeriodId",
    "statement_period_id",
    "webhookPayload",
    "webhook_payload",
    "webhook_event_id",
    "configPrivateEncrypted",
    "config_private_encrypted",
  ];
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const b of banned) {
      assert.equal(
        body.includes(b),
        false,
        `${f} contains banned identifier ${b}`,
      );
    }
  }
});

test("public status API route does not return raw direct_booking IDs", () => {
  const body = readFileSync(
    join(
      repoRoot,
      "src/app/api/v1/holds/[token]/status/route.ts",
    ),
    "utf-8",
  );
  for (const banned of [
    "deposit_id",
    "request_id",
    "providerSessionId",
    "providerAccountId",
    "financeLinkId",
    "revenueLineId",
    "statementPeriodId",
    "webhookPayload",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `public status route contains ${banned}`,
    );
  }
  // It MUST NOT serialize the raw row keys for deposits/requests.
  assert.equal(body.includes("snapshot.depositId"), false);
  assert.equal(body.includes("snapshot.requestId"), false);
});

test("public status page contains no card / cvv / Stripe / Xendit copy", () => {
  const body = readFileSync(
    join(
      repoRoot,
      "src/app/(public)/book/hold/[token]/status/page.tsx",
    ),
    "utf-8",
  );
  for (const banned of [
    "stripe",
    "xendit",
    "wise",
    "credit card",
    "cvv",
    "card number",
    "publishableKey",
    "providerSessionId",
  ]) {
    assert.equal(
      body.toLowerCase().includes(banned.toLowerCase()),
      false,
      `status page contains banned word ${banned}`,
    );
  }
});

test("guest message composer client component does not import server-only services", () => {
  const body = readFileSync(
    join(
      repoRoot,
      "src/components/direct-booking/guest-message-composer.tsx",
    ),
    "utf-8",
  );
  // Should be marked "use client".
  assert.ok(body.includes('"use client"'));
  // Must not import server-only modules directly.
  assert.equal(body.includes("server-only"), false);
  assert.equal(body.includes("getDb"), false);
});

// -----------------------------------------------------------------------------
// Notification template seed presence
// -----------------------------------------------------------------------------
test("seed.sql includes Prompt 109 guest-facing template keys", () => {
  const seed = readFileSync(
    join(repoRoot, "drizzle/seed.sql"),
    "utf-8",
  );
  for (const key of [
    "direct_booking_guest.request_received",
    "direct_booking_guest.under_review",
    "direct_booking_guest.deposit_requested",
    "direct_booking_guest.guest_claimed_paid",
    "direct_booking_guest.deposit_confirmed",
    "direct_booking_guest.booking_confirmed",
    "direct_booking_guest.request_rejected",
    "direct_booking_guest.hold_expired",
    "direct_booking_guest.deposit_expired",
    "direct_booking_guest.concierge_reply",
  ]) {
    assert.ok(seed.includes(key), `seed missing template ${key}`);
  }
});

// -----------------------------------------------------------------------------
// Lifecycle wiring assertions
// -----------------------------------------------------------------------------
test("direct-booking actions call syncGuestStatusForChain at lifecycle points", () => {
  const actions = readFileSync(
    join(repoRoot, "src/features/direct-booking/actions.ts"),
    "utf-8",
  );
  assert.ok(actions.includes("syncGuestStatusForChain"));
  // At least four call-sites — under_review, approve, reject, convert.
  const occurrences = actions.split("syncGuestStatusForChain(").length - 1;
  assert.ok(
    occurrences >= 4,
    `expected ≥ 4 sync hooks in actions.ts, got ${occurrences}`,
  );
  const deposits = readFileSync(
    join(repoRoot, "src/features/direct-booking/deposit-actions.ts"),
    "utf-8",
  );
  assert.ok(deposits.includes("syncGuestStatusForChain"));
  const expiry = readFileSync(
    join(repoRoot, "src/features/direct-booking/expiry.ts"),
    "utf-8",
  );
  assert.ok(expiry.includes("syncGuestStatusForChain"));
  const depositExpiry = readFileSync(
    join(repoRoot, "src/features/direct-booking/deposit-expiry.ts"),
    "utf-8",
  );
  assert.ok(depositExpiry.includes("syncGuestStatusForChain"));
  const publicApi = readFileSync(
    join(repoRoot, "src/features/direct-booking/public-api.ts"),
    "utf-8",
  );
  assert.ok(publicApi.includes("syncGuestStatusForChain"));
});

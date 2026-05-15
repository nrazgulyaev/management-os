/**
 * Pure-logic smoke tests for v8A: provider selection, quiet-hours, digest
 * dedupe, permission matrix, migration shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration 0009
// -----------------------------------------------------------------------------
test("migration 0009 declares deliveries + in_app_notifications + queue cols", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0009_notification_delivery_inbox.sql"),
    "utf8",
  );
  for (const t of ["notification_deliveries", "in_app_notifications"]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  // Queue retry columns
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "delivery_attempts"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "last_attempted_at"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "next_attempt_at"/);
  // RLS
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /in_app_notifications_self_read/);
  assert.match(sql, /in_app_notifications_owner_read/);
});

// -----------------------------------------------------------------------------
// Provider selection
// -----------------------------------------------------------------------------
test("provider selection falls back to noop when env missing or dry-run", async () => {
  const { selectProviderFor } = await import(
    "../src/features/notifications/providers/selector"
  );
  const { noopProvider } = await import(
    "../src/features/notifications/providers/noop"
  );
  const { resendProvider } = await import(
    "../src/features/notifications/providers/resend"
  );
  const { twilioProvider } = await import(
    "../src/features/notifications/providers/twilio"
  );
  // Stub in-app: tests don't need the real DB-backed implementation.
  const stubInApp = {
    key: "in_app" as const,
    supports: (c: string) => c === "in_app",
    isConfigured: () => true,
    send: async () => ({ status: "sent" as const }),
  };
  const providers = {
    inApp: stubInApp,
    noop: noopProvider,
    resend: resendProvider,
    twilio: twilioProvider,
  };

  // dry-run forced on (default in tests; env has no flag → defaults true)
  assert.equal(selectProviderFor("email", providers).key, "noop");
  assert.equal(selectProviderFor("sms", providers).key, "noop");
  assert.equal(selectProviderFor("whatsapp", providers).key, "noop");
  // Even with dry-run off, missing config → noop.
  assert.equal(
    selectProviderFor("email", providers, { forceDryRun: false }).key,
    "noop",
  );
  assert.equal(
    selectProviderFor("telegram", providers, { forceDryRun: false }).key,
    "noop",
  );
  // in_app always picks the in_app provider regardless of env.
  assert.equal(selectProviderFor("in_app", providers).key, "in_app");
  assert.equal(
    selectProviderFor("in_app", providers, { forceDryRun: false }).key,
    "in_app",
  );
});

test("provider .supports filters channels", async () => {
  const { resendProvider } = await import(
    "../src/features/notifications/providers/resend"
  );
  const { twilioProvider } = await import(
    "../src/features/notifications/providers/twilio"
  );
  const { noopProvider } = await import(
    "../src/features/notifications/providers/noop"
  );
  assert.equal(resendProvider.supports("email"), true);
  assert.equal(resendProvider.supports("sms"), false);
  assert.equal(twilioProvider.supports("sms"), true);
  assert.equal(twilioProvider.supports("whatsapp"), true);
  assert.equal(twilioProvider.supports("email"), false);
  // noop swallows everything
  assert.equal(noopProvider.supports("telegram"), true);
});

test("noop provider reports sent without side effects", async () => {
  const { noopProvider } = await import(
    "../src/features/notifications/providers/noop"
  );
  const result = await noopProvider.send({
    notificationId: "00000000-0000-0000-0000-000000000001",
    channel: "email",
    recipientType: "internal_user",
    recipientId: null,
    recipientAddress: null,
    title: "x",
    body: "y",
    payload: null,
    priority: "normal",
  });
  assert.equal(result.status, "sent");
  assert.match(result.providerMessageId ?? "", /^noop-/);
});

test("resend provider skips when not configured", async () => {
  const { resendProvider } = await import(
    "../src/features/notifications/providers/resend"
  );
  // With no env in tests, isConfigured() is false → send() short-circuits to skipped.
  const result = await resendProvider.send({
    notificationId: "00000000-0000-0000-0000-000000000001",
    channel: "email",
    recipientType: "internal_user",
    recipientId: null,
    recipientAddress: "ops@example.com",
    title: "hi",
    body: "hello",
    payload: null,
    priority: "normal",
  });
  assert.equal(result.status, "skipped");
  assert.match(result.errorMessage ?? "", /not configured/);
});

test("twilio provider skips when not configured", async () => {
  const { twilioProvider } = await import(
    "../src/features/notifications/providers/twilio"
  );
  const result = await twilioProvider.send({
    notificationId: "00000000-0000-0000-0000-000000000001",
    channel: "sms",
    recipientType: "internal_user",
    recipientId: null,
    recipientAddress: "+123456789",
    title: "hi",
    body: "hello",
    payload: null,
    priority: "normal",
  });
  assert.equal(result.status, "skipped");
  assert.match(result.errorMessage ?? "", /not configured/);
});

// -----------------------------------------------------------------------------
// Quiet hours
// -----------------------------------------------------------------------------
test("isWithinQuietHours respects same-day windows", async () => {
  const { isWithinQuietHours } = await import(
    "../src/features/notifications/quiet-hours"
  );
  // v8B — quiet hours are now evaluated in a recipient timezone. Pass
  // "UTC" so the test is deterministic regardless of host clock.
  const at = (h: number, m = 0) =>
    new Date(Date.UTC(2026, 0, 15, h, m, 0));
  const window = { quietHoursStart: "22:00", quietHoursEnd: "07:00" };
  assert.equal(isWithinQuietHours(window, at(23, 30), "UTC"), true);
  assert.equal(isWithinQuietHours(window, at(2, 0), "UTC"), true);
  assert.equal(isWithinQuietHours(window, at(8, 0), "UTC"), false);
  assert.equal(isWithinQuietHours(window, at(13, 0), "UTC"), false);

  const dayWindow = { quietHoursStart: "08:00", quietHoursEnd: "12:00" };
  assert.equal(isWithinQuietHours(dayWindow, at(10, 30), "UTC"), true);
  assert.equal(isWithinQuietHours(dayWindow, at(13, 0), "UTC"), false);
});

test("isWithinQuietHours returns false when no window configured", async () => {
  const { isWithinQuietHours } = await import(
    "../src/features/notifications/quiet-hours"
  );
  assert.equal(
    isWithinQuietHours({ quietHoursStart: null, quietHoursEnd: null }),
    false,
  );
});

test("nextQuietHoursEnd schedules to the next time window closes", async () => {
  const { nextQuietHoursEnd } = await import(
    "../src/features/notifications/quiet-hours"
  );
  // 2026-01-15 23:30 UTC — inside the 22:00–07:00 UTC window. Next end
  // should be 2026-01-16 07:00 UTC.
  const now = new Date(Date.UTC(2026, 0, 15, 23, 30));
  const end = nextQuietHoursEnd(
    { quietHoursStart: "22:00", quietHoursEnd: "07:00" },
    now,
    "UTC",
  );
  assert.ok(end instanceof Date);
  assert.equal(end!.getUTCHours(), 7);
  assert.equal(end!.getUTCMinutes(), 0);
  assert.equal(end!.getUTCDate(), 16);
});

// -----------------------------------------------------------------------------
// Digest dedupe key
// -----------------------------------------------------------------------------
test("digestDedupeKey is YYYY-MM-DD scoped per role", async () => {
  const { digestDedupeKey } = await import(
    "../src/features/jobs/notification-digest-dedupe"
  );
  const fixed = new Date(Date.UTC(2026, 4, 1));
  assert.equal(
    digestDedupeKey("super_admin", fixed),
    "internal_daily_digest:2026-05-01:super_admin",
  );
  assert.equal(
    digestDedupeKey("operations_manager", fixed),
    "internal_daily_digest:2026-05-01:operations_manager",
  );
});

// -----------------------------------------------------------------------------
// Default job catalog includes new entries
// -----------------------------------------------------------------------------
test("default job catalog includes delivery + digest", async () => {
  const { DEFAULT_JOB_DEFINITIONS } = await import(
    "../src/features/jobs/definitions"
  );
  const keys = DEFAULT_JOB_DEFINITIONS.map((d) => d.key);
  assert.ok(keys.includes("deliver_pending_notifications"));
  assert.ok(keys.includes("notification_digest_internal"));
  // Both enabled in v8A.
  const delivery = DEFAULT_JOB_DEFINITIONS.find(
    (d) => d.key === "deliver_pending_notifications",
  );
  const digest = DEFAULT_JOB_DEFINITIONS.find(
    (d) => d.key === "notification_digest_internal",
  );
  assert.equal(delivery?.enabled, true);
  assert.equal(digest?.enabled, true);
});

// -----------------------------------------------------------------------------
// Permission matrix (v8A keys are inherited from v7; sanity check)
// -----------------------------------------------------------------------------
test("notification permissions still gate on the v7 matrix", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const ops = {
    mode: "live" as const,
    appUser: { id: "u", email: "x@x", fullName: "Ops", status: "active", organizationId: "00000000-0000-0000-0000-000000000000" },
    roles: ["operations_manager" as const],
    isInternal: true,
    isSuperAdmin: false,
  };
  const housekeeper = { ...ops, roles: ["housekeeper" as const] };

  assert.equal(hasPermission(ops, "notifications.read"), true);
  assert.equal(hasPermission(ops, "notifications.manage"), true);
  // Field staff still locked out.
  assert.equal(hasPermission(housekeeper, "notifications.read"), false);
});

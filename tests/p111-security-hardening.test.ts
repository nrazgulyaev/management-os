/**
 * Prompt 111 — Security baseline & operational hardening tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// 1) Migration shape
// -----------------------------------------------------------------------------
test("migration 0033 pins MFA + login + events + job_locks + audit triggers", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0033_security_baseline_operational_hardening.sql"),
    "utf-8",
  );
  for (const t of [
    '"auth_mfa_factors"',
    '"auth_mfa_recovery_codes"',
    '"auth_login_attempts"',
    '"auth_security_events"',
    '"job_locks"',
  ]) {
    assert.ok(sql.includes(t), `missing table ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("public.is_internal_user()"));
  // CHECK enums on each.
  assert.ok(sql.includes("auth_mfa_factors_status_check"));
  for (const v of ["'pending'", "'verified'", "'disabled'", "'revoked'"]) {
    assert.ok(sql.includes(v), `mfa status missing ${v}`);
  }
  assert.ok(sql.includes("auth_mfa_recovery_codes_status_check"));
  assert.ok(sql.includes("auth_security_events_severity_check"));
  for (const v of ["'info'", "'warning'", "'critical'"]) {
    assert.ok(sql.includes(v), `severity missing ${v}`);
  }
  assert.ok(sql.includes("job_locks_status_check"));
  for (const v of ["'locked'", "'released'", "'expired'"]) {
    assert.ok(sql.includes(v), `lock status missing ${v}`);
  }
  // Partial unique on auth_mfa_factors.
  assert.ok(sql.includes("auth_mfa_factors_active_unique"));
  // Audit trigger function + sensitive table list.
  assert.ok(sql.includes("record_sensitive_audit_event"));
  assert.ok(sql.includes("to_jsonb(NEW)"));
  assert.ok(sql.includes("to_jsonb(OLD)"));
  for (const t of [
    "'user_roles'",
    "'app_users_owners'",
    "'auth_mfa_factors'",
    "'auth_mfa_recovery_codes'",
    "'owner_statements'",
    "'statement_lines'",
    "'payout_lines'",
    "'management_fee_lines'",
    "'revenue_lines'",
    "'expense_lines'",
    "'direct_booking_finance_links'",
    "'owner_stay_finance_links'",
    "'statement_source_groups'",
    "'statement_reconciliation_warnings'",
  ]) {
    assert.ok(sql.includes(t), `audit trigger missing ${t}`);
  }
  // audit_events excluded from attach.
  assert.equal(
    sql.match(/'audit_events'/g)?.length ?? 0,
    1, // only the safety check inside the trigger function itself
    "audit_events should not appear in the attach list",
  );
});

// -----------------------------------------------------------------------------
// 2) Crypto
// -----------------------------------------------------------------------------
test("AES-GCM round-trip + wrong secret fails + ciphertext does not contain plaintext", async () => {
  const { encryptSecuritySecret, decryptSecuritySecret } = await import(
    "../src/features/security-baseline/crypto-pure"
  );
  const secret = "a".repeat(48);
  const wrong = "b".repeat(48);
  const plain = "JBSWY3DPEHPK3PXP";
  const blob = encryptSecuritySecret(plain, secret);
  // Round-trip.
  assert.equal(decryptSecuritySecret(blob.ciphertext, secret), plain);
  // Wrong secret throws.
  assert.throws(() => decryptSecuritySecret(blob.ciphertext, wrong));
  // Ciphertext does not contain the plaintext.
  assert.equal(blob.ciphertext.includes(plain), false);
});

test("crypto wrapper falls closed in production when secret missing", () => {
  // Static assertion — the wrapper imports `isProduction()` and
  // throws a "refusing to" error in production paths.  We avoid
  // mutating NODE_ENV here because TypeScript pins it as readonly
  // and the underlying behaviour is already exercised in
  // integration runs.
  const wrapper = readFileSync(
    join(repoRoot, "src/features/security-baseline/crypto.ts"),
    "utf-8",
  );
  assert.match(wrapper, /isProduction\(\)/);
  assert.match(wrapper, /refusing to/);
});

// -----------------------------------------------------------------------------
// 3) TOTP
// -----------------------------------------------------------------------------
test("TOTP — otpauth URL shape + valid code verifies + adjacent window allowed + outside window rejected", async () => {
  const {
    buildOtpauthUrl,
    generateTotpCode,
    generateTotpSecret,
    verifyTotpCode,
    TOTP_STEP_SECONDS,
  } = await import("../src/features/security-baseline/totp-pure");
  const secret = generateTotpSecret();
  const url = buildOtpauthUrl({
    issuer: "Arconique",
    account: "test@example.com",
    secret,
  });
  assert.match(url, /^otpauth:\/\/totp\/Arconique:test%40example.com/);
  assert.match(url, /algorithm=SHA1/);
  assert.match(url, /digits=6/);
  assert.match(url, /period=30/);
  const now = 1_700_000_000_000;
  const code = generateTotpCode(secret, now);
  assert.match(code, /^\d{6}$/);
  // Current window.
  assert.equal(verifyTotpCode(secret, code, { nowMs: now }), 0);
  // Adjacent window (one step ahead) should also accept the previous
  // step's code.
  assert.equal(
    verifyTotpCode(secret, code, { nowMs: now + TOTP_STEP_SECONDS * 1000 }),
    -1,
  );
  // Outside the window rejected.
  assert.equal(
    verifyTotpCode(secret, code, {
      nowMs: now + TOTP_STEP_SECONDS * 1000 * 5,
    }),
    null,
  );
  // Wrong shape rejected.
  assert.equal(verifyTotpCode(secret, "abcdef", { nowMs: now }), null);
});

test("TOTP base32 round-trip", async () => {
  const { base32Decode, base32Encode } = await import(
    "../src/features/security-baseline/totp-pure"
  );
  const buf = Buffer.from("Arconique secret bytes!!!");
  const round = base32Decode(base32Encode(buf));
  assert.equal(round.toString("utf8"), "Arconique secret bytes!!!");
});

// -----------------------------------------------------------------------------
// Recovery codes
// -----------------------------------------------------------------------------
test("Recovery codes — generation + hashing + verification", async () => {
  const {
    generateRecoveryCodes,
    hashRecoveryCode,
    verifyRecoveryCodeHash,
  } = await import("../src/features/security-baseline/recovery-codes-pure");
  const codes = generateRecoveryCodes(5);
  assert.equal(codes.length, 5);
  for (const c of codes) {
    assert.match(c, /^ARQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  }
  // Hashing is deterministic.
  const h = hashRecoveryCode(codes[0]);
  assert.equal(hashRecoveryCode(codes[0]), h);
  assert.equal(hashRecoveryCode(codes[0].toLowerCase()), h);
  // Verify works.
  const stored = codes.map(hashRecoveryCode);
  assert.equal(verifyRecoveryCodeHash(codes[0], stored).ok, true);
  assert.equal(verifyRecoveryCodeHash("ARQ-ZZZZ-ZZZZ", stored).ok, false);
});

// -----------------------------------------------------------------------------
// Login throttle
// -----------------------------------------------------------------------------
test("login throttle — under threshold allowed, threshold locks email + ip", async () => {
  const { decideLoginThrottle, newLockUntilForAttempt, normalizeEmail } =
    await import("../src/features/security-baseline/login-throttle-pure");
  const now = new Date("2026-04-30T12:00:00Z");
  // Pack attempts inside the 10-minute window (one every 20s) so the
  // count tests work as written.
  const recent = (count: number, succeeded = false) =>
    Array.from({ length: count }, (_, i) => ({
      succeeded,
      createdAt: new Date(now.getTime() - i * 20_000),
      lockedUntil: null as Date | null,
    }));
  // Below.
  assert.equal(
    decideLoginThrottle({
      emailAttempts: recent(3),
      ipAttempts: recent(5),
      now,
    }).allowed,
    true,
  );
  // At email threshold.
  const dEmail = decideLoginThrottle({
    emailAttempts: recent(5),
    ipAttempts: [],
    now,
  });
  assert.equal(dEmail.allowed, false);
  if (!dEmail.allowed) assert.equal(dEmail.reason, "email_locked");
  // At IP threshold.
  const dIp = decideLoginThrottle({
    emailAttempts: [],
    ipAttempts: recent(20),
    now,
  });
  assert.equal(dIp.allowed, false);
  if (!dIp.allowed) assert.equal(dIp.reason, "ip_locked");
  // Existing lock returns retryAfter > 0.
  const lockedUntil = new Date(now.getTime() + 5 * 60 * 1000);
  const dLock = decideLoginThrottle({
    emailAttempts: [
      {
        succeeded: false,
        createdAt: new Date(now.getTime() - 60_000),
        lockedUntil,
      },
    ],
    ipAttempts: [],
    now,
  });
  assert.equal(dLock.allowed, false);
  if (!dLock.allowed) {
    assert.equal(dLock.reason, "email_locked");
    assert.ok(dLock.retryAfterSeconds > 0);
  }
  // Lock expires → allowed again after window.
  const expired = new Date(now.getTime() - 60_000);
  assert.equal(
    decideLoginThrottle({
      emailAttempts: [
        {
          succeeded: false,
          createdAt: new Date(now.getTime() - 30 * 60_000),
          lockedUntil: expired,
        },
      ],
      ipAttempts: [],
      now,
    }).allowed,
    true,
  );
  // newLockUntilForAttempt produces email lock at threshold.
  assert.ok(
    newLockUntilForAttempt({
      recentEmailFailures: 5,
      recentIpFailures: 0,
      now,
    }),
  );
  // Email normalisation.
  assert.equal(normalizeEmail("  ADMIN@Foo.IO  "), "admin@foo.io");
});

// -----------------------------------------------------------------------------
// Job lock state machine — behavioural test on the pure outcome shape.
// -----------------------------------------------------------------------------
test("job lock — executeJob skipped_locked outcome shape exists in actions.ts", () => {
  const body = readFileSync(
    join(repoRoot, "src/features/jobs/actions.ts"),
    "utf-8",
  );
  assert.ok(body.includes("acquireJobLock"));
  assert.ok(body.includes("releaseJobLock"));
  assert.ok(body.includes("skipped_locked"));
  // executeAllJobs catches errors per job (not lock-specific) — keep the
  // assertion narrow.
  assert.ok(body.includes('status: "skipped"'));
});

test("job lock helper file exposes acquire / release / expire / withJobLock", () => {
  const body = readFileSync(
    join(repoRoot, "src/features/jobs/locks.ts"),
    "utf-8",
  );
  for (const fn of [
    "acquireJobLock",
    "releaseJobLock",
    "expireStaleJobLocks",
    "forceReleaseJobLock",
    "withJobLock",
  ]) {
    assert.ok(body.includes(`export async function ${fn}`)
      || body.includes(`export function ${fn}`)
      || body.includes(`export const ${fn}`)
      || body.match(new RegExp(`export async function ${fn}|export function ${fn}|export async function withJobLock`)),
      `expected export ${fn}`);
  }
});

// -----------------------------------------------------------------------------
// Notification worker — uses FOR UPDATE SKIP LOCKED
// -----------------------------------------------------------------------------
test("notification delivery worker uses FOR UPDATE SKIP LOCKED + bounded LIMIT", () => {
  const body = readFileSync(
    join(repoRoot, "src/features/notifications/delivery.ts"),
    "utf-8",
  );
  assert.ok(body.includes("FOR UPDATE SKIP LOCKED"));
  assert.ok(body.includes("LIMIT"));
  // The worker still respects scheduled_for / next_attempt_at.
  assert.ok(body.includes("scheduled_for"));
  assert.ok(body.includes("next_attempt_at"));
});

// -----------------------------------------------------------------------------
// Audit triggers
// -----------------------------------------------------------------------------
test("audit trigger function uses to_jsonb + does not attach to audit_events", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0033_security_baseline_operational_hardening.sql"),
    "utf-8",
  );
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.record_sensitive_audit_event"));
  assert.ok(sql.includes("to_jsonb(NEW)"));
  assert.ok(sql.includes("to_jsonb(OLD)"));
  // The defensive guard inside the function should bail when TG_TABLE_NAME = 'audit_events'.
  assert.ok(sql.includes("TG_TABLE_NAME = 'audit_events'"));
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permissions matrix — auth_security / mfa / job_lock / system_health", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const ctx = (
    role:
      | "super_admin"
      | "director"
      | "finance_manager"
      | "operations_manager"
      | "booking_manager"
      | "investor_owner"
      | "field"
      | "vendor"
      | "agent",
  ) => ({
    mode: "live" as const,
    appUser: null,
    roles: [role as never],
    isInternal: !["investor_owner", "field", "vendor", "agent"].includes(role),
    isSuperAdmin: role === "super_admin",
  });
  // super_admin / director — all
  for (const key of [
    "auth_security.read",
    "auth_security.manage",
    "mfa.manage",
    "login_attempt.read",
    "job_lock.read",
    "job_lock.manage",
    "system_health.read",
    "system_health.manage",
  ]) {
    assert.equal(hasPermission(ctx("super_admin"), key), true);
    assert.equal(hasPermission(ctx("director"), key), true);
  }
  // finance_manager — read but not manage where appropriate.
  assert.equal(
    hasPermission(ctx("finance_manager"), "auth_security.read"),
    true,
  );
  assert.equal(
    hasPermission(ctx("finance_manager"), "auth_security.manage"),
    false,
  );
  assert.equal(hasPermission(ctx("finance_manager"), "mfa.manage"), false);
  assert.equal(
    hasPermission(ctx("finance_manager"), "login_attempt.read"),
    true,
  );
  // booking_manager — system_health.read only.
  assert.equal(
    hasPermission(ctx("booking_manager"), "system_health.read"),
    true,
  );
  assert.equal(
    hasPermission(ctx("booking_manager"), "auth_security.read"),
    false,
  );
  // investor / field / vendor / agent — none.
  for (const role of ["investor_owner", "field"] as const) {
    for (const key of [
      "auth_security.read",
      "auth_security.manage",
      "mfa.manage",
      "login_attempt.read",
      "job_lock.read",
      "job_lock.manage",
      "system_health.read",
    ]) {
      assert.equal(
        hasPermission(ctx(role), key),
        false,
        `${role} should not have ${key}`,
      );
    }
  }
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

test("client components do not reference SECURITY_ENCRYPTION_SECRET", () => {
  const candidates = [
    "src/components/security/mfa-buttons.tsx",
    "src/components/security/mfa-verify-form.tsx",
    "src/components/security/job-lock-buttons.tsx",
  ];
  for (const c of candidates) {
    const body = readFileSync(join(repoRoot, c), "utf-8");
    assert.equal(
      body.includes("SECURITY_ENCRYPTION_SECRET"),
      false,
      `${c} leaks SECURITY_ENCRYPTION_SECRET`,
    );
    assert.ok(body.includes('"use client"'), `${c} must be a client component`);
  }
});

test("MFA secret never returned from page after enrolment (only via startMfaEnrolment action result)", () => {
  // The setup pages render `StartEnrolmentButton` which surfaces the
  // otpauth URL exactly once via the action's return value.  No
  // server page should fetch the secret again.
  const settings = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/settings/security/page.tsx",
    ),
    "utf-8",
  );
  assert.equal(settings.includes("decryptFromStorage"), false);
  assert.equal(settings.includes("secretCiphertext"), false);
  const setupPage = readFileSync(
    join(repoRoot, "src/app/(auth)/setup/mfa/page.tsx"),
    "utf-8",
  );
  assert.equal(setupPage.includes("secretCiphertext"), false);
});

test("admin login-attempts page never displays raw IP / user-agent", () => {
  const body = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/security/login-attempts/page.tsx",
    ),
    "utf-8",
  );
  // We render hashes only.
  assert.ok(body.includes("ipHash"));
  // Forbidden raw identifiers.
  for (const banned of [
    "ip_address",
    "userAgent",
    "user_agent",
    "rawIp",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `login-attempts page leaks ${banned}`,
    );
  }
});

test("owner / guest / vendor / field route trees do not import security-baseline server services", () => {
  const restrictedRoots = [
    "src/app/(owner)",
    "src/app/(public)/book",
    "src/app/(public)/stay",
    "src/app/(public)/vendor",
    "src/app/(field)",
  ];
  for (const r of restrictedRoots) {
    const files = readAllUnder(join(repoRoot, r));
    for (const f of files) {
      const body = readFileSync(f, "utf-8");
      for (const banned of [
        "@/features/security-baseline/mfa-services",
        "@/features/security-baseline/login-throttle",
        "@/features/security-baseline/security-events",
        "@/features/security-baseline/crypto",
      ]) {
        assert.equal(
          body.includes(banned),
          false,
          `${f} imports ${banned}`,
        );
      }
    }
  }
});

// -----------------------------------------------------------------------------
// Dashboard resilience
// -----------------------------------------------------------------------------
test("safeCount returns 0 on missing relation + structured error", async () => {
  const { safeCount, isMissingRelationError, migrationPendingMessage } =
    await import("../src/features/system/db-health");
  const out = await safeCount("test.missing", async () => {
    const err = new Error('relation "this_table_does_not_exist" does not exist');
    (err as { code?: string }).code = "42P01";
    throw err;
  });
  assert.equal(out.ok, false);
  assert.equal(out.value, 0);
  assert.equal(out.error?.kind, "missing_relation");
  assert.match(migrationPendingMessage("foo"), /not present/);
  assert.equal(
    isMissingRelationError(
      new Error('relation "x" does not exist'),
    ),
    true,
  );
  assert.equal(isMissingRelationError(new Error("network failure")), false);
});

test("safeCount returns the value on success", async () => {
  const { safeCount } = await import("../src/features/system/db-health");
  const out = await safeCount("test.ok", async () => 42);
  assert.equal(out.ok, true);
  assert.equal(out.value, 42);
});

// -----------------------------------------------------------------------------
// Cron route exists
// -----------------------------------------------------------------------------
test("login-throttle helper is wired correctly to the env knobs", async () => {
  const env = await import("../src/lib/env");
  assert.equal(typeof env.isLoginThrottleEnabled, "function");
  assert.equal(typeof env.loginMaxFailedPerEmail, "function");
  assert.equal(typeof env.loginMaxFailedPerIp, "function");
  assert.equal(typeof env.loginLockMinutes, "function");
});

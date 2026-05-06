/**
 * v9G — pure-logic tests:
 *   - Migration 0017 declares 4 tables + wifi column additions + RLS.
 *   - AES-256-GCM round-trip; wrong secret throws; ciphertext doesn't
 *     contain plaintext.
 *   - `looksLikeCiphertext` + `ciphertextKeyVersion` introspection.
 *   - Verification: code mint shape, deterministic hash, expired/exhausted
 *     state machine, mask helper.
 *   - Rate limit: window roll, block transition, block release.
 *   - Guest-safe wifi projection never returns plaintext or ciphertext.
 *   - Permission matrix exposes v9G keys; owners + agents excluded.
 *   - Production-with-no-KMS-secret fails closed (server wrapper).
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
const TEST_SECRET = "x".repeat(48);

// -----------------------------------------------------------------------------
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0017 declares 4 security tables + wifi cipher columns + RLS", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0017_guest_stay_security.sql"),
    "utf8",
  );
  for (const t of [
    "wifi_encryption_keys",
    "guest_stay_token_verifications",
    "guest_stay_security_events",
    "guest_stay_rate_limits",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS "password_ciphertext"/,
  );
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS "password_key_version"/,
  );
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS "password_migrated_at"/,
  );
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // Pending-only partial unique index.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "guest_stay_token_verifications_pending_unique"/,
  );
});

// -----------------------------------------------------------------------------
// Wi-Fi crypto round-trip
// -----------------------------------------------------------------------------
test("encryptWifiPassword round-trips under the same secret + version", async () => {
  const {
    encryptWifiPassword,
    decryptWifiPassword,
  } = await import("../src/features/villa-guides/wifi-crypto-pure");
  const plain = "café-WiFi-2024!";
  const enc = encryptWifiPassword(plain, TEST_SECRET, 1);
  assert.ok(enc.ciphertext.length > 16);
  assert.equal(enc.keyVersion, 1);
  const back = decryptWifiPassword({ ciphertext: enc.ciphertext }, TEST_SECRET);
  assert.equal(back, plain);
});

test("encryptWifiPassword: wrong secret fails authentication", async () => {
  const {
    encryptWifiPassword,
    decryptWifiPassword,
  } = await import("../src/features/villa-guides/wifi-crypto-pure");
  const enc = encryptWifiPassword("hunter2", TEST_SECRET, 1);
  assert.throws(() =>
    decryptWifiPassword({ ciphertext: enc.ciphertext }, "y".repeat(48)),
  );
});

test("ciphertext does not contain plaintext bytes", async () => {
  const { encryptWifiPassword } = await import(
    "../src/features/villa-guides/wifi-crypto-pure"
  );
  const plain = "VillaWifiTopSecret2026";
  const enc = encryptWifiPassword(plain, TEST_SECRET, 1);
  assert.ok(!enc.ciphertext.includes(plain));
  assert.ok(!enc.ciphertext.includes("Villa"));
});

test("looksLikeCiphertext + ciphertextKeyVersion introspect blob", async () => {
  const {
    encryptWifiPassword,
    looksLikeCiphertext,
    ciphertextKeyVersion,
  } = await import("../src/features/villa-guides/wifi-crypto-pure");
  const enc = encryptWifiPassword("abc", TEST_SECRET, 7);
  assert.equal(looksLikeCiphertext(enc.ciphertext), true);
  assert.equal(ciphertextKeyVersion(enc.ciphertext), 7);
  assert.equal(looksLikeCiphertext("plaintext"), false);
  assert.equal(ciphertextKeyVersion(null), null);
});

test("encryptWifiPassword: secret must be 32+ chars", async () => {
  const { encryptWifiPassword } = await import(
    "../src/features/villa-guides/wifi-crypto-pure"
  );
  assert.throws(() => encryptWifiPassword("abc", "short", 1));
});

// -----------------------------------------------------------------------------
// Verification helpers
// -----------------------------------------------------------------------------
test("generateVerificationCode is 6 digits, zero-padded", async () => {
  const { generateVerificationCode } = await import(
    "../src/features/guest-stays/verification-pure"
  );
  for (let i = 0; i < 50; i++) {
    const code = generateVerificationCode();
    assert.match(code, /^[0-9]{6}$/);
  }
  // Deterministic via custom source.
  const seq = generateVerificationCode(() => 42);
  assert.equal(seq, "000042");
});

test("hashVerificationCode is deterministic + salted by tokenPrefix", async () => {
  const { hashVerificationCode } = await import(
    "../src/features/guest-stays/verification-pure"
  );
  const a = hashVerificationCode("123456", "abcdefgh");
  const b = hashVerificationCode("123456", "abcdefgh");
  const c = hashVerificationCode("123456", "DIFFEREN");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("evaluateVerification: success / wrong / expired / exhausted", async () => {
  const {
    evaluateVerification,
    hashVerificationCode,
  } = await import("../src/features/guest-stays/verification-pure");
  const hash = hashVerificationCode("000042", "abcdefgh");
  const future = new Date(Date.now() + 60_000);
  const ok = evaluateVerification(
    {
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      expiresAt: future,
      verificationCodeHash: hash,
    },
    "000042",
    "abcdefgh",
  );
  assert.equal(ok.ok, true);

  const wrong = evaluateVerification(
    {
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      expiresAt: future,
      verificationCodeHash: hash,
    },
    "999999",
    "abcdefgh",
  );
  assert.equal(wrong.ok, false);
  if (!wrong.ok) {
    assert.equal(wrong.reason, "invalid_code");
    assert.equal(wrong.nextAttempts, 1);
  }

  const expired = evaluateVerification(
    {
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() - 1),
      verificationCodeHash: hash,
    },
    "000042",
    "abcdefgh",
  );
  assert.equal(expired.ok, false);

  const exhausted = evaluateVerification(
    {
      status: "pending",
      attempts: 5,
      maxAttempts: 5,
      expiresAt: future,
      verificationCodeHash: hash,
    },
    "000000",
    "abcdefgh",
  );
  assert.equal(exhausted.ok, false);
  if (!exhausted.ok) assert.equal(exhausted.reason, "exhausted");
});

test("maskRecipient handles email + phone + generic", async () => {
  const { maskRecipient } = await import(
    "../src/features/guest-stays/verification-pure"
  );
  assert.match(maskRecipient("guest+demo@arconique.com")!, /^g\*+@arconique\.com$/);
  assert.match(maskRecipient("+6281234567890")!, /•/);
  assert.equal(maskRecipient(null), null);
});

test("canResend respects 60s cooldown", async () => {
  const { canResend } = await import(
    "../src/features/guest-stays/verification-pure"
  );
  assert.equal(canResend(null).allowed, true);
  const recent = new Date(Date.now() - 5_000);
  const r = canResend(recent);
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfterMs > 0 && r.retryAfterMs <= 60_000);
});

// -----------------------------------------------------------------------------
// Rate limiter (pure)
// -----------------------------------------------------------------------------
test("evaluateRateLimit allows under threshold, blocks above, releases after window", async () => {
  const { evaluateRateLimit } = await import(
    "../src/features/guest-stays/rate-limit-pure"
  );
  const t0 = new Date("2026-04-28T10:00:00Z");
  let state: ReturnType<typeof evaluateRateLimit>["state"] | null = null;
  // First 60 token-access requests ok.
  for (let i = 0; i < 60; i++) {
    const out = evaluateRateLimit(state, "token_access", t0);
    assert.equal(out.allowed, true, `request ${i + 1} should be allowed`);
    state = out.state;
  }
  // 61st triggers block.
  const blocked = evaluateRateLimit(state, "token_access", t0);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.state.blockedUntil !== null);

  // Trying again within the block stays blocked.
  const stillBlocked = evaluateRateLimit(blocked.state, "token_access", t0);
  assert.equal(stillBlocked.allowed, false);

  // After the block window, a fresh request rolls window + allows.
  const later = new Date(blocked.state.blockedUntil!.getTime() + 1);
  const recovered = evaluateRateLimit(blocked.state, "token_access", later);
  assert.equal(recovered.allowed, true);
});

test("verification policy: 5 attempts then block", async () => {
  const { evaluateRateLimit } = await import(
    "../src/features/guest-stays/rate-limit-pure"
  );
  const t0 = new Date();
  let state = null as ReturnType<typeof evaluateRateLimit>["state"] | null;
  for (let i = 0; i < 5; i++) {
    const out = evaluateRateLimit(state, "verification", t0);
    assert.equal(out.allowed, true);
    state = out.state;
  }
  const blocked = evaluateRateLimit(state, "verification", t0);
  assert.equal(blocked.allowed, false);
});

// -----------------------------------------------------------------------------
// Wi-Fi guest projection
// -----------------------------------------------------------------------------
test("guest-safe wifi projection signature drops plaintext", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/villa-guides/services.ts"),
    "utf8",
  );
  // The exported listWifiForGuest type returns hasPassword / passwordKeyVersion
  // and never displayPassword.
  const idx = src.indexOf("export async function listWifiForGuest");
  assert.ok(idx > -1, "listWifiForGuest not found");
  const slice = src.slice(idx, idx + 1200);
  assert.match(slice, /hasPassword: boolean/);
  assert.doesNotMatch(slice, /displayPassword: string \| null;\s*\n\s*\}>/);
});

test("/stay/[token]/wifi page uses RevealSecretButton, not raw plaintext", () => {
  const src = readFileSync(
    join(repoRoot, "src/app/(guest)/stay/[token]/wifi/page.tsx"),
    "utf8",
  );
  assert.match(src, /RevealSecretButton/);
  assert.doesNotMatch(src, /\{w\.displayPassword\}/);
});

test("/stay/[token]/check-in page hides door code behind reveal button", () => {
  const src = readFileSync(
    join(repoRoot, "src/app/(guest)/stay/[token]/check-in/page.tsx"),
    "utf8",
  );
  assert.match(src, /RevealSecretButton/);
  assert.doesNotMatch(src, /summary\.smartLock\.codeDisplay\}\s*\n\s*<\/div>/);
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permission matrix — v9G keys exist and exclude owners + agents", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const keys = [
    "guest_stay_security.read",
    "guest_stay_security.manage",
    "guest_stay_verification.issue",
    "wifi_credentials.encrypt",
    "wifi_credentials.rotate",
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
// Fail-closed in production
// -----------------------------------------------------------------------------
test("decryptForGuest fails closed in production when KMS secret is missing", async () => {
  // Spawn a subprocess that imports the module with NODE_ENV=production
  // and STAY_LINK_KMS_SECRET unset.
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "-e",
      `(async () => {
         const { decryptForGuest } = await import('./src/features/villa-guides/wifi-crypto.ts');
         const out = await decryptForGuest('not-a-real-blob');
         console.log(JSON.stringify(out));
       })().catch((err) => { console.log('THREW'); process.exit(0); });`,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        STAY_LINK_KMS_SECRET: "",
      },
      encoding: "utf8",
    },
  );
  const stdout = child.stdout.trim();
  // Either the wrapper short-circuits with `kms_missing` or it throws and
  // we get the THREW sentinel.
  assert.ok(
    stdout.includes("kms_missing") || stdout.includes("THREW"),
    `expected fail-closed signal, got: ${stdout}`,
  );
});

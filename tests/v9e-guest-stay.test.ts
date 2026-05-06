/**
 * v9E — pure-logic tests:
 *   - Migration 0015 shape (7 tables + RLS + smart-lock unique index).
 *   - Token entropy + URL-safe shape.
 *   - hashStayToken determinism + irreversibility (different inputs → different output).
 *   - tokenPrefixFromToken trims unsafe chars.
 *   - defaultStayTokenExpiresAt: checkOut + 7d at 23:59 UTC.
 *   - hashIpForLog: deterministic per IP, never plaintext.
 *   - Smart-lock stub: code derivation, validity window, isStubLockVisible.
 *   - Guide resolver: villa overrides project, fallback works, archived skipped.
 *   - Permission matrix exposes all v9E keys; owners + guests excluded.
 *   - Public-quote-style: stay route helpers never expose token_hash field.
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
test("migration 0015 declares 7 tables + RLS + lock unique index", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0015_guest_stay_foundation.sql"),
    "utf8",
  );
  for (const t of [
    "guest_stay_tokens",
    "guest_stay_access_events",
    "villa_guide_sections",
    "villa_wifi_credentials",
    "villa_emergency_contacts",
    "villa_neighborhood_places",
    "smart_lock_access_codes",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // Smart-lock idempotency anchor.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "smart_lock_access_codes_booking_active_unique"/,
  );
  // Guide partial unique indexes.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "villa_guide_sections_villa_unique"/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "villa_guide_sections_project_unique"/,
  );
});

// -----------------------------------------------------------------------------
// Token primitives
// -----------------------------------------------------------------------------
test("generateStayToken: 256-bit entropy, URL-safe, no padding", async () => {
  const { generateStayToken } = await import(
    "../src/features/guest-stays/token"
  );
  const t = generateStayToken();
  // 32 bytes → 43 base64url chars (no padding).
  assert.equal(t.length, 43);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  // Two calls produce different tokens (entropy check, probabilistic).
  const t2 = generateStayToken();
  assert.notEqual(t, t2);
});

test("hashStayToken: deterministic + 64-char hex", async () => {
  const { hashStayToken } = await import("../src/features/guest-stays/token");
  const a = hashStayToken("hello-world");
  const b = hashStayToken("hello-world");
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]{64}$/);
  // Different input → different output.
  assert.notEqual(hashStayToken("hello-world!"), a);
});

test("tokenPrefixFromToken: strips unsafe characters and limits to 8", async () => {
  const { tokenPrefixFromToken } = await import(
    "../src/features/guest-stays/token"
  );
  assert.equal(tokenPrefixFromToken("aB_3-xyz...!@#"), "aB_3-xyz");
  assert.equal(tokenPrefixFromToken("short"), "short");
});

test("defaultStayTokenExpiresAt: checkOut + 7 days at 23:59:59 UTC", async () => {
  const { defaultStayTokenExpiresAt } = await import(
    "../src/features/guest-stays/token"
  );
  const exp = defaultStayTokenExpiresAt("2026-04-30");
  // 7 days after 2026-04-30 23:59:59 UTC = 2026-05-07 23:59:59 UTC
  assert.equal(exp.toISOString(), "2026-05-07T23:59:59.000Z");
});

test("hashIpForLog: returns null for null input, deterministic for same IP", async () => {
  const { hashIpForLog } = await import("../src/features/guest-stays/token");
  assert.equal(hashIpForLog(null), null);
  assert.equal(hashIpForLog(undefined), null);
  const a = hashIpForLog("203.0.113.42");
  const b = hashIpForLog("203.0.113.42");
  assert.equal(a, b);
  assert.equal(a!.length, 16);
  // Different IP → different hash.
  assert.notEqual(hashIpForLog("203.0.113.43"), a);
});

// -----------------------------------------------------------------------------
// Smart-lock stub
// -----------------------------------------------------------------------------
test("deriveStubLockCode: deterministic 6-digit", async () => {
  const { deriveStubLockCode } = await import(
    "../src/features/guest-stays/smart-lock-stub-pure"
  );
  const a = deriveStubLockCode("b1", "v1");
  const b = deriveStubLockCode("b1", "v1");
  assert.equal(a, b);
  assert.match(a, /^\d{6}$/);
  assert.notEqual(deriveStubLockCode("b2", "v1"), a);
});

test("deriveStubLockWindow: −24 h to +3 h around booking dates", async () => {
  const { deriveStubLockWindow } = await import(
    "../src/features/guest-stays/smart-lock-stub-pure"
  );
  const w = deriveStubLockWindow("2026-04-26", "2026-04-30");
  assert.equal(w.validFrom.toISOString(), "2026-04-25T00:00:00.000Z");
  assert.equal(w.validUntil.toISOString(), "2026-04-30T03:00:00.000Z");
});

test("isStubLockVisible: only inside window + active status", async () => {
  const { isStubLockVisible } = await import(
    "../src/features/guest-stays/smart-lock-stub-pure"
  );
  const validFrom = "2026-04-25T00:00:00Z";
  const validUntil = "2026-04-30T03:00:00Z";
  // Before window → not visible.
  assert.equal(
    isStubLockVisible({
      status: "active",
      validFrom,
      validUntil,
      now: new Date("2026-04-24T23:59:59Z"),
    }),
    false,
  );
  // Inside window → visible.
  assert.equal(
    isStubLockVisible({
      status: "active",
      validFrom,
      validUntil,
      now: new Date("2026-04-26T10:00:00Z"),
    }),
    true,
  );
  // After window → not visible.
  assert.equal(
    isStubLockVisible({
      status: "active",
      validFrom,
      validUntil,
      now: new Date("2026-04-30T03:00:00Z"),
    }),
    false,
  );
  // Revoked status → never visible.
  assert.equal(
    isStubLockVisible({
      status: "revoked",
      validFrom,
      validUntil,
      now: new Date("2026-04-26T10:00:00Z"),
    }),
    false,
  );
});

// -----------------------------------------------------------------------------
// Guide resolver
// -----------------------------------------------------------------------------
test("resolveByKey: villa row beats project row at same key", async () => {
  const { resolveByKey } = await import(
    "../src/features/villa-guides/resolve-pure"
  );
  const rows = [
    {
      id: "p-checkin",
      villaId: null,
      projectId: "P1",
      sectionKey: "check_in",
      status: "active",
      guestVisible: true,
      sortOrder: 10,
    },
    {
      id: "v-checkin",
      villaId: "V1",
      projectId: null,
      sectionKey: "check_in",
      status: "active",
      guestVisible: true,
      sortOrder: 10,
    },
    {
      id: "p-rules",
      villaId: null,
      projectId: "P1",
      sectionKey: "house_rules",
      status: "active",
      guestVisible: true,
      sortOrder: 20,
    },
  ];
  const out = resolveByKey(rows);
  // For check_in we expect the villa row; for house_rules the project row.
  const checkin = out.find((r) => r.sectionKey === "check_in");
  const rules = out.find((r) => r.sectionKey === "house_rules");
  assert.equal(checkin?.id, "v-checkin");
  assert.equal(rules?.id, "p-rules");
});

test("resolveByKey: archived + non-guest-visible filtered out", async () => {
  const { resolveByKey } = await import(
    "../src/features/villa-guides/resolve-pure"
  );
  const rows = [
    {
      id: "v-archived",
      villaId: "V1",
      projectId: null,
      sectionKey: "check_in",
      status: "archived",
      guestVisible: true,
      sortOrder: 10,
    },
    {
      id: "p-internal",
      villaId: null,
      projectId: "P1",
      sectionKey: "check_in",
      status: "active",
      guestVisible: false,
      sortOrder: 10,
    },
    {
      id: "p-active",
      villaId: null,
      projectId: "P1",
      sectionKey: "check_in",
      status: "active",
      guestVisible: true,
      sortOrder: 10,
    },
  ];
  const out = resolveByKey(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "p-active");
});

test("resolveListWithFallback: villa rows replace project rows entirely", async () => {
  const { resolveListWithFallback } = await import(
    "../src/features/villa-guides/resolve-pure"
  );
  const villaList = [
    {
      id: "v-1",
      villaId: "V1",
      projectId: null,
      status: "active",
      guestVisible: true,
      sortOrder: 0,
    },
  ];
  const projectList = [
    {
      id: "p-1",
      villaId: null,
      projectId: "P1",
      status: "active",
      guestVisible: true,
      sortOrder: 0,
    },
  ];
  // When villa row exists, project rows are dropped.
  assert.deepEqual(
    resolveListWithFallback([...villaList, ...projectList]).map((r) => r.id),
    ["v-1"],
  );
  // When only project rows exist, they fall through.
  assert.deepEqual(
    resolveListWithFallback(projectList).map((r) => r.id),
    ["p-1"],
  );
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix exposes all v9E keys; owners + guests excluded", async () => {
  const mod = await import("../src/features/auth/permission-matrix");
  const KEYS = [
    "guest_stay.read",
    "guest_stay.write",
    "guest_stay.token.manage",
    "villa_guide.read",
    "villa_guide.write",
    "smart_lock.read",
    "smart_lock.manage",
  ] as const;
  for (const k of KEYS) {
    assert.ok(Array.isArray(mod.ROLE_CAPABILITIES[k]), `missing ${k}`);
    assert.ok(
      mod.ROLE_CAPABILITIES[k].includes("super_admin"),
      `super_admin should have ${k}`,
    );
    // Owners must NOT see smart_lock or token surfaces.
    assert.ok(
      !mod.ROLE_CAPABILITIES[k].includes("investor_owner" as never),
      `${k}: owner must be excluded`,
    );
    assert.ok(
      !mod.ROLE_CAPABILITIES[k].includes("investor_viewer" as never),
      `${k}: viewer must be excluded`,
    );
  }
  // smart_lock specifically: owners + agents always excluded.
  for (const k of ["smart_lock.read", "smart_lock.manage"] as const) {
    for (const role of ["investor_owner", "investor_viewer", "agent"] as const) {
      assert.ok(
        !mod.ROLE_CAPABILITIES[k].includes(role as never),
        `${k}: ${role} must be excluded`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Token shape never leaks token_hash
// -----------------------------------------------------------------------------
test("GuestStayTokenRow shape never includes token_hash", async () => {
  // We can't run the DB-aware service without a DB. Instead we read the
  // exported interface fields by inspecting the source file shape.
  const src = readFileSync(
    join(repoRoot, "src/features/guest-stays/services.ts"),
    "utf8",
  );
  // The mapToken function (exported via the row interface) must NOT mention
  // tokenHash in the public shape.
  assert.ok(src.includes("export interface GuestStayTokenRow"));
  const ifaceMatch = src.match(
    /export interface GuestStayTokenRow \{([\s\S]*?)\n\}/,
  );
  assert.ok(ifaceMatch, "could not extract GuestStayTokenRow");
  assert.doesNotMatch(
    ifaceMatch![1],
    /tokenHash|token_hash/,
    "GuestStayTokenRow must not expose tokenHash",
  );
});

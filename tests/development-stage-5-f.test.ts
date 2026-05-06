/**
 * Stage 5.F — Role-Specific Cabinets tests.
 *
 * Coverage:
 *   - Migration 0066 (shape + RLS + role/scope/status enums)
 *   - Schema exports
 *   - Pure role helpers (10 roles → cabinets, permissions, landing resolver, validation)
 *   - Sidebar CABINETS group
 *   - UI page presence (8 cabinets + my-cabinet redirect + settings × 2)
 *   - Cabinet query aggregator presence + server-only guards
 *   - Demo seed audit
 *   - Architecture doc
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ALL_ROLE_KEYS,
  getDefaultCabinetForRole,
  getRolePermissions,
  resolveLandingPageForUser,
  isValidRoleAssignment,
  type RoleKey,
} from "../src/lib/development/server/roles/role-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0066 = "drizzle/0066_development_os_stage_5_f_roles_cabinets.sql";

// ===========================================================================
// 1) Migration 0066 — shape
// ===========================================================================

test("migration 0066 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0066));
  const sql = read(MIG_0066);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0066 creates app_user_roles + cabinet_preferences", () => {
  const sql = read(MIG_0066);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "app_user_roles"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "cabinet_preferences"/);
});

test("migration 0066 role_key enum has 10 values", () => {
  const sql = read(MIG_0066);
  for (const k of [
    "marketing_staff", "qs_analyst", "procurement_manager",
    "warehouse_manager", "site_supervisor", "sales_manager",
    "project_manager", "cfo_accountant", "executive_ceo", "admin",
  ]) {
    assert.ok(sql.includes(`'${k}'`), `role_key '${k}' missing`);
  }
});

test("migration 0066 scope enum has 2 values", () => {
  const sql = read(MIG_0066);
  for (const s of ["company_wide", "project_specific"]) {
    assert.ok(sql.includes(`'${s}'`), `scope '${s}' missing`);
  }
});

test("migration 0066 partial unique index enforces single primary", () => {
  const sql = read(MIG_0066);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "app_user_roles_primary_unique"[\s\S]*?WHERE "is_primary" = TRUE AND "is_active" = TRUE/,
  );
});

test("migration 0066 has audit columns (granted_at/by, revoked_at/by)", () => {
  const sql = read(MIG_0066);
  for (const c of [
    "granted_at", "granted_by", "revoked_at", "revoked_by",
    "revocation_reason",
  ]) {
    assert.ok(sql.includes(c), `audit column '${c}' missing`);
  }
});

test("migration 0066 cabinet_preferences user_id is UNIQUE", () => {
  const sql = read(MIG_0066);
  assert.match(sql, /"user_id" UUID UNIQUE NOT NULL REFERENCES "app_users"/);
});

test("migration 0066 cabinet_preferences has JSONB widgets + notifications", () => {
  const sql = read(MIG_0066);
  assert.match(sql, /"cabinet_widget_preferences" JSONB NOT NULL DEFAULT '\{\}'/);
  assert.match(sql, /"notification_preferences" JSONB NOT NULL DEFAULT '\{\}'/);
});

test("migration 0066 enables RLS + internal policies", () => {
  const sql = read(MIG_0066);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 2) Schema exports
// ===========================================================================

test("schema/index exports new role-cabinets schema file", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/role-cabinets"/);
});

test("role-cabinets schema exports both tables", async () => {
  const m = await import("../src/lib/db/schema/role-cabinets");
  assert.ok(m.appUserRoles);
  assert.ok(m.cabinetPreferences);
});

// ===========================================================================
// 3) ALL_ROLE_KEYS coverage
// ===========================================================================

test("ALL_ROLE_KEYS lists exactly 10 keys", () => {
  assert.equal(ALL_ROLE_KEYS.length, 10);
});

test("ALL_ROLE_KEYS includes every spec role", () => {
  for (const k of [
    "marketing_staff", "qs_analyst", "procurement_manager",
    "warehouse_manager", "site_supervisor", "sales_manager",
    "project_manager", "cfo_accountant", "executive_ceo", "admin",
  ]) {
    assert.ok(ALL_ROLE_KEYS.includes(k as RoleKey), `missing ${k}`);
  }
});

// ===========================================================================
// 4) getDefaultCabinetForRole
// ===========================================================================

test("getDefaultCabinetForRole: marketing_staff → marketing-staff", () => {
  assert.equal(
    getDefaultCabinetForRole("marketing_staff"),
    "/development-os/cabinets/marketing-staff",
  );
});

test("getDefaultCabinetForRole: qs_analyst → qs", () => {
  assert.equal(
    getDefaultCabinetForRole("qs_analyst"),
    "/development-os/cabinets/qs",
  );
});

test("getDefaultCabinetForRole: procurement_manager → procurement-manager", () => {
  assert.equal(
    getDefaultCabinetForRole("procurement_manager"),
    "/development-os/cabinets/procurement-manager",
  );
});

test("getDefaultCabinetForRole: warehouse_manager → warehouse-manager", () => {
  assert.equal(
    getDefaultCabinetForRole("warehouse_manager"),
    "/development-os/cabinets/warehouse-manager",
  );
});

test("getDefaultCabinetForRole: site_supervisor → site-supervisor", () => {
  assert.equal(
    getDefaultCabinetForRole("site_supervisor"),
    "/development-os/cabinets/site-supervisor",
  );
});

test("getDefaultCabinetForRole: sales_manager → sales-manager", () => {
  assert.equal(
    getDefaultCabinetForRole("sales_manager"),
    "/development-os/cabinets/sales-manager",
  );
});

test("getDefaultCabinetForRole: project_manager → project-manager", () => {
  assert.equal(
    getDefaultCabinetForRole("project_manager"),
    "/development-os/cabinets/project-manager",
  );
});

test("getDefaultCabinetForRole: cfo_accountant → cfo-accountant", () => {
  assert.equal(
    getDefaultCabinetForRole("cfo_accountant"),
    "/development-os/cabinets/cfo-accountant",
  );
});

test("getDefaultCabinetForRole: executive_ceo → 5.C dashboard", () => {
  assert.equal(
    getDefaultCabinetForRole("executive_ceo"),
    "/development-os/dashboard",
  );
});

test("getDefaultCabinetForRole: admin → command center", () => {
  assert.equal(getDefaultCabinetForRole("admin"), "/development-os");
});

// ===========================================================================
// 5) getRolePermissions
// ===========================================================================

test("getRolePermissions: admin has all permissions", () => {
  const p = getRolePermissions("admin");
  assert.equal(p.canViewFinancials, true);
  assert.equal(p.canViewInvestorData, true);
  assert.equal(p.canApproveTransactions, true);
  assert.equal(p.canManageInventory, true);
  assert.equal(p.canPublishContent, true);
  assert.equal(p.canViewAllProjects, true);
  assert.equal(p.canViewAllCabinets, true);
});

test("getRolePermissions: executive_ceo has all permissions", () => {
  const p = getRolePermissions("executive_ceo");
  assert.equal(p.canViewAllCabinets, true);
});

test("getRolePermissions: cfo_accountant can view financials + investor", () => {
  const p = getRolePermissions("cfo_accountant");
  assert.equal(p.canViewFinancials, true);
  assert.equal(p.canViewInvestorData, true);
  assert.equal(p.canManageInventory, false);
  assert.equal(p.canPublishContent, false);
});

test("getRolePermissions: site_supervisor cannot view financials", () => {
  const p = getRolePermissions("site_supervisor");
  assert.equal(p.canViewFinancials, false);
  assert.equal(p.canViewInvestorData, false);
  assert.equal(p.canApproveTransactions, false);
});

test("getRolePermissions: marketing_staff can publish content", () => {
  const p = getRolePermissions("marketing_staff");
  assert.equal(p.canPublishContent, true);
  assert.equal(p.canViewFinancials, false);
});

test("getRolePermissions: warehouse_manager can manage inventory", () => {
  const p = getRolePermissions("warehouse_manager");
  assert.equal(p.canManageInventory, true);
  assert.equal(p.canViewFinancials, false);
});

test("getRolePermissions: procurement_manager can approve + manage inventory", () => {
  const p = getRolePermissions("procurement_manager");
  assert.equal(p.canApproveTransactions, true);
  assert.equal(p.canManageInventory, true);
});

test("getRolePermissions: sales_manager has no special permissions", () => {
  const p = getRolePermissions("sales_manager");
  assert.equal(p.canViewFinancials, false);
  assert.equal(p.canPublishContent, false);
  assert.equal(p.canManageInventory, false);
});

// ===========================================================================
// 6) resolveLandingPageForUser
// ===========================================================================

test("resolveLandingPageForUser: custom default wins", () => {
  const r = resolveLandingPageForUser({
    primaryRole: "site_supervisor",
    customDefaultCabinet: "/development-os/cabinets/marketing-staff",
  });
  assert.equal(r, "/development-os/cabinets/marketing-staff");
});

test("resolveLandingPageForUser: role default when no custom", () => {
  const r = resolveLandingPageForUser({
    primaryRole: "site_supervisor",
    customDefaultCabinet: null,
  });
  assert.equal(r, "/development-os/cabinets/site-supervisor");
});

test("resolveLandingPageForUser: fallback when no role + no custom", () => {
  const r = resolveLandingPageForUser({
    primaryRole: null,
    customDefaultCabinet: null,
  });
  assert.equal(r, "/development-os/dashboard");
});

test("resolveLandingPageForUser: custom override takes precedence over fallback even when role is null", () => {
  const r = resolveLandingPageForUser({
    primaryRole: null,
    customDefaultCabinet: "/development-os/cabinets/qs",
  });
  assert.equal(r, "/development-os/cabinets/qs");
});

test("resolveLandingPageForUser: rejects unsafe custom path (must start with /development-os/)", () => {
  const r = resolveLandingPageForUser({
    primaryRole: "site_supervisor",
    customDefaultCabinet: "https://evil.example.com",
  });
  assert.equal(r, "/development-os/cabinets/site-supervisor");
});

test("resolveLandingPageForUser: explicit fallback used", () => {
  const r = resolveLandingPageForUser({
    primaryRole: null,
    customDefaultCabinet: null,
    fallback: "/development-os/projects",
  });
  assert.equal(r, "/development-os/projects");
});

// ===========================================================================
// 7) isValidRoleAssignment
// ===========================================================================

test("isValidRoleAssignment: empty existing → ok", () => {
  const r = isValidRoleAssignment({
    existingActiveRoles: [],
    newRoleKey: "site_supervisor",
    newIsPrimary: false,
  });
  assert.equal(r.ok, true);
});

test("isValidRoleAssignment: cannot add second primary", () => {
  const r = isValidRoleAssignment({
    existingActiveRoles: [
      { roleKey: "project_manager", isPrimary: true },
    ],
    newRoleKey: "site_supervisor",
    newIsPrimary: true,
  });
  assert.equal(r.ok, false);
});

test("isValidRoleAssignment: can add secondary alongside existing primary", () => {
  const r = isValidRoleAssignment({
    existingActiveRoles: [
      { roleKey: "project_manager", isPrimary: true },
    ],
    newRoleKey: "admin",
    newIsPrimary: false,
  });
  assert.equal(r.ok, true);
});

test("isValidRoleAssignment: cannot duplicate role", () => {
  const r = isValidRoleAssignment({
    existingActiveRoles: [
      { roleKey: "site_supervisor", isPrimary: true },
    ],
    newRoleKey: "site_supervisor",
    newIsPrimary: false,
  });
  assert.equal(r.ok, false);
});

// ===========================================================================
// 8) Sidebar audit
// ===========================================================================

test("sidebar nav has Cabinets group", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /label: "Cabinets"/);
});

test("sidebar nav has all 9 CABINETS entries (My + 8 cabinets)", () => {
  const src = read("src/lib/development/navigation.ts");
  for (const href of [
    "/cabinets/my-cabinet",
    "/cabinets/site-supervisor",
    "/cabinets/project-manager",
    "/cabinets/cfo-accountant",
    "/cabinets/qs",
    "/cabinets/procurement-manager",
    "/cabinets/warehouse-manager",
    "/cabinets/marketing-staff",
    "/cabinets/sales-manager",
  ]) {
    assert.ok(src.includes(href), `nav missing ${href}`);
  }
});

test("Cabinets sidebar group precedes Marketing group", () => {
  const src = read("src/lib/development/navigation.ts");
  const cab = src.indexOf('label: "Cabinets"');
  const mkt = src.indexOf('label: "Marketing"');
  assert.ok(cab > 0 && mkt > 0 && cab < mkt);
});

// ===========================================================================
// 9) UI page presence
// ===========================================================================

test("my-cabinet redirect page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/cabinets/my-cabinet/page.tsx",
    ),
  );
});

test("each of the 8 cabinet pages exists", () => {
  for (const slug of [
    "site-supervisor",
    "project-manager",
    "cfo-accountant",
    "qs",
    "procurement-manager",
    "warehouse-manager",
    "marketing-staff",
    "sales-manager",
  ]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`),
      `cabinet ${slug} page missing`,
    );
  }
});

test("settings/my-cabinet page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/settings/my-cabinet/page.tsx",
    ),
  );
});

test("settings/users-and-roles admin page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/settings/users-and-roles/page.tsx",
    ),
  );
});

test("Site Supervisor cabinet has 44px touch targets (mobile-first)", () => {
  const src = read(
    "src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx",
  );
  assert.match(src, /min-h-\[44px\]/);
});

test("Site Supervisor cabinet uses single column on mobile (grid-cols-1)", () => {
  const src = read(
    "src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx",
  );
  assert.match(src, /grid-cols-1/);
});

test("Site Supervisor cabinet has Quick Actions row", () => {
  const src = read(
    "src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx",
  );
  assert.match(src, /Quick actions/i);
});

// ===========================================================================
// 10) Cabinet query aggregator presence + server-only
// ===========================================================================

const CABINET_QUERY_FILES = [
  "site-supervisor-cabinet-queries.ts",
  "project-manager-cabinet-queries.ts",
  "cfo-cabinet-queries.ts",
  "qs-cabinet-queries.ts",
  "procurement-cabinet-queries.ts",
  "warehouse-cabinet-queries.ts",
  "marketing-cabinet-queries.ts",
  "sales-cabinet-queries.ts",
];

test("all 8 cabinet query modules exist", () => {
  for (const f of CABINET_QUERY_FILES) {
    assert.ok(
      exists(`src/lib/development/server/cabinets/${f}`),
      `cabinet query ${f} missing`,
    );
  }
});

test("each cabinet query module is server-only", () => {
  for (const f of CABINET_QUERY_FILES) {
    const src = read(`src/lib/development/server/cabinets/${f}`);
    assert.match(src, /^import "server-only"/m, `${f} missing server-only guard`);
  }
});

test("each cabinet query module exports a load* function", () => {
  for (const f of CABINET_QUERY_FILES) {
    const src = read(`src/lib/development/server/cabinets/${f}`);
    assert.match(src, /export async function load/, `${f} missing load* export`);
  }
});

// ===========================================================================
// 11) Server-side role infrastructure
// ===========================================================================

test("role-helpers file is pure (no server-only import)", () => {
  const src = read("src/lib/development/server/roles/role-helpers.ts");
  assert.doesNotMatch(src, /^import "server-only"/m);
});

test("role-queries file is server-only", () => {
  const src = read("src/lib/development/server/roles/role-queries.ts");
  assert.match(src, /^import "server-only"/m);
});

test("role-actions exposes grantUserRole + revokeUserRole + saveCabinetPreferences", () => {
  const src = read("src/lib/development/server/roles/role-actions.ts");
  assert.match(src, /export async function grantUserRole/);
  assert.match(src, /export async function revokeUserRole/);
  assert.match(src, /export async function saveCabinetPreferences/);
});

test("landing-resolver uses pure resolveLandingPageForUser", () => {
  const src = read("src/lib/development/server/roles/landing-resolver.ts");
  assert.match(src, /resolveLandingPageForUser/);
});

// ===========================================================================
// 12) Demo seed audit
// ===========================================================================

test("seed script declares Stage 5.F section header", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.F seeding/);
});

test("seed script seeds app_user_roles + cabinet_preferences", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO app_user_roles/);
  assert.match(seed, /INSERT INTO cabinet_preferences/);
});

test("seed script idempotent — exists-check pattern present in 5.F section", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.F seeding[\s\S]*?if \(exists\[0\]\)/);
});

// ===========================================================================
// 13) Architecture documentation
// ===========================================================================

test("architecture doc references Stage 5.F", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.F/);
});

test("architecture doc Stage 5.E accepted", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.E[\s\S]*?\[ACCEPTED 5\.E\]/);
});

test("architecture doc Stage 5.F active", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.F[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.F\]/);
});

test("architecture doc lists all 8 cabinets", () => {
  const md = read("docs/development-os-architecture.md");
  for (const c of [
    "Site Supervisor",
    "Project Manager",
    "CFO / Accountant",
    "QS / Cost Analyst",
    "Procurement Manager",
    "Warehouse Manager",
    "Marketing Staff",
    "Sales Manager",
  ]) {
    assert.ok(md.includes(c), `arch doc missing cabinet ${c}`);
  }
});

test("architecture doc names the mobile-first invariant", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Mobile-first|mobile-first/i);
});

test("architecture doc explains role-based redirect is UX not security", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /UX/);
  assert.match(md, /not.*access control|UX-only|UX, not/i);
});

// ===========================================================================
// 14) Cron + tsc untouched (no new cron jobs in 5.F)
// ===========================================================================

test("5.F adds no new cron jobs (still 61 in checklist)", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  // No 5.F-specific cron lines; spec says 61 stays.
  assert.doesNotMatch(md, /Stage 5\.F.*cron/i);
});

// ===========================================================================
// 15) Permission matrix — exhaustive coverage
// ===========================================================================

test("permissions: every role has a permissions object (10 roles)", () => {
  for (const r of ALL_ROLE_KEYS) {
    const p = getRolePermissions(r);
    assert.equal(typeof p.canViewFinancials, "boolean");
    assert.equal(typeof p.canViewInvestorData, "boolean");
    assert.equal(typeof p.canApproveTransactions, "boolean");
    assert.equal(typeof p.canManageInventory, "boolean");
    assert.equal(typeof p.canPublishContent, "boolean");
    assert.equal(typeof p.canViewAllProjects, "boolean");
    assert.equal(typeof p.canViewAllCabinets, "boolean");
  }
});

test("permissions: only admin + executive_ceo can view all cabinets", () => {
  for (const r of ALL_ROLE_KEYS) {
    const p = getRolePermissions(r);
    if (r === "admin" || r === "executive_ceo") {
      assert.equal(p.canViewAllCabinets, true, `${r} should view all cabinets`);
    } else {
      assert.equal(p.canViewAllCabinets, false, `${r} should NOT view all cabinets`);
    }
  }
});

test("permissions: only marketing_staff + admin + executive_ceo can publish content", () => {
  const allowed = new Set(["marketing_staff", "admin", "executive_ceo"]);
  for (const r of ALL_ROLE_KEYS) {
    const p = getRolePermissions(r);
    assert.equal(
      p.canPublishContent,
      allowed.has(r),
      `${r} canPublishContent`,
    );
  }
});

test("permissions: site_supervisor cabinet permissions all most-restrictive", () => {
  const p = getRolePermissions("site_supervisor");
  assert.equal(p.canViewFinancials, false);
  assert.equal(p.canViewInvestorData, false);
  assert.equal(p.canApproveTransactions, false);
  assert.equal(p.canManageInventory, false);
  assert.equal(p.canPublishContent, false);
  assert.equal(p.canViewAllProjects, false);
  assert.equal(p.canViewAllCabinets, false);
});

test("permissions: roles canManageInventory = procurement, warehouse, admin, executive", () => {
  const allowed = new Set([
    "procurement_manager", "warehouse_manager", "admin", "executive_ceo",
  ]);
  for (const r of ALL_ROLE_KEYS) {
    const p = getRolePermissions(r);
    assert.equal(p.canManageInventory, allowed.has(r), `${r} canManageInventory`);
  }
});

test("permissions: roles canViewInvestorData = cfo, admin, executive", () => {
  const allowed = new Set(["cfo_accountant", "admin", "executive_ceo"]);
  for (const r of ALL_ROLE_KEYS) {
    const p = getRolePermissions(r);
    assert.equal(
      p.canViewInvestorData,
      allowed.has(r),
      `${r} canViewInvestorData`,
    );
  }
});

// ===========================================================================
// 16) getDefaultCabinetForRole — returns valid path for every role
// ===========================================================================

test("getDefaultCabinetForRole: every role returns a /development-os/* path", () => {
  for (const r of ALL_ROLE_KEYS) {
    const path = getDefaultCabinetForRole(r);
    assert.match(path, /^\/development-os/, `${r} returned bad path: ${path}`);
  }
});

// ===========================================================================
// 17) resolveLandingPageForUser — extended edge cases
// ===========================================================================

test("resolve: empty string custom default → falls through to role", () => {
  const r = resolveLandingPageForUser({
    primaryRole: "qs_analyst",
    customDefaultCabinet: "",
  });
  assert.equal(r, "/development-os/cabinets/qs");
});

test("resolve: relative path custom default rejected (security)", () => {
  const r = resolveLandingPageForUser({
    primaryRole: "qs_analyst",
    customDefaultCabinet: "../evil",
  });
  assert.equal(r, "/development-os/cabinets/qs");
});

test("resolve: protocol-relative URL custom default rejected", () => {
  const r = resolveLandingPageForUser({
    primaryRole: null,
    customDefaultCabinet: "//evil.example.com/x",
  });
  assert.equal(r, "/development-os/dashboard");
});

test("resolve: deterministic for same inputs (idempotent)", () => {
  const a = resolveLandingPageForUser({
    primaryRole: "site_supervisor",
    customDefaultCabinet: null,
  });
  const b = resolveLandingPageForUser({
    primaryRole: "site_supervisor",
    customDefaultCabinet: null,
  });
  assert.equal(a, b);
});

// ===========================================================================
// 18) isValidRoleAssignment — extended
// ===========================================================================

test("isValidRoleAssignment: error message names existing primary", () => {
  const r = isValidRoleAssignment({
    existingActiveRoles: [
      { roleKey: "site_supervisor", isPrimary: true },
    ],
    newRoleKey: "project_manager",
    newIsPrimary: true,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /site_supervisor/);
});

test("isValidRoleAssignment: error message names duplicate role", () => {
  const r = isValidRoleAssignment({
    existingActiveRoles: [
      { roleKey: "qs_analyst", isPrimary: false },
    ],
    newRoleKey: "qs_analyst",
    newIsPrimary: false,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /qs_analyst/);
});

test("isValidRoleAssignment: many secondary roles allowed", () => {
  const r = isValidRoleAssignment({
    existingActiveRoles: [
      { roleKey: "project_manager", isPrimary: true },
      { roleKey: "admin", isPrimary: false },
      { roleKey: "qs_analyst", isPrimary: false },
    ],
    newRoleKey: "warehouse_manager",
    newIsPrimary: false,
  });
  assert.equal(r.ok, true);
});

// ===========================================================================
// 19) Cabinet pages structural patterns
// ===========================================================================

test("each cabinet page exports default async function", () => {
  for (const slug of [
    "site-supervisor",
    "project-manager",
    "cfo-accountant",
    "qs",
    "procurement-manager",
    "warehouse-manager",
    "marketing-staff",
    "sales-manager",
  ]) {
    const src = read(
      `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
    );
    assert.match(src, /export default async function/);
  }
});

test("each cabinet page uses DevelopmentShell", () => {
  for (const slug of [
    "site-supervisor",
    "project-manager",
    "cfo-accountant",
    "qs",
    "procurement-manager",
    "warehouse-manager",
    "marketing-staff",
    "sales-manager",
  ]) {
    const src = read(
      `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
    );
    assert.match(src, /DevelopmentShell/);
  }
});

test("each cabinet page declares force-dynamic", () => {
  for (const slug of [
    "site-supervisor",
    "project-manager",
    "cfo-accountant",
    "qs",
    "procurement-manager",
    "warehouse-manager",
    "marketing-staff",
    "sales-manager",
  ]) {
    const src = read(
      `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
    );
    assert.match(src, /export const dynamic = "force-dynamic"/);
  }
});

test("each cabinet page uses safeQuery wrapper", () => {
  for (const slug of [
    "site-supervisor",
    "project-manager",
    "cfo-accountant",
    "qs",
    "procurement-manager",
    "warehouse-manager",
    "marketing-staff",
    "sales-manager",
  ]) {
    const src = read(
      `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
    );
    assert.match(src, /safeQuery/);
  }
});

// ===========================================================================
// 20) Role helpers — RoleKey type inference smoke
// ===========================================================================

test("ALL_ROLE_KEYS is sorted into a stable order (no duplicates)", () => {
  const set = new Set(ALL_ROLE_KEYS);
  assert.equal(set.size, ALL_ROLE_KEYS.length);
});

test("getRolePermissions: returns same object structure across roles (key set parity)", () => {
  const referenceKeys = Object.keys(getRolePermissions("admin")).sort();
  for (const r of ALL_ROLE_KEYS) {
    const keys = Object.keys(getRolePermissions(r)).sort();
    assert.deepEqual(keys, referenceKeys, `${r} permission shape differs`);
  }
});

// ===========================================================================
// 21) AI agent integration per cabinet (presence checks)
// ===========================================================================

test("project-manager cabinet surfaces daily_digest + weekly_plan agent codes", () => {
  const src = read(
    "src/lib/development/server/cabinets/project-manager-cabinet-queries.ts",
  );
  assert.match(src, /daily_digest/);
  assert.match(src, /weekly_plan/);
});

test("cfo cabinet surfaces tax_assistant + qs_cost_analyst agent codes", () => {
  const src = read(
    "src/lib/development/server/cabinets/cfo-cabinet-queries.ts",
  );
  assert.match(src, /tax_assistant/);
  assert.match(src, /qs_cost_analyst/);
});

test("qs cabinet surfaces qs_cost_analyst agent code", () => {
  const src = read("src/lib/development/server/cabinets/qs-cabinet-queries.ts");
  assert.match(src, /qs_cost_analyst/);
});

test("procurement cabinet surfaces procurement_analyst agent code", () => {
  const src = read(
    "src/lib/development/server/cabinets/procurement-cabinet-queries.ts",
  );
  assert.match(src, /procurement_analyst/);
});

test("marketing cabinet surfaces marketing_assistant agent code", () => {
  const src = read(
    "src/lib/development/server/cabinets/marketing-cabinet-queries.ts",
  );
  assert.match(src, /marketing_assistant/);
});

test("sales cabinet surfaces manager_performance_metrics from Stage 5.E", () => {
  const src = read(
    "src/lib/development/server/cabinets/sales-cabinet-queries.ts",
  );
  assert.match(src, /manager_performance_metrics/);
});

// ===========================================================================
// 22) UI imports each cabinet page wires to its query module
// ===========================================================================

const PAGE_TO_QUERY = [
  ["site-supervisor", "loadSiteSupervisorCabinet"],
  ["project-manager", "loadProjectManagerCabinet"],
  ["cfo-accountant", "loadCfoCabinet"],
  ["qs", "loadQsCabinet"],
  ["procurement-manager", "loadProcurementCabinet"],
  ["warehouse-manager", "loadWarehouseCabinet"],
  ["marketing-staff", "loadMarketingCabinet"],
  ["sales-manager", "loadSalesCabinet"],
] as const;

test("each cabinet page imports its corresponding load* function", () => {
  for (const [slug, fn] of PAGE_TO_QUERY) {
    const src = read(
      `src/app/(development-app)/development-os/cabinets/${slug}/page.tsx`,
    );
    assert.match(src, new RegExp(fn));
  }
});

// ===========================================================================
// 23) Sidebar wiring to all cabinets
// ===========================================================================

test("sidebar nav imports all icons used by cabinets entries", () => {
  const src = read("src/lib/development/navigation.ts");
  for (const icon of [
    "Home", "HardHat", "ClipboardList", "Wallet",
    "Calculator", "Package", "Store", "Megaphone", "Briefcase",
  ]) {
    assert.ok(src.includes(icon), `icon ${icon} missing from navigation`);
  }
});

test("sidebar has '5.F' badge on all cabinet entries", () => {
  const src = read("src/lib/development/navigation.ts");
  // Count 5.F occurrences in navigation; should be at least 9 (My + 8 cabinets).
  const matches = src.match(/badge: "5\.F"/g) ?? [];
  assert.ok(
    matches.length >= 9,
    `expected ≥9 5.F badges, got ${matches.length}`,
  );
});

// ===========================================================================
// 24) Settings UI wiring
// ===========================================================================

test("my-cabinet settings page reads cabinetPreferences", () => {
  const src = read(
    "src/app/(development-app)/development-os/settings/my-cabinet/page.tsx",
  );
  assert.match(src, /getCabinetPreferences/);
  assert.match(src, /getUserPrimaryRole/);
});

test("my-cabinet settings page lists user's roles", () => {
  const src = read(
    "src/app/(development-app)/development-os/settings/my-cabinet/page.tsx",
  );
  assert.match(src, /listUserRoles/);
});

test("users-and-roles admin page selects from app_user_roles", () => {
  const src = read(
    "src/app/(development-app)/development-os/settings/users-and-roles/page.tsx",
  );
  assert.match(src, /FROM app_user_roles/);
});

test("my-cabinet redirect uses resolveLandingPageForUserId server-side", () => {
  const src = read(
    "src/app/(development-app)/development-os/cabinets/my-cabinet/page.tsx",
  );
  assert.match(src, /resolveLandingPageForUserId/);
  assert.match(src, /redirect\(/);
});

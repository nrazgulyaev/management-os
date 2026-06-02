import { test } from "node:test";
import assert from "node:assert/strict";

test("createGrantSchema validates required fields and grant_type enum", async () => {
  const { createGrantSchema } = await import("../src/features/access-grants/schema");
  const ok = createGrantSchema.safeParse({
    appUserId: "00000000-0000-0000-0000-000000000001",
    ownerId: "00000000-0000-0000-0000-000000000002",
    grantType: "owner_portal",
  });
  assert.equal(ok.success, true);

  const badType = createGrantSchema.safeParse({
    appUserId: "00000000-0000-0000-0000-000000000001",
    ownerId: "00000000-0000-0000-0000-000000000002",
    grantType: "root_admin",
  });
  assert.equal(badType.success, false);

  const missing = createGrantSchema.safeParse({});
  assert.equal(missing.success, false);
});

test("statementPdfFilename produces a stable Arconique-prefixed filename", async () => {
  const { statementPdfFilename } = await import("../src/features/finance/explanation");
  const fn = statementPdfFilename({
    id: "s",
    ownerId: "o",
    ownerName: "Owner",
    villaId: null,
    villaCode: null,
    projectId: null,
    projectName: null,
    periodId: "p",
    periodLabel: "March 2026",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    statementCode: "STM-EV07-MAR-x",
    managementModel: "individual",
    currency: "USD",
    grossRevenueMinor: 0n,
    totalFeesMinor: 0n,
    totalExpensesMinor: 0n,
    totalTaxesMinor: 0n,
    totalReservesMinor: 0n,
    managementFeeMinor: 0n,
    netPayoutMinor: 0n,
    occupancyRate: null,
    adrMinor: null,
    revparMinor: null,
    status: "issued",
    ownerState: "pending" as const,
    issuedAt: null,
    createdAt: new Date().toISOString(),
  });
  assert.equal(fn, "Arconique-Statement-STM-EV07-MAR-x.pdf");
});

test("generateStatementExplanation produces deterministic bullets for empty input", async () => {
  const { generateStatementExplanation } = await import("../src/features/finance/explanation");
  const stmt = {
    id: "s",
    ownerId: "o",
    ownerName: "Owner",
    villaId: null,
    villaCode: null,
    projectId: null,
    projectName: null,
    periodId: "p",
    periodLabel: "March 2026",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    statementCode: "STM-EV07-MAR-x",
    managementModel: "individual" as const,
    currency: "USD",
    grossRevenueMinor: 0n,
    totalFeesMinor: 0n,
    totalExpensesMinor: 0n,
    totalTaxesMinor: 0n,
    totalReservesMinor: 0n,
    managementFeeMinor: 0n,
    netPayoutMinor: 0n,
    occupancyRate: null,
    adrMinor: null,
    revparMinor: null,
    status: "issued" as const,
    ownerState: "pending" as const,
    issuedAt: null,
    createdAt: new Date().toISOString(),
  };
  const r = generateStatementExplanation(stmt, []);
  assert.match(r.headline, /Net owner payout for March 2026/);
  assert.ok(r.bullets.length >= 1);
  assert.match(r.footer, /Arconique Management OS/);
});

test("generateStatementExplanation reports negative payout as deficit", async () => {
  const { generateStatementExplanation } = await import("../src/features/finance/explanation");
  const stmt = {
    id: "s",
    ownerId: "o",
    ownerName: "Owner",
    villaId: null,
    villaCode: null,
    projectId: null,
    projectName: null,
    periodId: "p",
    periodLabel: "April 2026",
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    statementCode: "STM-X",
    managementModel: "individual" as const,
    currency: "USD",
    grossRevenueMinor: 1000n,
    totalFeesMinor: -500n,
    totalExpensesMinor: -3000n,
    totalTaxesMinor: 0n,
    totalReservesMinor: 0n,
    managementFeeMinor: 0n,
    netPayoutMinor: -2500n,
    occupancyRate: null,
    adrMinor: null,
    revparMinor: null,
    status: "issued" as const,
    ownerState: "pending" as const,
    issuedAt: null,
    createdAt: new Date().toISOString(),
  };
  const r = generateStatementExplanation(stmt, []);
  assert.match(r.headline, /deficit/);
});

test("permission matrix grants owner_access.* keys correctly", async () => {
  const { hasPermission } = await import("../src/features/auth/permission-matrix");
  const fm = {
    mode: "live" as const,
    appUser: { id: "u", email: "a@b", fullName: "A", status: "active", organizationId: "00000000-0000-0000-0000-000000000000" },
    roles: ["finance_manager" as const],
    isInternal: true,
    isSuperAdmin: false,
  };
  const pm = { ...fm, roles: ["property_manager" as const] };
  const owner = { ...fm, roles: ["investor_owner" as const], isInternal: false };
  assert.equal(hasPermission(fm, "owner_access.manage"), true);
  assert.equal(hasPermission(pm, "owner_access.read"), true);
  assert.equal(hasPermission(pm, "owner_access.manage"), false);
  assert.equal(hasPermission(owner, "owner_access.read"), false);
});

test("migration 0003 SQL contains current_owner_ids() and not the email-match fallback", async () => {
  const { readFile } = await import("node:fs/promises");
  const url = new URL("../drizzle/0003_statement_pdfs_owner_linkage_finance_polish.sql", import.meta.url);
  const sql = await readFile(url, "utf8");
  assert.match(sql, /current_owner_ids\(\)\s+RETURNS\s+SETOF\s+uuid/);
  assert.match(sql, /app_users_owners/);
  assert.match(sql, /CREATE OR REPLACE VIEW "v_reserve_balances"/);
  // No email join in v3.5 — current_owner_id() now uses app_users_owners.
  assert.doesNotMatch(sql, /JOIN app_users u ON lower\(u\.email\)/);
});

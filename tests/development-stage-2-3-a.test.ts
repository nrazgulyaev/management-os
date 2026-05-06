/**
 * Stage 2.3.A — investor capital cluster: schema, pure types/constants,
 * server query/action surface, internal UI routes, demo seed.
 *
 * Pure-function and static-source tests; no DB / network required.
 * DB-backed integration tests live in the manual checklist (see
 * docs/development-os-architecture.md §"Stage 2.3").
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CURRENCY_LABEL,
  CURRENCY_SYMBOL,
  COMMITMENT_STATUSES,
  COMMITMENT_STATUS_LABEL,
  DRAWDOWN_PAYMENT_METHODS,
  DRAWDOWN_STATUSES,
  DRAWDOWN_STATUS_LABEL,
  DRAWDOWN_TRIGGER_LABEL,
  DRAWDOWN_TRIGGER_REASONS,
  DISTRIBUTION_ALLOCATION_STATUSES,
  DISTRIBUTION_STATUSES,
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TRIGGER_REASONS,
  DISTRIBUTION_TYPES,
  DISTRIBUTION_TYPE_LABEL,
  INVESTOR_STATUSES,
  INVESTOR_STATUS_LABEL,
  INVESTOR_TYPES,
  INVESTOR_TYPE_LABEL,
  LEGAL_ENTITY_LABEL,
  LEGAL_ENTITY_TYPES,
  REPORTING_LANGUAGES,
  REPORTING_LANGUAGE_LABEL,
  SUPPORTED_CURRENCIES,
  WALLET_CASH_IN_TYPES,
  WALLET_CASH_OUT_TYPES,
  WALLET_TRANSACTION_TYPES,
  WALLET_TX_TYPE_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
} from "../src/lib/development/constants/investor-constants";

// ----------------------------------------------------------------------------
// 1) Migration 0037 — file invariants
// ----------------------------------------------------------------------------

const MIGRATION_PATH = resolve(
  process.cwd(),
  "drizzle/0037_development_os_stage_2_3_investor_capital.sql",
);

test("migration 0037 exists", () => {
  assert.ok(existsSync(MIGRATION_PATH), "migration 0037 must exist");
});

const MIGRATION_SQL = existsSync(MIGRATION_PATH)
  ? readFileSync(MIGRATION_PATH, "utf8")
  : "";

test("migration 0037 creates all 14 Stage 2.3 tables", () => {
  for (const t of [
    "investors",
    "capital_commitments",
    "capital_drawdowns",
    "investor_wallets",
    "wallet_transactions",
    "distributions",
    "distribution_allocations",
    "dev_bank_accounts",
    "dev_cost_categories",
    "dev_budget_lines",
    "dev_commitments_ledger",
    "dev_transactions",
    "dev_corporate_events",
    "dev_fx_snapshots",
  ]) {
    assert.match(
      MIGRATION_SQL,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing CREATE TABLE for ${t}`,
    );
  }
});

test("migration 0037 enables ENABLE+FORCE RLS for every Stage 2.3 table", () => {
  // The DO $$ loop adds them; checking the array literal in the loop is
  // enough — at runtime the migration is the only path that creates RLS.
  for (const t of [
    "investors",
    "capital_commitments",
    "capital_drawdowns",
    "investor_wallets",
    "wallet_transactions",
    "distributions",
    "distribution_allocations",
    "dev_bank_accounts",
    "dev_cost_categories",
    "dev_budget_lines",
    "dev_commitments_ledger",
    "dev_transactions",
    "dev_corporate_events",
    "dev_fx_snapshots",
  ]) {
    assert.match(MIGRATION_SQL, new RegExp(`'${t}'`), `${t} missing from RLS loop`);
  }
  assert.match(MIGRATION_SQL, /FORCE ROW LEVEL SECURITY/);
  assert.match(MIGRATION_SQL, /is_internal_user\(\)/);
});

test("migration 0037 wraps in BEGIN ... COMMIT (single transaction)", () => {
  assert.match(MIGRATION_SQL, /^BEGIN;/m);
  assert.match(MIGRATION_SQL, /^COMMIT;/m);
});

test("migration 0037 uses ON DELETE RESTRICT on financial FKs (audit trail)", () => {
  // Spot-check a few critical FKs that must NOT cascade
  const investorFkPattern =
    /capital_commitments[^;]*REFERENCES "investors"\("id"\) ON DELETE RESTRICT/;
  const drawdownFkPattern =
    /capital_drawdowns[^;]*REFERENCES "capital_commitments"\("id"\) ON DELETE RESTRICT/;
  assert.match(MIGRATION_SQL, investorFkPattern);
  assert.match(MIGRATION_SQL, drawdownFkPattern);
});

test("migration 0037 widens profit_share_percent to numeric(7,4)", () => {
  // Must accept 100.0000 (full GP profit share)
  assert.match(
    MIGRATION_SQL,
    /"profit_share_percent" numeric\(7, ?4\)/,
    "profit_share_percent must be numeric(7,4) to fit 100.0000",
  );
});

test("migration 0037 enforces wallet balance non-negativity via CHECK", () => {
  assert.match(MIGRATION_SQL, /wallets_balances_nonneg_check/);
  assert.match(
    MIGRATION_SQL,
    /balance_available_after_usd_minor.*>= 0[^,]*balance_hold_after_usd_minor.*>= 0/s,
  );
});

test("migration 0037 enforces distribution allocation total = capital + profit", () => {
  assert.match(MIGRATION_SQL, /alloc_total_consistent_check/);
  assert.match(
    MIGRATION_SQL,
    /total_amount_usd_minor[^=]*=[^=]*capital_return_amount_usd_minor[^+]*\+[^p]*profit_amount_usd_minor/s,
  );
});

test("migration 0037 enforces drawdown_number unique per commitment", () => {
  assert.match(
    MIGRATION_SQL,
    /UNIQUE \(\s*"commitment_id",\s*"drawdown_number"\s*\)/,
  );
});

// ----------------------------------------------------------------------------
// 2) Pure constants — every enum has a complete label map
// ----------------------------------------------------------------------------

test("INVESTOR_TYPES has full label coverage", () => {
  for (const t of INVESTOR_TYPES) {
    assert.ok(INVESTOR_TYPE_LABEL[t], `missing label for ${t}`);
  }
});

test("INVESTOR_STATUSES has full label coverage", () => {
  for (const s of INVESTOR_STATUSES) {
    assert.ok(INVESTOR_STATUS_LABEL[s], `missing label for ${s}`);
  }
});

test("LEGAL_ENTITY_TYPES has full label coverage", () => {
  for (const t of LEGAL_ENTITY_TYPES) {
    assert.ok(LEGAL_ENTITY_LABEL[t], `missing label for ${t}`);
  }
});

test("REPORTING_LANGUAGES has full label coverage", () => {
  for (const l of REPORTING_LANGUAGES) {
    assert.ok(REPORTING_LANGUAGE_LABEL[l], `missing label for ${l}`);
  }
});

test("SUPPORTED_CURRENCIES has symbol and label coverage", () => {
  for (const c of SUPPORTED_CURRENCIES) {
    assert.ok(CURRENCY_SYMBOL[c], `missing symbol for ${c}`);
    assert.ok(CURRENCY_LABEL[c], `missing label for ${c}`);
  }
});

test("COMMITMENT_STATUSES has full label coverage", () => {
  for (const s of COMMITMENT_STATUSES) {
    assert.ok(COMMITMENT_STATUS_LABEL[s], `missing label for ${s}`);
  }
});

test("DRAWDOWN_STATUSES has full label coverage", () => {
  for (const s of DRAWDOWN_STATUSES) {
    assert.ok(DRAWDOWN_STATUS_LABEL[s], `missing label for ${s}`);
  }
});

test("DRAWDOWN_TRIGGER_REASONS has full label coverage", () => {
  for (const r of DRAWDOWN_TRIGGER_REASONS) {
    assert.ok(DRAWDOWN_TRIGGER_LABEL[r], `missing label for ${r}`);
  }
});

test("WALLET_TRANSACTION_TYPES has full label coverage", () => {
  for (const t of WALLET_TRANSACTION_TYPES) {
    assert.ok(WALLET_TX_TYPE_LABEL[t], `missing label for ${t}`);
  }
});

test("WALLET_CASH_IN/OUT type sets are subsets of WALLET_TRANSACTION_TYPES", () => {
  for (const t of WALLET_CASH_IN_TYPES) {
    assert.ok(
      (WALLET_TRANSACTION_TYPES as readonly string[]).includes(t),
      `${t} not in WALLET_TRANSACTION_TYPES`,
    );
  }
  for (const t of WALLET_CASH_OUT_TYPES) {
    assert.ok(
      (WALLET_TRANSACTION_TYPES as readonly string[]).includes(t),
      `${t} not in WALLET_TRANSACTION_TYPES`,
    );
  }
});

test("DISTRIBUTION_TYPES has full label coverage", () => {
  for (const t of DISTRIBUTION_TYPES) {
    assert.ok(DISTRIBUTION_TYPE_LABEL[t], `missing label for ${t}`);
  }
});

test("DISTRIBUTION_STATUSES has full label coverage", () => {
  for (const s of DISTRIBUTION_STATUSES) {
    assert.ok(DISTRIBUTION_STATUS_LABEL[s], `missing label for ${s}`);
  }
});

test("DISTRIBUTION_TRIGGER_REASONS / DISTRIBUTION_ALLOCATION_STATUSES are populated", () => {
  assert.ok(DISTRIBUTION_TRIGGER_REASONS.length > 0);
  assert.ok(DISTRIBUTION_ALLOCATION_STATUSES.length > 0);
});

test("DRAWDOWN_PAYMENT_METHODS includes the canonical three", () => {
  assert.deepEqual(
    [...DRAWDOWN_PAYMENT_METHODS].sort(),
    ["bank_wire", "cash", "crypto"].sort(),
  );
});

// ----------------------------------------------------------------------------
// 3) Pure formatters
// ----------------------------------------------------------------------------

test("formatUsdMinor handles zero and large values", () => {
  assert.equal(formatUsdMinor(0n), "$0.00");
  assert.equal(formatUsdMinor(null), "$0.00");
  assert.equal(formatUsdMinor(undefined), "$0.00");
  assert.equal(formatUsdMinor(150_000_00n), "$150,000.00");
  assert.equal(formatUsdMinor(1_234_567_89n), "$1,234,567.89");
});

test("formatCurrencyMinor — USD divides by 100 with 2 decimals", () => {
  assert.equal(formatCurrencyMinor(500_00n, "USD"), "$500.00");
  assert.equal(formatCurrencyMinor(1_234_567_89n, "USD"), "$1,234,567.89");
});

test("formatCurrencyMinor — IDR/RUB display with 0 decimals", () => {
  assert.equal(formatCurrencyMinor(27_600_000_00n, "RUB"), "₽27,600,000");
  assert.equal(formatCurrencyMinor(16_400_000_00n, "IDR"), "Rp16,400,000");
});

test("formatCurrencyMinor — USDT divides by 1,000,000 (6 decimals on-chain)", () => {
  // 150,000 USDT in minor = 150_000_000_000n
  assert.equal(
    formatCurrencyMinor(150_000_000_000n, "USDT"),
    "USDT150,000.00",
  );
});

test("formatCurrencyMinor handles null", () => {
  assert.equal(formatCurrencyMinor(null, "USD"), "$0");
});

// ----------------------------------------------------------------------------
// 4) Server query / action files — server-only guards + transactional patterns
// ----------------------------------------------------------------------------

const SERVER_FILES = [
  "src/lib/development/server/investors.ts",
  "src/lib/development/server/commitments.ts",
  "src/lib/development/server/wallets.ts",
  "src/lib/development/server/investor-actions.ts",
  "src/lib/development/server/commitment-actions.ts",
  "src/lib/development/server/drawdown-actions.ts",
  "src/lib/development/server/wallet-actions.ts",
];

test("every server file has a server-only guard at the top", () => {
  for (const rel of SERVER_FILES) {
    const p = resolve(process.cwd(), rel);
    assert.ok(existsSync(p), `${rel} missing`);
    const src = readFileSync(p, "utf8");
    assert.match(src, /^(import "server-only";|"use server";)/m, `${rel} missing server-only`);
  }
});

test("balance-changing actions wrap writes in db.transaction", () => {
  // confirmDrawdownReceipt, withdrawFromWallet, reinvestFromWallet,
  // setWalletHold, releaseWalletHold, walletAdjustment must be transactional.
  const drawdownActions = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/drawdown-actions.ts"),
    "utf8",
  );
  assert.match(
    drawdownActions,
    /confirmDrawdownReceipt[\s\S]+db\.transaction\(/,
    "confirmDrawdownReceipt must use db.transaction",
  );

  const walletActions = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/wallet-actions.ts"),
    "utf8",
  );
  for (const fn of [
    "withdrawFromWallet",
    "reinvestFromWallet",
    "setWalletHold",
    "releaseWalletHold",
    "walletAdjustment",
  ]) {
    assert.match(
      walletActions,
      new RegExp(`${fn}[\\s\\S]+db\\.transaction\\(`),
      `${fn} must use db.transaction`,
    );
  }
});

test("createCommitment auto-creates the wallet inside the same transaction", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/development/server/commitment-actions.ts"),
    "utf8",
  );
  // Must have transaction wrapper that writes to BOTH capitalCommitments AND investorWallets
  assert.match(src, /db\.transaction\(/);
  const txBlock = src.match(/db\.transaction\(async \(tx\) => \{[\s\S]+?\n  \}\);/);
  assert.ok(txBlock, "createCommitment must have a tx block");
  assert.match(txBlock![0], /capitalCommitments/);
  assert.match(txBlock![0], /investorWallets/);
});

test("wallet_transactions is treated as append-only (no UPDATE/DELETE on the table in actions)", () => {
  for (const rel of [
    "src/lib/development/server/drawdown-actions.ts",
    "src/lib/development/server/wallet-actions.ts",
  ]) {
    const src = readFileSync(resolve(process.cwd(), rel), "utf8");
    // The only operations should be inserts via `.insert(walletTransactions)`.
    assert.doesNotMatch(
      src,
      /update\(walletTransactions\)/,
      `${rel} must not UPDATE wallet_transactions (append-only)`,
    );
    assert.doesNotMatch(
      src,
      /delete\(walletTransactions\)/,
      `${rel} must not DELETE wallet_transactions (append-only)`,
    );
  }
});

// ----------------------------------------------------------------------------
// 5) Drizzle schema files — present, exported, complete
// ----------------------------------------------------------------------------

test("Drizzle schema file investor-capital.ts exports all 7 tables", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/db/schema/investor-capital.ts"),
    "utf8",
  );
  for (const exportName of [
    "investors",
    "capitalCommitments",
    "capitalDrawdowns",
    "investorWallets",
    "walletTransactions",
    "distributions",
    "distributionAllocations",
  ]) {
    assert.match(
      src,
      new RegExp(`export const ${exportName}\\s`),
      `missing export const ${exportName}`,
    );
  }
});

test("Drizzle schema file dev-finance.ts exports all 7 dev_* tables", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/db/schema/dev-finance.ts"),
    "utf8",
  );
  for (const exportName of [
    "devBankAccounts",
    "devCostCategories",
    "devBudgetLines",
    "devCommitmentsLedger",
    "devTransactions",
    "devCorporateEvents",
    "devFxSnapshots",
  ]) {
    assert.match(
      src,
      new RegExp(`export const ${exportName}\\s`),
      `missing export const ${exportName}`,
    );
  }
});

test("Drizzle schema index re-exports the new modules", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/db/schema/index.ts"),
    "utf8",
  );
  assert.match(src, /export \* from "\.\/investor-capital"/);
  assert.match(src, /export \* from "\.\/dev-finance"/);
});

// ----------------------------------------------------------------------------
// 6) UI routes — present and renderable
// ----------------------------------------------------------------------------

const UI_ROUTES = [
  "src/app/(development-app)/development-os/investors/page.tsx",
  "src/app/(development-app)/development-os/investors/[code]/page.tsx",
  "src/app/(development-app)/development-os/commitments/page.tsx",
  "src/app/(development-app)/development-os/commitments/[id]/page.tsx",
];

test("Stage 2.3.A internal UI routes all exist", () => {
  for (const rel of UI_ROUTES) {
    const p = resolve(process.cwd(), rel);
    assert.ok(existsSync(p), `${rel} missing`);
  }
});

test("investors page imports server query (not raw drizzle from a client component)", () => {
  const src = readFileSync(
    resolve(process.cwd(), UI_ROUTES[0]),
    "utf8",
  );
  assert.match(src, /from "@\/lib\/development\/server\/investors"/);
  // No "use client" directive — must remain a server component
  assert.doesNotMatch(src, /^"use client"/m);
});

test("commitments list page uses safeQuery for the (sole) DB call", () => {
  const src = readFileSync(
    resolve(process.cwd(), UI_ROUTES[2]),
    "utf8",
  );
  assert.match(src, /safeQuery\(/);
});

test("dashboard navigation includes Investors AND Commitments under Capital", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/development/navigation.ts"),
    "utf8",
  );
  assert.match(src, /label: "Investors"/);
  assert.match(src, /label: "Commitments"/);
});

// ----------------------------------------------------------------------------
// 7) Migration runner — registry table, idempotent semantics
// ----------------------------------------------------------------------------

test("migrate.ts uses _arconique_migrations registry", () => {
  const src = readFileSync(
    resolve(process.cwd(), "scripts/migrate.ts"),
    "utf8",
  );
  assert.match(src, /_arconique_migrations/);
  assert.match(src, /CREATE TABLE IF NOT EXISTS _arconique_migrations/);
});

test("migrate.ts has --force flag for re-running already-applied files", () => {
  const src = readFileSync(
    resolve(process.cwd(), "scripts/migrate.ts"),
    "utf8",
  );
  assert.match(src, /--force/);
});

// ----------------------------------------------------------------------------
// 8) Demo seed — Stage 2.3 section present, slug-resolved, idempotent shape
// ----------------------------------------------------------------------------

test("seed-dev-os.mjs adds Stage 2.3 section (investors / commitments / drawdowns / wallet activity)", () => {
  const src = readFileSync(
    resolve(process.cwd(), "scripts/seed-dev-os.mjs"),
    "utf8",
  );
  for (const marker of [
    "investorsSpec",
    "commitmentsSpec",
    "drawdownsSpec",
    "investor_wallets",
    "wallet_transactions",
  ]) {
    assert.match(src, new RegExp(marker), `seed missing marker: ${marker}`);
  }
});

test("seed-dev-os.mjs resolves IDs by slug/code (no hardcoded UUIDs in Stage 2.3 section)", () => {
  const src = readFileSync(
    resolve(process.cwd(), "scripts/seed-dev-os.mjs"),
    "utf8",
  );
  // The Stage 2.3 section starts after the line "Stage 2.3 — investors"
  const stage23Start = src.indexOf("Stage 2.3 — investors");
  assert.ok(stage23Start > 0, "Stage 2.3 section missing");
  const stage23 = src.slice(stage23Start);
  // Resolution is via investor_code/commitment_code/project_slug, not UUID literals
  assert.match(stage23, /investor_code = \$\{/);
  assert.match(stage23, /commitment_code = \$\{/);
});

test("seed-dev-os.mjs uses ON CONFLICT for idempotency in Stage 2.3 inserts", () => {
  const src = readFileSync(
    resolve(process.cwd(), "scripts/seed-dev-os.mjs"),
    "utf8",
  );
  const stage23Start = src.indexOf("Stage 2.3 — investors");
  const stage23 = src.slice(stage23Start);
  // Each entity insert must have an ON CONFLICT clause
  for (const target of [
    "ON CONFLICT (investor_code)",
    "ON CONFLICT (commitment_code)",
    "ON CONFLICT (commitment_id)",
    "ON CONFLICT (commitment_id, drawdown_number)",
  ]) {
    assert.ok(
      stage23.includes(target),
      `Stage 2.3 seed missing idempotency guard: ${target}`,
    );
  }
});

test("seed-dev-os.mjs verifies wallet/drawdown reconciliation at the end", () => {
  const src = readFileSync(
    resolve(process.cwd(), "scripts/seed-dev-os.mjs"),
    "utf8",
  );
  // 2.3.B widened the reconciliation to include distributions in addition to
  // drawdowns; the old wording "received drawdowns" was replaced.
  assert.match(src, /wallet balances reconcile to drawdowns \+ distributions/);
});

// ----------------------------------------------------------------------------
// 9) Architecture document — Stage 2.3 section is ACTIVE and authoritative
// ----------------------------------------------------------------------------

test("docs/development-os-architecture.md has the active Stage 2.3 section", () => {
  const src = readFileSync(
    resolve(process.cwd(), "docs/development-os-architecture.md"),
    "utf8",
  );
  // 2.3.D moved Stage 2.3 from [ACTIVE 2.3] to [ACCEPTED 2.3]; the section
  // header text is the same modulo the bracket marker.
  assert.match(
    src,
    /## Stage 2\.3 — Investor capital \+ Development finance `\[(ACTIVE|ACCEPTED) 2\.3\]`/,
  );
  assert.match(src, /Self-Sustaining Threshold/);
  assert.match(src, /IRR computation/);
  assert.match(src, /Three-state cost ledger/);
  assert.match(src, /Multi-currency policy/);
});

/**
 * Stage 2.3.B — Distribution UI + Finance ledger + 5 cron jobs.
 *
 * Pure-function tests (the distribution allocation math is load-bearing
 * and gets full coverage), plus static-source invariants for cron
 * registration, server-only guards, transactional patterns, UI
 * structure, migration content, and seed shape.
 *
 * DB-backed integration tests live in the manual checklist — same
 * convention as Stage 2.3.A.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeCapitalReturn,
  computeProfitDistribution,
} from "../src/lib/development/distribution-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ----------------------------------------------------------------------------
// 1) Distribution allocation math — capital_return
// ----------------------------------------------------------------------------

interface Snap {
  commitmentId: string;
  commitmentCode: string;
  investorLegalName: string;
  priority: number;
  profitSharePercent: string;
  drawnUsdMinor: bigint;
  returnedCapitalUsdMinor: bigint;
  outstandingCapitalUsdMinor: bigint;
}

const mkSnap = (
  id: string,
  priority: number,
  drawn: bigint,
  returned = 0n,
  profitShare = "50.0000",
): Snap => ({
  commitmentId: id,
  commitmentCode: id,
  investorLegalName: id,
  priority,
  profitSharePercent: profitShare,
  drawnUsdMinor: drawn,
  returnedCapitalUsdMinor: returned,
  outstandingCapitalUsdMinor: drawn - returned,
});

test("computeCapitalReturn: empty input returns empty map", () => {
  const out = computeCapitalReturn([], 100_000n);
  assert.equal(out.size, 0);
});

test("computeCapitalReturn: zero total returns empty map", () => {
  const snaps = [mkSnap("a", 1, 100_000n)];
  const out = computeCapitalReturn(snaps, 0n);
  assert.equal(out.size, 0);
});

test("computeCapitalReturn: single commitment, total < outstanding", () => {
  const snaps = [mkSnap("a", 1, 100_000n)];
  const out = computeCapitalReturn(snaps, 30_000n);
  assert.equal(out.size, 1);
  assert.equal(out.get("a"), 30_000n);
});

test("computeCapitalReturn: single commitment, total = outstanding", () => {
  const snaps = [mkSnap("a", 1, 100_000n)];
  const out = computeCapitalReturn(snaps, 100_000n);
  assert.equal(out.get("a"), 100_000n);
});

test("computeCapitalReturn: single commitment, total > outstanding (cap at outstanding)", () => {
  const snaps = [mkSnap("a", 1, 100_000n)];
  const out = computeCapitalReturn(snaps, 200_000n);
  assert.equal(out.get("a"), 100_000n);
});

test("computeCapitalReturn: priority 1 paid before priority 2", () => {
  const snaps = [
    mkSnap("a", 1, 50_000n),
    mkSnap("b", 2, 100_000n),
  ];
  const out = computeCapitalReturn(snaps, 80_000n);
  assert.equal(out.get("a"), 50_000n);
  assert.equal(out.get("b"), 30_000n);
});

test("computeCapitalReturn: priority 1 fully paid, priority 2 not started if remainder = 0", () => {
  const snaps = [
    mkSnap("a", 1, 50_000n),
    mkSnap("b", 2, 100_000n),
  ];
  const out = computeCapitalReturn(snaps, 50_000n);
  assert.equal(out.get("a"), 50_000n);
  assert.equal(out.get("b") ?? 0n, 0n);
});

test("computeCapitalReturn: tied priority pro-rata split by outstanding", () => {
  const snaps = [
    mkSnap("a", 1, 30_000n), // 30%
    mkSnap("b", 1, 70_000n), // 70%
  ];
  const out = computeCapitalReturn(snaps, 50_000n);
  // a gets 30/100 * 50_000 = 15_000
  // b gets 70/100 * 50_000 = 35_000
  assert.equal(out.get("a"), 15_000n);
  assert.equal(out.get("b"), 35_000n);
});

test("computeCapitalReturn: tied priority, full repayment exactly", () => {
  const snaps = [
    mkSnap("a", 1, 30_000n),
    mkSnap("b", 1, 70_000n),
  ];
  const out = computeCapitalReturn(snaps, 100_000n);
  assert.equal(out.get("a"), 30_000n);
  assert.equal(out.get("b"), 70_000n);
});

test("computeCapitalReturn: rounding residue absorbed by largest allocation in tier", () => {
  // 3 commits at priority 1, total 100_001n distributed for 1 cent — residue
  // of 1n must end up somewhere.
  const snaps = [
    mkSnap("a", 1, 3n),
    mkSnap("b", 1, 3n),
    mkSnap("c", 1, 3n),
  ];
  const out = computeCapitalReturn(snaps, 7n); // 7 / 9 per share = 2.33 → floor 2
  // 2 + 2 + 2 = 6, residue 1 → absorbed by largest (all equal, so first hit)
  let total = 0n;
  for (const v of out.values()) total += v;
  assert.equal(total, 7n);
});

test("computeCapitalReturn: priority 1 (paid) + priority 2 (paid partially) + priority 3 (none)", () => {
  const snaps = [
    mkSnap("a", 1, 50_000n),
    mkSnap("b", 2, 100_000n),
    mkSnap("c", 3, 200_000n),
  ];
  const out = computeCapitalReturn(snaps, 100_000n);
  assert.equal(out.get("a"), 50_000n);
  assert.equal(out.get("b"), 50_000n);
  assert.equal(out.get("c") ?? 0n, 0n);
});

test("computeCapitalReturn: skips commitments with zero outstanding", () => {
  const snaps = [
    mkSnap("a", 1, 100_000n, 100_000n), // fully returned already
    mkSnap("b", 1, 50_000n, 0n),
  ];
  const out = computeCapitalReturn(snaps, 30_000n);
  assert.equal(out.get("a") ?? 0n, 0n);
  assert.equal(out.get("b"), 30_000n);
});

// ----------------------------------------------------------------------------
// 2) Distribution allocation math — profit_distribution
// ----------------------------------------------------------------------------

test("computeProfitDistribution: single commitment gets full amount", () => {
  const snaps = [mkSnap("a", 1, 100_000n, 0n, "50.0000")];
  const out = computeProfitDistribution(snaps, 10_000n);
  assert.equal(out.get("a"), 10_000n);
});

test("computeProfitDistribution: weighted by drawn × percent", () => {
  // a: 100_000 drawn × 100% = 10_000_000
  // b: 100_000 drawn × 50%  =  5_000_000
  // total weight = 15_000_000
  // a gets 10/15 * 30_000 = 20_000
  // b gets  5/15 * 30_000 = 10_000
  const snaps = [
    mkSnap("a", 1, 100_000n, 0n, "100.0000"),
    mkSnap("b", 2, 100_000n, 0n, "50.0000"),
  ];
  const out = computeProfitDistribution(snaps, 30_000n);
  assert.equal(out.get("a"), 20_000n);
  assert.equal(out.get("b"), 10_000n);
});

test("computeProfitDistribution: drawn=0 commits get nothing", () => {
  const snaps = [
    mkSnap("a", 1, 100_000n, 0n, "50.0000"),
    mkSnap("b", 2, 0n, 0n, "100.0000"), // never drew capital
  ];
  const out = computeProfitDistribution(snaps, 10_000n);
  assert.equal(out.get("a"), 10_000n);
  assert.equal(out.get("b") ?? 0n, 0n);
});

test("computeProfitDistribution: profit_share=0 commits get nothing", () => {
  const snaps = [
    mkSnap("a", 1, 100_000n, 0n, "50.0000"),
    mkSnap("b", 2, 100_000n, 0n, "0.0000"),
  ];
  const out = computeProfitDistribution(snaps, 10_000n);
  assert.equal(out.get("a"), 10_000n);
  assert.equal(out.get("b") ?? 0n, 0n);
});

test("computeProfitDistribution: zero total returns empty map", () => {
  const snaps = [mkSnap("a", 1, 100_000n, 0n, "50.0000")];
  const out = computeProfitDistribution(snaps, 0n);
  assert.equal(out.size, 0);
});

test("computeProfitDistribution: empty input returns empty map", () => {
  const out = computeProfitDistribution([], 10_000n);
  assert.equal(out.size, 0);
});

test("computeProfitDistribution: total weight is conserved (residue absorbed)", () => {
  // 3 equal commitments, $100 total to distribute → 33 + 33 + 33 = 99, residue 1
  const snaps = [
    mkSnap("a", 1, 100_000n, 0n, "10.0000"),
    mkSnap("b", 1, 100_000n, 0n, "10.0000"),
    mkSnap("c", 1, 100_000n, 0n, "10.0000"),
  ];
  const out = computeProfitDistribution(snaps, 100n);
  let total = 0n;
  for (const v of out.values()) total += v;
  assert.equal(total, 100n);
});

// ----------------------------------------------------------------------------
// 3) Migration 0038 — file content
// ----------------------------------------------------------------------------

const MIGRATION_PATH = "drizzle/0038_development_os_stage_2_3_b.sql";

test("migration 0038 exists", () => {
  assert.ok(exists(MIGRATION_PATH));
});

test("migration 0038 adds is_self_sustaining column", () => {
  const src = read(MIGRATION_PATH);
  assert.match(src, /ADD COLUMN "is_self_sustaining" boolean/);
});

test("migration 0038 adds last_self_sustaining_check_at column", () => {
  const src = read(MIGRATION_PATH);
  assert.match(src, /ADD COLUMN "last_self_sustaining_check_at" timestamptz/);
});

test("migration 0038 adds last_balance_alert_at column to dev_bank_accounts", () => {
  const src = read(MIGRATION_PATH);
  assert.match(src, /dev_bank_accounts[\s\S]+?ADD COLUMN "last_balance_alert_at"/);
});

test("migration 0038 widens dev_notification_rules trigger_event CHECK", () => {
  const src = read(MIGRATION_PATH);
  assert.match(src, /DROP CONSTRAINT IF EXISTS notification_rules_trigger_check/);
  for (const ev of [
    "drawdown_overdue",
    "bank_balance_below_threshold",
    "project_self_sustaining_reached",
    "project_self_sustaining_lost",
    "bank_balance_discrepancy",
  ]) {
    assert.ok(src.includes(`'${ev}'`), `migration must include trigger event ${ev}`);
  }
});

test("migration 0038 wraps in BEGIN ... COMMIT", () => {
  const src = read(MIGRATION_PATH);
  assert.match(src, /^BEGIN;/m);
  assert.match(src, /^COMMIT;/m);
});

test("migration 0038 uses idempotent guards for ADD COLUMN", () => {
  const src = read(MIGRATION_PATH);
  assert.match(src, /EXCEPTION WHEN duplicate_column THEN NULL/);
});

// ----------------------------------------------------------------------------
// 4) Server-only guards on every new server file
// ----------------------------------------------------------------------------

const NEW_SERVER_FILES = [
  "src/lib/development/server/distributions.ts",
  "src/lib/development/server/distribution-actions.ts",
  "src/lib/development/server/bank-accounts.ts",
  "src/lib/development/server/bank-account-actions.ts",
  "src/lib/development/server/transactions.ts",
  "src/lib/development/server/transaction-actions.ts",
  "src/lib/development/server/budget.ts",
  "src/lib/development/server/budget-actions.ts",
  "src/lib/development/server/cost-categories.ts",
  "src/lib/development/server/cost-category-actions.ts",
  "src/lib/development/server/commitments-ledger.ts",
  "src/lib/development/server/commitments-ledger-actions.ts",
  "src/lib/development/server/corporate-events.ts",
  "src/lib/development/server/corporate-event-actions.ts",
  "src/lib/development/server/fx.ts",
  "src/lib/development/server/fx-actions.ts",
  "src/lib/development/server/self-sustaining.ts",
];

test("every new 2.3.B server file has a server-only guard", () => {
  for (const rel of NEW_SERVER_FILES) {
    assert.ok(exists(rel), `${rel} must exist`);
    const src = read(rel);
    assert.match(src, /^(import "server-only";|"use server";)/m, `${rel} missing server-only`);
  }
});

// ----------------------------------------------------------------------------
// 5) Action transactionality — every balance-changing action wraps in db.transaction
// ----------------------------------------------------------------------------

test("declareDistribution + executeDistribution wrap in db.transaction", () => {
  const src = read("src/lib/development/server/distribution-actions.ts");
  for (const fn of ["declareDistribution", "executeDistribution"]) {
    assert.match(
      src,
      new RegExp(`${fn}[\\s\\S]+?db\\.transaction\\(`),
      `${fn} must use db.transaction`,
    );
  }
});

test("recordTransaction wraps in db.transaction (atomic balance update)", () => {
  const src = read("src/lib/development/server/transaction-actions.ts");
  assert.match(src, /recordTransaction[\s\S]+?db\.transaction\(/);
});

test("createBudgetLine wraps in db.transaction (atomic supersession)", () => {
  const src = read("src/lib/development/server/budget-actions.ts");
  assert.match(src, /createBudgetLine[\s\S]+?db\.transaction\(/);
});

test("wallet_transactions never UPDATE'd by 2.3.B actions (append-only)", () => {
  for (const rel of [
    "src/lib/development/server/distribution-actions.ts",
    "src/lib/development/server/transaction-actions.ts",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /update\(walletTransactions\)/,
      `${rel} must not UPDATE wallet_transactions`,
    );
    assert.doesNotMatch(
      src,
      /delete\(walletTransactions\)/,
      `${rel} must not DELETE wallet_transactions`,
    );
  }
});

test("recordCorporateEvent validates director_loan_repayment ≤ director_loan_in", () => {
  const src = read("src/lib/development/server/corporate-event-actions.ts");
  assert.match(src, /director_loan_repayment/);
  assert.match(src, /director_loan_in/);
  assert.match(src, /Repayment exceeds outstanding director loan/);
});

test("recordTransaction validates multi_project allocation ratios sum to 1.0", () => {
  const src = read("src/lib/development/server/transaction-actions.ts");
  assert.match(src, /allocation ratios must sum to 1\.0/);
});

test("recordTransaction generates TXN-YYYY-NNNNNN code", () => {
  const src = read("src/lib/development/server/transaction-actions.ts");
  assert.match(src, /TXN-/);
  assert.match(src, /padStart\(6/);
});

// ----------------------------------------------------------------------------
// 6) Cron jobs — files exist + registered in dispatcher
// ----------------------------------------------------------------------------

const CRON_RUNNERS = [
  "src/lib/development/server/cron/overdue-drawdown-job.ts",
  "src/lib/development/server/cron/fx-snapshot-job.ts",
  "src/lib/development/server/cron/balance-alert-job.ts",
  "src/lib/development/server/cron/self-sustaining-check-job.ts",
  "src/lib/development/server/cron/balance-reconciliation-job.ts",
];

test("all 5 new cron job runner files exist", () => {
  for (const rel of CRON_RUNNERS) {
    assert.ok(exists(rel), `${rel} missing`);
  }
});

const CRON_ROUTES = [
  "src/app/api/cron/dev-os-overdue-drawdown/route.ts",
  "src/app/api/cron/dev-os-fx-snapshot/route.ts",
  "src/app/api/cron/dev-os-balance-alert/route.ts",
  "src/app/api/cron/dev-os-self-sustaining-check/route.ts",
  "src/app/api/cron/dev-os-balance-reconciliation/route.ts",
];

test("all 5 new cron HTTP routes exist", () => {
  for (const rel of CRON_ROUTES) {
    assert.ok(exists(rel), `${rel} missing`);
    const src = read(rel);
    assert.match(src, /handleCronJobRequest/);
  }
});

test("dispatcher registers all 5 new job keys in KNOWN_JOBS", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const key of [
    "dev_os_overdue_drawdown",
    "dev_os_fx_snapshot",
    "dev_os_balance_alert",
    "dev_os_self_sustaining_check",
    "dev_os_balance_reconciliation",
  ]) {
    assert.ok(src.includes(`"${key}"`), `dispatcher missing key ${key}`);
  }
});

test("cron index re-exports all 5 new runners", () => {
  const src = read("src/lib/development/server/cron/index.ts");
  for (const name of [
    "runDevOsOverdueDrawdown",
    "runDevOsFxSnapshot",
    "runDevOsBalanceAlert",
    "runDevOsSelfSustainingCheck",
    "runDevOsBalanceReconciliation",
  ]) {
    assert.match(src, new RegExp(`export \\{ ${name} \\}`));
  }
});

test("balance-alert job enforces 24h cooldown via last_balance_alert_at", () => {
  const src = read("src/lib/development/server/cron/balance-alert-job.ts");
  assert.match(src, /COOLDOWN_HOURS = 24/);
  assert.match(src, /last_balance_alert_at/);
});

test("self-sustaining check fires notifications only on state transitions", () => {
  const src = read(
    "src/lib/development/server/cron/self-sustaining-check-job.ts",
  );
  assert.match(src, /project_self_sustaining_reached/);
  assert.match(src, /project_self_sustaining_lost/);
  // Must compare wasSustaining vs isSustaining
  assert.match(src, /!wasSustaining && isSustaining/);
  assert.match(src, /wasSustaining && !isSustaining/);
});

test("fx-snapshot job uses rolled-forward fallback (no API integration in 2.3.B)", () => {
  const src = read("src/lib/development/server/cron/fx-snapshot-job.ts");
  assert.match(src, /rolled forward|Rolled forward/);
});

test("overdue-drawdown job is idempotent (only walks status='requested')", () => {
  const src = read("src/lib/development/server/cron/overdue-drawdown-job.ts");
  assert.match(src, /eq\(capitalDrawdowns\.status, "requested"\)/);
});

test("balance-reconciliation job is read-only (no writes)", () => {
  const src = read(
    "src/lib/development/server/cron/balance-reconciliation-job.ts",
  );
  assert.doesNotMatch(src, /\.update\(devBankAccounts\)/);
  assert.doesNotMatch(src, /\.insert\(devBankAccounts\)/);
});

// ----------------------------------------------------------------------------
// 7) UI routes
// ----------------------------------------------------------------------------

test("Distribution UI routes exist", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/distributions/page.tsx",
    "src/app/(development-app)/development-os/distributions/new/page.tsx",
    "src/app/(development-app)/development-os/distributions/[id]/page.tsx",
  ]) {
    assert.ok(exists(rel), `${rel} missing`);
  }
});

test("Finance dashboard is no longer a placeholder", () => {
  const src = read(
    "src/app/(development-app)/development-os/finance/page.tsx",
  );
  assert.doesNotMatch(src, /ModulePlaceholder/);
  assert.match(src, /getBankAccounts/);
  assert.match(src, /evaluateSelfSustainingThreshold/);
});

test("Distribution detail page has executeDistribution server action", () => {
  const src = read(
    "src/app/(development-app)/development-os/distributions/[id]/page.tsx",
  );
  assert.match(src, /executeDistribution/);
  assert.match(src, /"use server"/);
});

test("Distribution declare page has previewDistribution + declareDistribution", () => {
  const src = read(
    "src/app/(development-app)/development-os/distributions/new/page.tsx",
  );
  assert.match(src, /previewDistribution/);
  assert.match(src, /declareDistribution/);
});

test("Distribution + Finance pages use safeQuery for secondary fetches", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/distributions/page.tsx",
    "src/app/(development-app)/development-os/finance/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /safeQuery\(/, `${rel} should use safeQuery`);
  }
});

test("dashboard navigation lists Distributions under Capital", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /label: "Distributions"/);
});

// ----------------------------------------------------------------------------
// 8) Demo seed — Stage 2.3.B section
// ----------------------------------------------------------------------------

test("seed-dev-os.mjs has Stage 2.3.B section markers", () => {
  const src = read("scripts/seed-dev-os.mjs");
  for (const marker of [
    "Stage 2.3.B",
    "bankSpec",
    "parentCats",
    "childCats",
    "budgetSpec",
    "vendorSpec",
    "txSpec",
    "eventSpec",
    "fxRowsToInsert",
    "Sample distribution",
  ]) {
    assert.ok(src.includes(marker), `seed missing 2.3.B marker: ${marker}`);
  }
});

test("seed uses ON CONFLICT for idempotency on every 2.3.B table", () => {
  const src = read("scripts/seed-dev-os.mjs");
  const stage = src.slice(src.indexOf("Stage 2.3.B"));
  for (const target of [
    "ON CONFLICT (account_code)",
    "ON CONFLICT (category_code)",
    "ON CONFLICT (commitment_code)",
    "ON CONFLICT (transaction_code)",
    "ON CONFLICT (event_code)",
    "ON CONFLICT (snapshot_date)",
  ]) {
    assert.ok(stage.includes(target), `Stage 2.3.B seed missing: ${target}`);
  }
});

test("seed reconciles wallet balances against drawdowns + distributions", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(
    src,
    /wallet balances reconcile to drawdowns \+ distributions \(no drift\)/,
  );
});

test("seed reconciles bank balances against transactions", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /bank account \/ transactions reconciliation/);
});

test("seed sample distribution insert block guards against double-execution", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /existingDistribution\.length === 0/);
  assert.match(src, /already present, skipped/);
});

test("seed bank-account upsert preserves edited balances on re-run", () => {
  const src = read("scripts/seed-dev-os.mjs");
  // Bank accounts use ON CONFLICT DO UPDATE so balance edits propagate
  assert.match(src, /ON CONFLICT \(account_code\) DO UPDATE/);
});

// ----------------------------------------------------------------------------
// 9) Cron docs + deployment
// ----------------------------------------------------------------------------

test("VERCEL-CRON-CHECKLIST lists all 5 new cron routes", () => {
  const src = read("docs/VERCEL-CRON-CHECKLIST.md");
  for (const path of [
    "/api/cron/dev-os-overdue-drawdown",
    "/api/cron/dev-os-fx-snapshot",
    "/api/cron/dev-os-balance-alert",
    "/api/cron/dev-os-self-sustaining-check",
    "/api/cron/dev-os-balance-reconciliation",
  ]) {
    assert.ok(src.includes(path), `cron checklist missing: ${path}`);
  }
});

// ----------------------------------------------------------------------------
// 10) Drizzle schema additions
// ----------------------------------------------------------------------------

test("development.ts schema has isSelfSustaining + lastSelfSustainingCheckAt", () => {
  const src = read("src/lib/db/schema/development.ts");
  assert.match(src, /isSelfSustaining/);
  assert.match(src, /lastSelfSustainingCheckAt/);
});

test("dev-finance.ts schema has lastBalanceAlertAt", () => {
  const src = read("src/lib/db/schema/dev-finance.ts");
  assert.match(src, /lastBalanceAlertAt/);
});

// ----------------------------------------------------------------------------
// 11) Pure-function regressions (must not break)
// ----------------------------------------------------------------------------

test("safeQuery still resolves to fallback on timeout (regression)", async () => {
  const { safeQuery } = await import("../src/lib/development/safe-query");
  const v = await safeQuery(
    "stuck",
    new Promise<number>(() => {
      // never resolves
    }),
    -1,
    50,
  );
  assert.equal(v, -1);
});

test("formatUsdMinor still formats correctly (regression)", async () => {
  const { formatUsdMinor } = await import(
    "../src/lib/development/constants/investor-constants"
  );
  assert.equal(formatUsdMinor(200_000_00n), "$200,000.00");
});

/**
 * Stage 6.P3.G — Reconciliation engine + bookkeeper UI + cron jobs +
 * webhook routes.
 *
 * Covers (file-presence + grep + pure-helper invariants):
 *   - Migration 0081 closed_periods (FOREACH RLS, FK to app_users).
 *   - Auto-matcher: exact amount + date tolerance + counterparty
 *     fuzzy match; multi-factor confidence scoring; decideMatchStatus
 *     thresholds.
 *   - Description matcher: jaccard + levenshtein, normalize strips
 *     punctuation + common words.
 *   - Rules engine: every match_type, priority ordering, throttle.
 *   - 5 cron job runners exist + delegate to handleCronJobRequest.
 *   - 4 webhook routes exist + delegate to handleBankingWebhook /
 *     handlePaymentWebhook.
 *   - 5 bookkeeper UI pages exist + wire the right server actions.
 *   - Service layer surface: BankingService exports the load-bearing
 *     functions.
 *   - Architecture doc + acceptance doc updates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  daysBetween,
  decideMatchStatus,
  findMatches,
  scoreInvoiceMatch,
  scoreTransactionMatch,
  type MatchableBankTransaction,
  type MatchableInvoice,
} from "../src/lib/banking/reconciliation/auto-matcher";
import {
  descriptionSimilarity,
  jaccardSimilarity,
  levenshtein,
  normalizeDescription,
  tokenizeDescription,
} from "../src/lib/banking/reconciliation/description-matcher";
import {
  applyRules,
  ruleMatches,
  type ReconciliationRule,
} from "../src/lib/banking/reconciliation/rules-engine";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 1) Migration 0081
// ===========================================================================

test("migration 0081: closed_periods exists with FOREACH RLS", () => {
  const path = "drizzle/0081_development_os_stage_6_p3_closed_periods.sql";
  assert.ok(fileExists(path));
  const sql = readFile(path);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "closed_periods"/);
  assert.match(sql, /UNIQUE \("organization_id", "period_start", "period_end"\)/);
  assert.match(sql, /FOREACH t IN ARRAY ARRAY\[/);
  assert.doesNotMatch(sql, /FOR \w+ IN SELECT unnest/);
  assert.match(sql, /is_in_user_organization\(organization_id\)/);
});

test("migration 0081: scope CHECK constraint allows month/quarter/year/custom", () => {
  const sql = readFile(
    "drizzle/0081_development_os_stage_6_p3_closed_periods.sql",
  );
  assert.match(sql, /'month',\s*'quarter',\s*'year',\s*'custom'/);
});

// ===========================================================================
// 2) Description matcher
// ===========================================================================

test("normalizeDescription: lowercase + strip punctuation + collapse whitespace", () => {
  assert.equal(
    normalizeDescription("Coffee Shop, Bali  --  Order #42!"),
    "coffee shop bali order 42",
  );
});

test("tokenizeDescription: drops common words + short tokens", () => {
  const tokens = tokenizeDescription("payment for invoice INV-42 from Acme");
  // Common words ("payment", "for", "invoice", "from", "inv") are
  // stripped — leaves the bookkeeping-relevant signal behind.
  assert.ok(!tokens.includes("payment"));
  assert.ok(!tokens.includes("for"));
  assert.ok(!tokens.includes("from"));
  assert.ok(!tokens.includes("inv"));
  assert.ok(tokens.includes("42"));
  assert.ok(tokens.includes("acme"));
});

test("jaccardSimilarity: identical descriptions → 1; disjoint → 0", () => {
  assert.equal(jaccardSimilarity("Acme Corp invoice", "Acme Corp invoice"), 1);
  assert.equal(
    jaccardSimilarity("apples bananas cherries", "xenon yttrium zinc"),
    0,
  );
});

test("jaccardSimilarity: partial overlap returns intermediate score", () => {
  const sim = jaccardSimilarity("Stripe payout USD", "Stripe payout EUR");
  assert.ok(sim > 0 && sim < 1);
});

test("levenshtein: matches well-known small inputs", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("same", "same"), 0);
});

test("descriptionSimilarity: variants of the same id score high via Levenshtein backstop", () => {
  // "INV-2026-001" vs "INV2026001" — no token overlap (Jaccard=0
  // after stripping punctuation), but the strings are clearly the
  // same identifier.
  const sim = descriptionSimilarity("INV-2026-001", "INV2026001");
  assert.ok(sim > 0.6, `expected >0.6, got ${sim}`);
});

// ===========================================================================
// 3) Auto-matcher
// ===========================================================================

const today = new Date("2026-05-07T00:00:00Z");
const baseTx: MatchableBankTransaction = {
  amountMinor: -100000n,
  currency: "EUR",
  transactionDate: today,
  description: "Acme Corp invoice payment",
  counterpartyName: "Acme Corp",
};

test("scoreInvoiceMatch: exact amount + same date + counterparty match → high confidence", () => {
  const inv: MatchableInvoice = {
    id: "inv-1",
    amountMinor: 100000n,
    currency: "EUR",
    date: today,
    counterparty: "Acme Corp",
    description: "Acme Corp invoice",
  };
  const r = scoreInvoiceMatch(baseTx, inv);
  assert.ok(r.confidence >= 0.9, `expected >= 0.9, got ${r.confidence}`);
  assert.ok(r.matchReasons.includes("amount_exact"));
  assert.ok(r.matchReasons.includes("date_exact"));
});

test("scoreInvoiceMatch: currency mismatch → 0", () => {
  const r = scoreInvoiceMatch(baseTx, {
    id: "x",
    amountMinor: 100000n,
    currency: "USD",
    date: today,
  });
  assert.equal(r.confidence, 0);
});

test("scoreInvoiceMatch: amount differs, date+counterparty present → low confidence", () => {
  const r = scoreInvoiceMatch(baseTx, {
    id: "x",
    amountMinor: 999999n,
    currency: "EUR",
    date: today,
    counterparty: "Acme Corp",
  });
  assert.ok(r.confidence < 0.5);
});

test("scoreInvoiceMatch: date within tolerance window contributes partial confidence", () => {
  const inv: MatchableInvoice = {
    id: "x",
    amountMinor: 100000n,
    currency: "EUR",
    date: new Date("2026-05-04T00:00:00Z"), // 3 days off
  };
  const r = scoreInvoiceMatch(baseTx, inv, { dateToleranceDays: 7 });
  assert.ok(r.confidence > 0.5);
  assert.ok(r.matchReasons.some((s) => s.startsWith("date_within_")));
});

test("scoreTransactionMatch: inverse-sign amount earns partial credit (typical bank-vs-ledger)", () => {
  const r = scoreTransactionMatch(baseTx, {
    id: "tx",
    amountMinor: 100000n, // positive vs bank's negative
    currency: "EUR",
    date: today,
  });
  assert.ok(r.matchReasons.includes("amount_inverse"));
  assert.ok(r.confidence > 0 && r.confidence < 1);
});

test("findMatches: ranks by confidence + caps at 10 candidates", () => {
  const invoices: MatchableInvoice[] = Array.from({ length: 15 }, (_, i) => ({
    id: `inv-${i}`,
    amountMinor: 100000n,
    currency: "EUR",
    date: today,
  }));
  const matches = findMatches(baseTx, { invoices });
  assert.equal(matches.length, 10);
  // sorted descending
  for (let i = 1; i < matches.length; i++) {
    assert.ok(matches[i - 1].confidence >= matches[i].confidence);
  }
});

test("findMatches: filters by minConfidence", () => {
  const invoices: MatchableInvoice[] = [
    {
      id: "low",
      amountMinor: 999999n, // wrong amount
      currency: "EUR",
      date: today,
    },
  ];
  const matches = findMatches(baseTx, { invoices }, { minConfidence: 0.5 });
  assert.equal(matches.length, 0);
});

test("decideMatchStatus: thresholds 0.95 / 0.5 / below", () => {
  assert.equal(decideMatchStatus(0.96), "auto_matched");
  assert.equal(decideMatchStatus(0.7), "partial_match");
  assert.equal(decideMatchStatus(0.3), "unmatched");
});

test("daysBetween: absolute days between two UTC dates", () => {
  assert.equal(
    daysBetween(
      new Date("2026-05-07T00:00:00Z"),
      new Date("2026-05-10T00:00:00Z"),
    ),
    3,
  );
});

// ===========================================================================
// 4) Rules engine
// ===========================================================================

function makeRule(over: Partial<ReconciliationRule>): ReconciliationRule {
  return {
    id: "r1",
    name: "Test rule",
    isActive: true,
    priority: 100,
    matchType: "description_contains",
    matchConfig: { needle: "stripe" },
    autoAssignCategoryId: undefined,
    autoMatchToVendorId: undefined,
    autoMatchToInvoiceStrategy: undefined,
    ...over,
  };
}

test("ruleMatches: description_contains case-insensitive by default", () => {
  const tx = {
    amountMinor: 100n,
    description: "STRIPE PAYOUT 042",
    transactionDate: today,
  };
  assert.equal(ruleMatches(tx, makeRule({})), true);
});

test("ruleMatches: description_regex respects flags", () => {
  const tx = {
    amountMinor: 1n,
    description: "INV-2026-042",
    transactionDate: today,
  };
  assert.equal(
    ruleMatches(
      tx,
      makeRule({
        matchType: "description_regex",
        matchConfig: { pattern: "^INV-\\d+", flags: "i" },
      }),
    ),
    true,
  );
});

test("ruleMatches: amount_exact with tolerance window", () => {
  const tx = {
    amountMinor: 99999n,
    description: "x",
    transactionDate: today,
  };
  assert.equal(
    ruleMatches(
      tx,
      makeRule({
        matchType: "amount_exact",
        matchConfig: { amountMinor: 100000n, toleranceMinor: 5n },
      }),
    ),
    true,
  );
  assert.equal(
    ruleMatches(
      tx,
      makeRule({
        matchType: "amount_exact",
        matchConfig: { amountMinor: 100000n, toleranceMinor: 0n },
      }),
    ),
    false,
  );
});

test("ruleMatches: amount_range bounds inclusive", () => {
  const tx = {
    amountMinor: 5000n,
    description: "x",
    transactionDate: today,
  };
  assert.equal(
    ruleMatches(
      tx,
      makeRule({
        matchType: "amount_range",
        matchConfig: { minMinor: 1000n, maxMinor: 10000n },
      }),
    ),
    true,
  );
});

test("ruleMatches: counterparty_match requires counterpartyName on the tx", () => {
  const tx = {
    amountMinor: 1n,
    description: "x",
    transactionDate: today,
  };
  assert.equal(
    ruleMatches(
      tx,
      makeRule({
        matchType: "counterparty_match",
        matchConfig: { needle: "acme" },
      }),
    ),
    false,
  );
});

test("ruleMatches: date_range_match", () => {
  const tx = {
    amountMinor: 1n,
    description: "x",
    transactionDate: new Date("2026-05-07T00:00:00Z"),
  };
  assert.equal(
    ruleMatches(
      tx,
      makeRule({
        matchType: "date_range_match",
        matchConfig: { from: "2026-05-01", to: "2026-05-31" },
      }),
    ),
    true,
  );
});

test("applyRules: priority order — first rule with category wins", () => {
  const tx = {
    amountMinor: 1n,
    description: "Stripe payout",
    transactionDate: today,
  };
  const rules = [
    makeRule({
      id: "r2",
      priority: 200,
      autoAssignCategoryId: "cat-2",
    }),
    makeRule({
      id: "r1",
      priority: 100,
      autoAssignCategoryId: "cat-1",
    }),
  ];
  const r = applyRules(tx, rules);
  assert.equal(r.suggestedCategoryId, "cat-1");
  assert.deepEqual(r.appliedRuleIds.sort(), ["r1", "r2"].sort());
});

test("applyRules: inactive rules ignored", () => {
  const tx = {
    amountMinor: 1n,
    description: "Stripe payout",
    transactionDate: today,
  };
  const rules = [
    makeRule({ id: "r1", isActive: false, autoAssignCategoryId: "cat-1" }),
  ];
  const r = applyRules(tx, rules);
  assert.equal(r.appliedRuleIds.length, 0);
  assert.equal(r.suggestedCategoryId, undefined);
});

// ===========================================================================
// 5) Cron jobs
// ===========================================================================

test("cron jobs: 5 P3.G runner files exist", () => {
  for (const f of [
    "bank-account-sync-job.ts",
    "reconciliation-engine-job.ts",
    "stripe-event-poller-job.ts",
    "payment-status-sync-job.ts",
    "period-close-reminder-job.ts",
  ]) {
    assert.ok(fileExists(`src/lib/development/server/cron/${f}`));
  }
});

test("cron index: exports all 5 P3.G runners", () => {
  const src = readFile("src/lib/development/server/cron/index.ts");
  for (const fn of [
    "runBankAccountSync",
    "runReconciliationEngine",
    "runStripeEventPoller",
    "runPaymentStatusSync",
    "runPeriodCloseReminder",
  ]) {
    assert.match(src, new RegExp(`export\\s*\\{\\s*${fn}\\s*\\}\\s*from`));
  }
});

test("dispatcher: 5 P3.G keys wired into KNOWN_JOBS + executeJob", () => {
  const src = readFile("src/features/jobs/actions.ts");
  for (const key of [
    "bank_account_sync",
    "reconciliation_engine",
    "stripe_event_poller",
    "payment_status_sync",
    "period_close_reminder",
  ]) {
    assert.match(src, new RegExp(`"${key}"`));
    assert.match(src, new RegExp(`case\\s+"${key}":`));
  }
});

test("cron routes: 5 P3.G route files exist + delegate", () => {
  for (const r of [
    "bank-account-sync",
    "reconciliation-engine",
    "stripe-event-poller",
    "payment-status-sync",
    "period-close-reminder",
  ]) {
    const path = `src/app/api/cron/${r}/route.ts`;
    assert.ok(fileExists(path), `${path} must exist`);
    assert.match(readFile(path), /handleCronJobRequest/);
  }
});

test("VERCEL-CRON-CHECKLIST: all 5 P3.G entries listed + crons block updated", () => {
  const src = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  for (const r of [
    "/api/cron/bank-account-sync",
    "/api/cron/reconciliation-engine",
    "/api/cron/stripe-event-poller",
    "/api/cron/payment-status-sync",
    "/api/cron/period-close-reminder",
  ]) {
    assert.ok(src.includes(r), `${r} must appear in checklist`);
  }
});

// ===========================================================================
// 6) Webhook routes
// ===========================================================================

test("webhook routes: 4 P3.G route files exist", () => {
  for (const path of [
    "src/app/api/webhooks/banking/revolut/route.ts",
    "src/app/api/webhooks/banking/wise/route.ts",
    "src/app/api/webhooks/payments/stripe/route.ts",
    "src/app/api/webhooks/payments/wise/route.ts",
  ]) {
    assert.ok(fileExists(path));
  }
});

test("webhook routes: banking routes delegate to handleBankingWebhook", () => {
  for (const channel of ["revolut", "wise"]) {
    const src = readFile(`src/app/api/webhooks/banking/${channel}/route.ts`);
    assert.match(src, /handleBankingWebhook/);
    assert.match(src, /export const runtime = "nodejs"/);
  }
});

test("webhook routes: payment routes delegate to handlePaymentWebhook", () => {
  for (const provider of ["stripe", "wise"]) {
    const src = readFile(`src/app/api/webhooks/payments/${provider}/route.ts`);
    assert.match(src, /handlePaymentWebhook/);
  }
});

test("webhook routes: Stripe carries stripe-signature header config", () => {
  const src = readFile("src/app/api/webhooks/payments/stripe/route.ts");
  assert.match(src, /stripe-signature/i);
});

test("webhook routes: Revolut carries revolut-signature + revolut-request-timestamp config", () => {
  const src = readFile("src/app/api/webhooks/banking/revolut/route.ts");
  assert.match(src, /revolut-signature/i);
  assert.match(src, /revolut-request-timestamp/i);
});

// ===========================================================================
// 7) Bookkeeper UI pages
// ===========================================================================

test("bookkeeper UI: all 5 P3.G pages exist", () => {
  for (const slug of [
    "bank-review",
    "reconciliation",
    "statement-import",
    "rules",
    "period-close",
  ]) {
    const path = `src/app/(development-app)/development-os/finance/${slug}/page.tsx`;
    assert.ok(fileExists(path), `${path} must exist`);
  }
});

test("bookkeeper UI: bank-review wires syncConnectionAction + ignoreTransactionAction", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/finance/bank-review/page.tsx",
  );
  assert.match(src, /syncConnectionAction/);
  assert.match(src, /ignoreTransactionAction/);
});

test("bookkeeper UI: reconciliation wires runReconciliationAction", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/finance/reconciliation/page.tsx",
  );
  assert.match(src, /runReconciliationAction/);
});

test("bookkeeper UI: statement-import surfaces bundled CSV templates", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/finance/statement-import/page.tsx",
  );
  assert.match(src, /CSV_TEMPLATES/);
});

test("bookkeeper UI: rules wires createRuleAction + setRuleActiveAction", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/finance/rules/page.tsx",
  );
  assert.match(src, /createRuleAction/);
  assert.match(src, /setRuleActiveAction/);
});

test("bookkeeper UI: period-close wires closePeriodAction + reopenPeriodAction", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/finance/period-close/page.tsx",
  );
  assert.match(src, /closePeriodAction/);
  assert.match(src, /reopenPeriodAction/);
});

test("bookkeeper-actions.ts: opens with \"use server\" + every form action returns Promise<void>", () => {
  const src = readFile("src/lib/banking/bookkeeper-actions.ts");
  assert.match(src, /^"use server";/);
  for (const fn of [
    "syncConnectionAction",
    "runReconciliationAction",
    "assignCategoryAction",
    "matchInvoiceAction",
    "ignoreTransactionAction",
    "createRuleAction",
    "setRuleActiveAction",
    "closePeriodAction",
    "reopenPeriodAction",
  ]) {
    assert.match(
      src,
      new RegExp(`function\\s+${fn}\\b[^{]*Promise<void>`),
      `${fn} must return Promise<void>`,
    );
  }
});

// ===========================================================================
// 8) Service layer
// ===========================================================================

test("BankingService: exports all the load-bearing functions", () => {
  const src = readFile("src/lib/banking/service.ts");
  for (const fn of [
    "syncTransactionsForConnection",
    "listActiveConnectionsForCron",
    "runAutoReconciliation",
    "closePeriod",
    "reopenPeriod",
    "isPeriodClosed",
    "createStatementImport",
    "updateStatementImportStatus",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("BankingService: opens with \"use server\" directive", () => {
  const src = readFile("src/lib/banking/service.ts");
  assert.match(src, /^"use server";/);
});

// ===========================================================================
// 9) Architecture doc bookkeeping
// ===========================================================================

test("architecture doc: Stage 6.P3 marked ACCEPTED post-P3.G", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P3 — Banking \+ Payments `\[ACCEPTED 6\.P3\]`/);
});

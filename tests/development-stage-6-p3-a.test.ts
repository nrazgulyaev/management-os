/**
 * Stage 6.P3.A — Schema + Provider Abstraction tests.
 *
 * Covers (file-presence + grep + pure helper invariants):
 *   - Migration 0079 (banking) + 0080 (payments) shape, FK references,
 *     RLS via FOREACH IN ARRAY (the 0075 lesson), CHECK constraints.
 *   - Drizzle schema modules exist + re-exported from the index.
 *   - Banking provider abstraction: types, selector, DryRun. Selector
 *     defaults to DryRun without credentials, on credential mismatch,
 *     on `other` (the catch-all slot).
 *   - Payment-processor abstraction: types, selector, DryRun. DryRun
 *     fail-closes on verifyWebhook (financial security invariant).
 *   - Public surface module exports the expected symbols.
 *   - Architecture doc marks Stage 6.P3 ACTIVE + bookkeeps P2 ACCEPTED.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  selectBankProvider,
  DryRunBankProvider,
  type BankCredentials,
} from "../src/lib/banking";
import {
  selectPaymentProvider,
  DryRunPaymentProvider,
  type PaymentCredentials,
} from "../src/lib/payment-processors";
import {
  BANK_PROVIDERS,
  STATEMENT_FORMATS,
} from "../src/lib/db/schema/banking";
import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  PAYMENT_LIFECYCLE_STATES,
} from "../src/lib/db/schema/payment-processors";

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
// 1) Migrations — file presence + structural invariants
// ===========================================================================

test("migration 0079: banking SQL file exists", () => {
  assert.ok(fileExists("drizzle/0079_development_os_stage_6_p3_banking.sql"));
});

test("migration 0080: payments SQL file exists", () => {
  assert.ok(fileExists("drizzle/0080_development_os_stage_6_p3_payments.sql"));
});

test("migration 0079: defines all 4 banking tables", () => {
  const sql = readFile("drizzle/0079_development_os_stage_6_p3_banking.sql");
  for (const table of [
    "bank_connections",
    "bank_transactions",
    "statement_imports",
    "reconciliation_rules",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`),
      `${table} must be created`,
    );
  }
});

test("migration 0080: defines all 3 payment-processor tables", () => {
  const sql = readFile("drizzle/0080_development_os_stage_6_p3_payments.sql");
  for (const table of [
    "payment_processor_connections",
    "payment_intents",
    "payment_attempts",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`),
      `${table} must be created`,
    );
  }
});

test("migration 0079: FK references use codebase's actual physical table names", () => {
  const sql = readFile("drizzle/0079_development_os_stage_6_p3_banking.sql");
  // The codebase uses dev_-prefixed names; the spec used unprefixed
  // shorthand. Migration must reference the real tables.
  assert.match(sql, /REFERENCES "dev_bank_accounts"/);
  assert.match(sql, /REFERENCES "dev_cost_categories"/);
  assert.match(sql, /REFERENCES "dev_transactions"/);
  // invoices + vendors are unprefixed — those FKs match the spec.
  assert.match(sql, /REFERENCES "invoices"/);
  assert.match(sql, /REFERENCES "vendors"/);
});

test("migration 0079: bank_transactions UNIQUE (bank_connection_id, external_transaction_id) for idempotent ingestion", () => {
  const sql = readFile("drizzle/0079_development_os_stage_6_p3_banking.sql");
  assert.match(
    sql,
    /UNIQUE \("bank_connection_id", "external_transaction_id"\)/,
  );
});

test("migration 0080: payment_intents UNIQUE (processor_connection_id, external_intent_id) for idempotency", () => {
  const sql = readFile("drizzle/0080_development_os_stage_6_p3_payments.sql");
  assert.match(
    sql,
    /UNIQUE \("processor_connection_id", "external_intent_id"\)/,
  );
});

test("migrations 0079 + 0080: both use FOREACH IN ARRAY for RLS (the 0075 lesson)", () => {
  for (const path of [
    "drizzle/0079_development_os_stage_6_p3_banking.sql",
    "drizzle/0080_development_os_stage_6_p3_payments.sql",
  ]) {
    const sql = readFile(path);
    assert.match(
      sql,
      /FOREACH t IN ARRAY ARRAY\[/,
      `${path} must use FOREACH IN ARRAY ARRAY[...] (0075 lesson)`,
    );
    // And NOT the regress pattern.
    assert.doesNotMatch(
      sql,
      /FOR \w+ IN SELECT unnest/,
      `${path} must not use FOR ... IN SELECT unnest(...)`,
    );
  }
});

test("migrations 0079 + 0080: enable + force RLS on every banking + payment table", () => {
  const allTables = [
    "bank_connections",
    "bank_transactions",
    "statement_imports",
    "reconciliation_rules",
    "payment_processor_connections",
    "payment_intents",
    "payment_attempts",
  ];
  const combined =
    readFile("drizzle/0079_development_os_stage_6_p3_banking.sql") +
    readFile("drizzle/0080_development_os_stage_6_p3_payments.sql");
  for (const t of allTables) {
    assert.ok(
      combined.includes(`'${t}'`),
      `${t} must be listed in the FOREACH RLS block`,
    );
  }
  // Both migrations must call ENABLE + FORCE.
  assert.match(combined, /ENABLE ROW LEVEL SECURITY/);
  assert.match(combined, /FORCE ROW LEVEL SECURITY/);
  assert.match(combined, /is_in_user_organization\(organization_id\)/);
});

test("migration 0080: reuses banking_set_updated_at() trigger function from 0079", () => {
  const sql = readFile("drizzle/0080_development_os_stage_6_p3_payments.sql");
  // 0080 attaches triggers using the function but doesn't redeclare it.
  assert.match(sql, /EXECUTE FUNCTION "banking_set_updated_at"\(\)/);
  assert.doesNotMatch(
    sql,
    /CREATE OR REPLACE FUNCTION "banking_set_updated_at"/,
    "0080 must not redefine banking_set_updated_at — it's owned by 0079",
  );
});

test("migration 0079: bank_transactions sign convention documented (positive=credit, negative=debit)", () => {
  const sql = readFile("drizzle/0079_development_os_stage_6_p3_banking.sql");
  // Allow for the comment to wrap onto multiple lines.
  assert.match(sql, /positive\s*=\s*credit/i);
  assert.match(sql, /negative[\s\S]{0,30}=\s*debit/i);
});

// ===========================================================================
// 2) Drizzle schema modules — re-exported from the index
// ===========================================================================

test("schema index: banking + payment-processors re-exported", () => {
  const src = readFile("src/lib/db/schema/index.ts");
  assert.match(src, /export \* from "\.\/banking"/);
  assert.match(src, /export \* from "\.\/payment-processors"/);
});

test("schema/banking.ts: defines all 4 banking pgTables with the right physical names", () => {
  const src = readFile("src/lib/db/schema/banking.ts");
  assert.match(src, /pgTable\(\s*"bank_connections"/);
  assert.match(src, /pgTable\(\s*"bank_transactions"/);
  assert.match(src, /pgTable\(\s*"statement_imports"/);
  assert.match(src, /pgTable\(\s*"reconciliation_rules"/);
});

test("schema/payment-processors.ts: defines all 3 pgTables with the right physical names", () => {
  const src = readFile("src/lib/db/schema/payment-processors.ts");
  assert.match(src, /pgTable\(\s*"payment_processor_connections"/);
  assert.match(src, /pgTable\(\s*"payment_intents"/);
  assert.match(src, /pgTable\(\s*"payment_attempts"/);
});

test("schema constants: banking + payments enums are exhaustive", () => {
  // BankProviderName: revolut, wise, mandiri, bca, plaid, manual, other
  assert.deepEqual(
    [...BANK_PROVIDERS].sort(),
    ["bca", "mandiri", "manual", "other", "plaid", "revolut", "wise"],
  );
  // StatementFormat: csv, ofx, pdf, mt940, json
  assert.deepEqual(
    [...STATEMENT_FORMATS].sort(),
    ["csv", "json", "mt940", "ofx", "pdf"],
  );
  // PaymentProviderName: stripe, wise_payments, paypal, manual
  assert.deepEqual(
    [...PAYMENT_PROVIDERS].sort(),
    ["manual", "paypal", "stripe", "wise_payments"],
  );
  // PaymentPurpose has 8 entries
  assert.equal(PAYMENT_PURPOSES.length, 8);
  // PaymentLifecycleState has 7 entries
  assert.equal(PAYMENT_LIFECYCLE_STATES.length, 7);
});

// ===========================================================================
// 3) Banking provider selector
// ===========================================================================

test("selectBankProvider: returns DryRun when credentials are null", () => {
  for (const p of ["revolut", "wise", "mandiri", "bca", "plaid", "manual"] as const) {
    const provider = selectBankProvider(p, null);
    assert.ok(provider instanceof DryRunBankProvider);
    assert.equal(provider.provider, p);
  }
});

test("selectBankProvider: 'other' always degrades to DryRun (no credentials union member)", () => {
  // Even if a caller somehow passes credentials, "other" has no real
  // implementation slot.
  const provider = selectBankProvider("other", {
    provider: "manual",
  } as unknown as BankCredentials);
  assert.ok(provider instanceof DryRunBankProvider);
  assert.equal(provider.provider, "other");
});

test("selectBankProvider: credential discriminator mismatch falls back to DryRun", () => {
  // Asking for revolut but passing wise creds → DryRun (defensive guard).
  const wiseCreds: BankCredentials = {
    provider: "wise",
    apiToken: "x",
    profileId: "1",
    environment: "sandbox",
  };
  const provider = selectBankProvider("revolut", wiseCreds);
  assert.ok(provider instanceof DryRunBankProvider);
});

test("selectBankProvider: P3.A scope returns DryRun for every provider even with matching creds", () => {
  // Real implementations land in P3.C/D/E/F. Until then every selector
  // path returns DryRun — the contract is stable, the implementation
  // grows.
  const cases: Array<[string, BankCredentials]> = [
    ["revolut", { provider: "revolut", apiKey: "k", environment: "sandbox" }],
    [
      "wise",
      { provider: "wise", apiToken: "x", profileId: "1", environment: "sandbox" },
    ],
    ["mandiri", { provider: "mandiri", accountNumber: "123" }],
    ["bca", { provider: "bca", accountNumber: "456" }],
    [
      "plaid",
      {
        provider: "plaid",
        clientId: "c",
        secret: "s",
        accessToken: "a",
        itemId: "i",
        environment: "sandbox",
      },
    ],
    ["manual", { provider: "manual" }],
  ];
  for (const [name, creds] of cases) {
    const provider = selectBankProvider(
      name as Parameters<typeof selectBankProvider>[0],
      creds,
    );
    assert.ok(
      provider instanceof DryRunBankProvider,
      `${name} should still be DryRun at P3.A`,
    );
    assert.equal(provider.provider, name);
  }
});

// ===========================================================================
// 4) DryRun bank provider behavior
// ===========================================================================

test("DryRunBankProvider: fetchTransactions returns empty + hasMore=false", async () => {
  const provider = new DryRunBankProvider("revolut");
  const result = await provider.fetchTransactions({
    externalAccountId: "acct-1",
    since: new Date(),
  });
  assert.deepEqual(result.transactions, []);
  assert.equal(result.hasMore, false);
});

test("DryRunBankProvider: fetchBalance returns 0 minor in USD", async () => {
  const provider = new DryRunBankProvider("wise");
  const balance = await provider.fetchBalance("acct-1");
  assert.equal(balance.availableMinor, 0n);
  assert.equal(balance.currency, "USD");
});

test("DryRunBankProvider: initiatePayment returns synthetic ID with 'dry_run' status", async () => {
  const provider = new DryRunBankProvider("revolut");
  const result = await provider.initiatePayment!({
    fromAccountId: "f",
    toIban: "GB...",
    amountMinor: 100_00n,
    currency: "GBP",
    reference: "ref-1",
  });
  assert.match(result.externalPaymentId, /^dryrun-revolut-/);
  assert.equal(result.status, "dry_run");
});

test("DryRunBankProvider: verifyWebhook fail-closes (returns false)", () => {
  const provider = new DryRunBankProvider("revolut");
  assert.equal(provider.verifyWebhook!("payload", "sig", "secret"), false);
});

test("DryRunBankProvider: parseWebhook returns null", () => {
  const provider = new DryRunBankProvider("revolut");
  assert.equal(provider.parseWebhook!({ event: "x" }), null);
});

test("DryRunBankProvider: testConnection succeeds with mode=dry_run", async () => {
  const provider = new DryRunBankProvider("mandiri");
  const result = await provider.testConnection();
  assert.equal(result.connected, true);
  assert.equal(result.details["mode"], "dry_run");
  assert.equal(result.details["provider"], "mandiri");
});

// ===========================================================================
// 5) Payment-processor selector
// ===========================================================================

test("selectPaymentProvider: returns DryRun without credentials", () => {
  for (const p of ["stripe", "wise_payments", "paypal", "manual"] as const) {
    const provider = selectPaymentProvider(p, null);
    assert.ok(provider instanceof DryRunPaymentProvider);
    assert.equal(provider.provider, p);
  }
});

test("selectPaymentProvider: credential discriminator mismatch falls back to DryRun", () => {
  const stripeCreds: PaymentCredentials = {
    provider: "stripe",
    secretKey: "sk_test_x",
    publishableKey: "pk_test_x",
    webhookSecret: "whsec_x",
    mode: "test",
  };
  const provider = selectPaymentProvider("paypal", stripeCreds);
  assert.ok(provider instanceof DryRunPaymentProvider);
});

test("selectPaymentProvider: P3.A scope returns DryRun for every provider even with matching creds", () => {
  const cases: Array<[string, PaymentCredentials]> = [
    [
      "stripe",
      {
        provider: "stripe",
        secretKey: "sk_test_x",
        publishableKey: "pk_test_x",
        webhookSecret: "whsec_x",
        mode: "test",
      },
    ],
    [
      "wise_payments",
      {
        provider: "wise_payments",
        apiToken: "x",
        profileId: "1",
        mode: "test",
      },
    ],
    [
      "paypal",
      {
        provider: "paypal",
        clientId: "c",
        clientSecret: "s",
        mode: "test",
      },
    ],
    ["manual", { provider: "manual", mode: "test" }],
  ];
  for (const [name, creds] of cases) {
    const provider = selectPaymentProvider(
      name as Parameters<typeof selectPaymentProvider>[0],
      creds,
    );
    assert.ok(
      provider instanceof DryRunPaymentProvider,
      `${name} should still be DryRun at P3.A`,
    );
    assert.equal(provider.provider, name);
  }
});

// ===========================================================================
// 6) DryRun payment provider behavior
// ===========================================================================

test("DryRunPaymentProvider: createPaymentIntent returns synthetic ID + status=dry_run + carries amount", async () => {
  const provider = new DryRunPaymentProvider("stripe");
  const intent = await provider.createPaymentIntent({
    amountMinor: 1234_56n,
    currency: "USD",
    purpose: "reservation_deposit",
    description: "Villa hold",
  });
  assert.match(intent.externalIntentId, /^dryrun_stripe_/);
  assert.equal(intent.status, "dry_run");
  assert.equal(intent.amountMinor, 1234_56n);
  assert.equal(intent.currency, "USD");
});

test("DryRunPaymentProvider: verifyWebhook fail-closes — financial security invariant", () => {
  // Critical: a misconfigured environment must NOT silently accept
  // signed webhook payloads on the DryRun surface.
  const provider = new DryRunPaymentProvider("stripe");
  assert.equal(provider.verifyWebhook("payload", "sig", "secret"), false);
});

test("DryRunPaymentProvider: parseWebhook returns null", () => {
  const provider = new DryRunPaymentProvider("stripe");
  assert.equal(provider.parseWebhook({ event: "x" }), null);
});

test("DryRunPaymentProvider: refund returns synthetic refund ID + dry_run status", async () => {
  const provider = new DryRunPaymentProvider("stripe");
  const result = await provider.refund({
    externalIntentId: "pi_test_x",
    amountMinor: 100_00n,
    reason: "duplicate",
  });
  assert.match(result.externalRefundId, /^dryrun_refund_stripe_/);
  assert.equal(result.status, "dry_run");
});

test("DryRunPaymentProvider: cancelPaymentIntent succeeds idempotently", async () => {
  const provider = new DryRunPaymentProvider("stripe");
  const r1 = await provider.cancelPaymentIntent("pi_x");
  const r2 = await provider.cancelPaymentIntent("pi_x");
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
});

test("DryRunPaymentProvider: testConnection succeeds with mode=dry_run", async () => {
  const provider = new DryRunPaymentProvider("paypal");
  const result = await provider.testConnection();
  assert.equal(result.connected, true);
  assert.equal(result.details["mode"], "dry_run");
});

// ===========================================================================
// 7) Public surface modules — re-export contract
// ===========================================================================

test("public surface: src/lib/banking exports selector + DryRun + types", () => {
  const src = readFile("src/lib/banking/index.ts");
  assert.match(src, /export \* from "\.\/types"/);
  assert.match(src, /export \{ selectBankProvider \}/);
  assert.match(src, /export \{ DryRunBankProvider \}/);
});

test("public surface: src/lib/payment-processors exports selector + DryRun + types", () => {
  const src = readFile("src/lib/payment-processors/index.ts");
  assert.match(src, /export \* from "\.\/types"/);
  assert.match(src, /export \{ selectPaymentProvider \}/);
  assert.match(src, /export \{ DryRunPaymentProvider \}/);
});

test("public surface: payment-processors module is named to avoid colliding with the existing src/lib/payments/", () => {
  // Co-existence note in the public surface.
  const src = readFile("src/lib/payment-processors/index.ts");
  assert.match(src, /direct-booking|src\/lib\/payments/);
});

// ===========================================================================
// 8) Architecture doc bookkeeping
// ===========================================================================

test("architecture doc: Stage 6.P3 marked ACTIVE, P0/P1/P2 ACCEPTED", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P0 — CRUD Foundation `\[ACCEPTED 6\.P0\]`/);
  assert.match(src, /Stage 6\.P1 — Booking Channels `\[ACCEPTED 6\.P1\]`/);
  assert.match(src, /Stage 6\.P2 — Communications `\[ACCEPTED 6\.P2\]`/);
  assert.match(src, /Stage 6\.P3 — Banking \+ Payments `\[ACTIVE 6\.P3\]`/);
});

test("architecture doc: Stage 6.P3 entry-state inheritance documents the 4075 baseline + 82 cron routes", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /4075 baseline tests/);
  assert.match(src, /82 cron routes/);
});

/**
 * Stage 6.P3.E — Indonesian banks (Mandiri + BCA) tests.
 *
 * Covers the manual-import providers + bundled CSV templates.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  selectBankProvider,
  DryRunBankProvider,
  type BankCredentials,
} from "../src/lib/banking";
import { MandiriProvider } from "../src/lib/banking/providers/mandiri/provider";
import { BCAProvider } from "../src/lib/banking/providers/bca/provider";
import {
  CSV_TEMPLATES,
  getCsvTemplate,
  listCsvTemplatesForProvider,
} from "../src/lib/banking/templates/csv-templates";

// ---------------------------------------------------------------------------
// Provider behaviour
// ---------------------------------------------------------------------------

test("MandiriProvider: fetchTransactions returns empty (manual import primary)", async () => {
  const p = new MandiriProvider({ provider: "mandiri", accountNumber: "1234567" });
  const r = await p.fetchTransactions({
    externalAccountId: "x",
    since: new Date(),
  });
  assert.deepEqual(r.transactions, []);
  assert.equal(r.hasMore, false);
});

test("MandiriProvider: fetchBalance returns IDR + zero", async () => {
  const p = new MandiriProvider({ provider: "mandiri", accountNumber: "1234567" });
  const b = await p.fetchBalance("acct");
  assert.equal(b.currency, "IDR");
  assert.equal(b.availableMinor, 0n);
});

test("MandiriProvider: testConnection redacts account number, surfaces manual-only note", async () => {
  const p = new MandiriProvider({ provider: "mandiri", accountNumber: "1234567" });
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["mode"], "manual_import_only");
  // Last 4 visible.
  assert.match(r.details["accountNumber"] as string, /\*+4567$/);
  assert.match(r.details["note"] as string, /manual.*import/i);
});

test("MandiriProvider: initiatePayment requires manual confirmation", async () => {
  const p = new MandiriProvider({ provider: "mandiri", accountNumber: "1" });
  const r = await p.initiatePayment({
    fromAccountId: "x",
    amountMinor: 100n,
    currency: "IDR",
    reference: "x",
  });
  assert.equal(r.status, "manual_required");
});

test("MandiriProvider: verifyWebhook fail-closes; parseWebhook returns null", () => {
  const p = new MandiriProvider({ provider: "mandiri", accountNumber: "1" });
  assert.equal(p.verifyWebhook(), false);
  assert.equal(p.parseWebhook({}), null);
});

test("BCAProvider: testConnection matches Mandiri shape (manual primary)", async () => {
  const p = new BCAProvider({ provider: "bca", accountNumber: "9876543" });
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["mode"], "manual_import_only");
  assert.match(r.details["accountNumber"] as string, /\*+6543$/);
});

test("BCAProvider: defaults currency to IDR", async () => {
  const p = new BCAProvider({ provider: "bca", accountNumber: "1" });
  const b = await p.fetchBalance("x");
  assert.equal(b.currency, "IDR");
});

// ---------------------------------------------------------------------------
// CSV templates
// ---------------------------------------------------------------------------

test("CSV_TEMPLATES: bundles Mandiri + BCA + generic templates", () => {
  const ids = CSV_TEMPLATES.map((t) => t.id);
  assert.ok(ids.includes("mandiri_internet_banking_v1"));
  assert.ok(ids.includes("bca_klikbca_bisnis_v1"));
  assert.ok(ids.includes("generic_english_v1"));
});

test("CSV_TEMPLATES: Mandiri uses IDR + dmy_slash + european format + separate debit/credit", () => {
  const t = getCsvTemplate("mandiri_internet_banking_v1");
  assert.ok(t);
  assert.equal(t.defaultOptions?.defaultCurrency, "IDR");
  assert.equal(t.defaultOptions?.dateFormat, "dmy_slash");
  assert.equal(t.defaultOptions?.amountFormat, "european");
  assert.equal(t.defaultOptions?.amountSign, "separate_columns");
  assert.equal(t.defaultMapping.debit, "Debit");
  assert.equal(t.defaultMapping.credit, "Kredit");
});

test("CSV_TEMPLATES: BCA uses IDR + dmy_slash + european + mixed amount", () => {
  const t = getCsvTemplate("bca_klikbca_bisnis_v1");
  assert.ok(t);
  assert.equal(t.defaultOptions?.defaultCurrency, "IDR");
  assert.equal(t.defaultOptions?.amountSign, "mixed");
});

test("listCsvTemplatesForProvider: filters by provider", () => {
  const mandiri = listCsvTemplatesForProvider("mandiri");
  assert.equal(mandiri.length, 1);
  assert.equal(mandiri[0].id, "mandiri_internet_banking_v1");

  const other = listCsvTemplatesForProvider("other");
  assert.ok(other.length >= 1);
});

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

test("selectBankProvider: mandiri creds → MandiriProvider", () => {
  const creds: BankCredentials = { provider: "mandiri", accountNumber: "1" };
  const p = selectBankProvider("mandiri", creds);
  assert.ok(p instanceof MandiriProvider);
  assert.equal(p.provider, "mandiri");
});

test("selectBankProvider: bca creds → BCAProvider", () => {
  const creds: BankCredentials = { provider: "bca", accountNumber: "1" };
  const p = selectBankProvider("bca", creds);
  assert.ok(p instanceof BCAProvider);
  assert.equal(p.provider, "bca");
});

test("selectBankProvider: mandiri requested + non-mandiri creds → DryRun", () => {
  const wrong: BankCredentials = {
    provider: "revolut",
    apiKey: "k",
    environment: "sandbox",
  };
  assert.ok(selectBankProvider("mandiri", wrong) instanceof DryRunBankProvider);
});

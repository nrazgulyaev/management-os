/**
 * Stage 6.P3.C — Revolut Business provider tests.
 *
 * Covers:
 *   - RevolutClient — auth header, sandbox + production hosts,
 *     transaction filter query params, payment POST body shape,
 *     retry envelope inheritance.
 *   - Parsers — single-leg + multi-leg projection, FX detail
 *     (bill_amount/bill_currency → originalAmount/fxRate),
 *     pending state propagation, multi-leg unique IDs, account-id
 *     filtering for FX swaps.
 *   - RevolutProvider — fetchTransactions + fetchBalance happy path,
 *     non-2xx degrades gracefully, webhook signature verification
 *     including replay-window enforcement, parseWebhook projection.
 *   - Selector dispatch — credentials with provider="revolut"
 *     selects RevolutProvider; mismatch falls back to DryRun.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  selectBankProvider,
  DryRunBankProvider,
  type BankCredentials,
} from "../src/lib/banking";
import { RevolutClient } from "../src/lib/banking/providers/revolut/client";
import {
  RevolutProvider,
  REVOLUT_REPLAY_WINDOW_MS,
  verifyRevolutSignature,
  verifyRevolutWebhook,
} from "../src/lib/banking/providers/revolut/provider";
import {
  projectRevolutAccountBalance,
  projectRevolutTransaction,
  projectRevolutTransactions,
} from "../src/lib/banking/providers/revolut/parsers";

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response,
): typeof globalThis.fetch {
  return async (url, init) => {
    return handler(typeof url === "string" ? url : url.toString(), init);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// 1) RevolutClient
// ---------------------------------------------------------------------------

test("RevolutClient: sandbox + production hosts route correctly", async () => {
  const seenSandboxUrls: string[] = [];
  const seenProductionUrls: string[] = [];
  const sandboxClient = new RevolutClient(
    {
      provider: "revolut",
      apiKey: "k",
      environment: "sandbox",
    },
    {
      fetch: mockFetch((url) => {
        seenSandboxUrls.push(url);
        return jsonResponse([]);
      }),
      backoffBaseMs: 1,
    },
  );
  const prodClient = new RevolutClient(
    {
      provider: "revolut",
      apiKey: "k",
      environment: "production",
    },
    {
      fetch: mockFetch((url) => {
        seenProductionUrls.push(url);
        return jsonResponse([]);
      }),
      backoffBaseMs: 1,
    },
  );
  await sandboxClient.listAccounts();
  await prodClient.listAccounts();
  assert.match(seenSandboxUrls[0], /^https:\/\/sandbox-b2b\.revolut\.com/);
  assert.match(seenProductionUrls[0], /^https:\/\/b2b\.revolut\.com/);
});

test("RevolutClient: every request carries Bearer token + Accept: application/json", async () => {
  const captured: { url: string; init?: RequestInit }[] = [];
  const client = new RevolutClient(
    {
      provider: "revolut",
      apiKey: "secret-token",
      environment: "sandbox",
    },
    {
      fetch: mockFetch((url, init) => {
        captured.push({ url, init });
        return jsonResponse([]);
      }),
      backoffBaseMs: 1,
    },
  );
  await client.listAccounts();
  await client.listCounterparties();
  for (const c of captured) {
    const headers = c.init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer secret-token");
    assert.equal(headers["Accept"], "application/json");
  }
});

test("RevolutClient: listTransactions sets account / from / to / count query params", async () => {
  let seenUrl = "";
  const client = new RevolutClient(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch((url) => {
        seenUrl = url;
        return jsonResponse([]);
      }),
      backoffBaseMs: 1,
    },
  );
  await client.listTransactions({
    accountId: "acct-1",
    from: new Date(Date.UTC(2026, 4, 1)),
    to: new Date(Date.UTC(2026, 4, 7)),
    count: 250,
  });
  const url = new URL(seenUrl);
  assert.equal(url.searchParams.get("account"), "acct-1");
  assert.equal(url.searchParams.get("from"), "2026-05-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("to"), "2026-05-07T00:00:00.000Z");
  assert.equal(url.searchParams.get("count"), "250");
});

test("RevolutClient: createPayment POSTs JSON with content-type + body", async () => {
  const captured: { url: string; init?: RequestInit }[] = [];
  const client = new RevolutClient(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch((url, init) => {
        captured.push({ url, init });
        return jsonResponse({ id: "p1", state: "pending", request_id: "r1" });
      }),
      backoffBaseMs: 1,
    },
  );
  await client.createPayment({
    request_id: "r1",
    account_id: "src",
    receiver: { counterparty_id: "cp1" },
    amount: 100,
    currency: "EUR",
    reference: "Invoice #42",
  });
  const headers = captured[0].init?.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  const body = JSON.parse(captured[0].init?.body as string);
  assert.equal(body.request_id, "r1");
  assert.equal(body.amount, 100);
  assert.equal(body.currency, "EUR");
});

test("RevolutClient: setupWebhook POSTs url + events", async () => {
  let seenBody = "";
  const client = new RevolutClient(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch((_url, init) => {
        seenBody = init?.body as string;
        return jsonResponse({ id: "w1" });
      }),
      backoffBaseMs: 1,
    },
  );
  await client.setupWebhook({
    url: "https://example.com/hook",
    events: ["TransactionCreated"],
  });
  const parsed = JSON.parse(seenBody);
  assert.equal(parsed.url, "https://example.com/hook");
  assert.deepEqual(parsed.events, ["TransactionCreated"]);
});

// ---------------------------------------------------------------------------
// 2) Pure parsers
// ---------------------------------------------------------------------------

test("projectRevolutTransaction: single-leg card payment maps to one row with negative amount", () => {
  const txn = {
    id: "t1",
    type: "card_payment",
    state: "completed",
    created_at: "2026-05-07T10:00:00Z",
    completed_at: "2026-05-07T10:00:01Z",
    reference: "POS",
    merchant: { name: "Coffee Bali", country: "ID" },
    legs: [
      {
        leg_id: "L1",
        account_id: "acct-1",
        amount: -3.5,
        currency: "EUR",
        description: "Coffee",
        balance: 100.0,
      },
    ],
  };
  const rows = projectRevolutTransaction(txn);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].externalTransactionId, "t1");
  assert.equal(rows[0].amountMinor, -350n);
  assert.equal(rows[0].currency, "EUR");
  assert.equal(rows[0].counterpartyCountry, "ID");
  assert.match(rows[0].description, /Coffee Bali/);
  assert.equal(rows[0].isPending, false);
});

test("projectRevolutTransaction: pending state propagates", () => {
  const txn = {
    id: "t-pend",
    state: "pending",
    created_at: "2026-05-07T10:00:00Z",
    legs: [{ leg_id: "L1", account_id: "a", amount: 5, currency: "USD" }],
  };
  const rows = projectRevolutTransaction(txn);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].isPending, true);
});

test("projectRevolutTransaction: multi-leg FX swap → 2 rows with unique IDs (id:leg_id)", () => {
  const txn = {
    id: "fx-1",
    type: "exchange",
    state: "completed",
    created_at: "2026-05-07T10:00:00Z",
    completed_at: "2026-05-07T10:00:01Z",
    legs: [
      { leg_id: "L_EUR", account_id: "acct-eur", amount: -100, currency: "EUR" },
      { leg_id: "L_USD", account_id: "acct-usd", amount: 108.5, currency: "USD" },
    ],
  };
  const rows = projectRevolutTransaction(txn);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].externalTransactionId, "fx-1:L_EUR");
  assert.equal(rows[1].externalTransactionId, "fx-1:L_USD");
  assert.equal(rows[0].amountMinor, -10000n);
  assert.equal(rows[1].amountMinor, 10850n);
});

test("projectRevolutTransaction: defaultAccountId filter keeps only matching legs", () => {
  const txn = {
    id: "fx-2",
    state: "completed",
    created_at: "2026-05-07T10:00:00Z",
    legs: [
      { leg_id: "L_EUR", account_id: "acct-eur", amount: -100, currency: "EUR" },
      { leg_id: "L_USD", account_id: "acct-usd", amount: 108, currency: "USD" },
    ],
  };
  const rows = projectRevolutTransaction(txn, {
    defaultAccountId: "acct-eur",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].externalTransactionId, "fx-2:L_EUR");
});

test("projectRevolutTransaction: bill_amount + bill_currency populate FX detail", () => {
  const txn = {
    id: "fx-3",
    state: "completed",
    created_at: "2026-05-07T10:00:00Z",
    legs: [
      {
        leg_id: "L1",
        account_id: "a",
        amount: -10800,
        currency: "USD",
        bill_amount: -10000,
        bill_currency: "EUR",
      },
    ],
  };
  const rows = projectRevolutTransaction(txn);
  assert.equal(rows[0].originalAmountMinor, -1000000n);
  assert.equal(rows[0].originalCurrency, "EUR");
  assert.ok(rows[0].fxRate);
  // amount/bill = 10800/10000 = 1.08
  assert.ok(Math.abs(rows[0].fxRate! - 1.08) < 0.0001);
});

test("projectRevolutTransaction: invalid date returns no rows", () => {
  const txn = {
    id: "bad",
    state: "completed",
    legs: [{ leg_id: "L1", account_id: "a", amount: 1, currency: "USD" }],
  };
  const rows = projectRevolutTransaction(txn as never);
  assert.equal(rows.length, 0);
});

test("projectRevolutTransaction: missing legs array returns empty", () => {
  const rows = projectRevolutTransaction({} as never);
  assert.equal(rows.length, 0);
});

test("projectRevolutTransactions: parses an array, counts malformed entries", () => {
  const body = JSON.stringify([
    {
      id: "t1",
      state: "completed",
      created_at: "2026-05-07T10:00:00Z",
      legs: [{ leg_id: "L1", account_id: "a", amount: 1, currency: "USD" }],
    },
    null,
    { id: "t2" /* no legs */ },
  ]);
  const result = projectRevolutTransactions(body);
  assert.equal(result.rows.length, 1);
  assert.equal(result.malformed, 2);
});

test("projectRevolutTransactions: non-JSON body returns empty + malformed=0", () => {
  const result = projectRevolutTransactions("garbage");
  assert.equal(result.rows.length, 0);
});

test("projectRevolutAccountBalance: balance + currency → minor units", () => {
  const out = projectRevolutAccountBalance(
    JSON.stringify({ balance: 1234.56, currency: "EUR" }),
  );
  assert.ok(out);
  assert.equal(out.availableMinor, 123456n);
  assert.equal(out.currency, "EUR");
});

test("projectRevolutAccountBalance: malformed body returns null", () => {
  assert.equal(projectRevolutAccountBalance("not json"), null);
  assert.equal(projectRevolutAccountBalance(JSON.stringify({})), null);
});

// ---------------------------------------------------------------------------
// 3) RevolutProvider — fetchTransactions / fetchBalance
// ---------------------------------------------------------------------------

test("RevolutProvider: fetchTransactions projects results, filters by accountId", async () => {
  const provider = new RevolutProvider(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch((_url) =>
        jsonResponse([
          {
            id: "t1",
            state: "completed",
            created_at: "2026-05-07T10:00:00Z",
            legs: [
              { leg_id: "L1", account_id: "acct-1", amount: 12.5, currency: "EUR" },
              { leg_id: "L2", account_id: "acct-2", amount: -12.5, currency: "EUR" },
            ],
          },
        ]),
      ),
      backoffBaseMs: 1,
    },
  );
  const result = await provider.fetchTransactions({
    externalAccountId: "acct-1",
    since: new Date("2026-05-01T00:00:00Z"),
  });
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].amountMinor, 1250n);
  assert.equal(result.hasMore, false);
});

test("RevolutProvider: fetchTransactions degrades to empty on non-2xx", async () => {
  const provider = new RevolutProvider(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch(
        () => new Response("nope", { status: 401 }),
      ),
      backoffBaseMs: 1,
    },
  );
  const result = await provider.fetchTransactions({
    externalAccountId: "acct-1",
    since: new Date(),
  });
  assert.deepEqual(result.transactions, []);
  assert.equal(result.hasMore, false);
});

test("RevolutProvider: fetchBalance maps balance + currency", async () => {
  const provider = new RevolutProvider(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch((url) => {
        assert.match(url, /\/accounts\/acct-1$/);
        return jsonResponse({ id: "acct-1", balance: 5000.0, currency: "USD" });
      }),
      backoffBaseMs: 1,
    },
  );
  const balance = await provider.fetchBalance("acct-1");
  assert.equal(balance.externalAccountId, "acct-1");
  assert.equal(balance.availableMinor, 500000n);
  assert.equal(balance.currency, "USD");
});

test("RevolutProvider: testConnection returns connected when accounts list 200s", async () => {
  const provider = new RevolutProvider(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch(() =>
        jsonResponse([{ id: "acct-1" }, { id: "acct-2" }]),
      ),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["accountsCount"], 2);
});

test("RevolutProvider: testConnection reports disconnected on 401", async () => {
  const provider = new RevolutProvider(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch(() => new Response("unauthorized", { status: 401 })),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.testConnection();
  assert.equal(r.connected, false);
});

test("RevolutProvider: initiatePayment requires toAccountId (counterparty)", async () => {
  const provider = new RevolutProvider(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      // Should never be called.
      fetch: mockFetch(() => {
        throw new Error("should not call when counterparty is missing");
      }),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.initiatePayment({
    fromAccountId: "src",
    amountMinor: 10000n,
    currency: "EUR",
    reference: "x",
  });
  assert.equal(r.externalPaymentId, "");
  assert.equal(r.status, "rejected_missing_counterparty");
});

test("RevolutProvider: initiatePayment converts minor units to decimal + returns external id", async () => {
  let seenAmount: number | undefined;
  const provider = new RevolutProvider(
    { provider: "revolut", apiKey: "k", environment: "sandbox" },
    {
      fetch: mockFetch((_url, init) => {
        const body = JSON.parse(init?.body as string);
        seenAmount = body.amount;
        return jsonResponse({
          id: "pay-1",
          state: "completed",
          request_id: body.request_id,
        });
      }),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.initiatePayment({
    fromAccountId: "src",
    toAccountId: "cp1",
    amountMinor: 12345n,
    currency: "EUR",
    reference: "Invoice #42",
  });
  assert.equal(seenAmount, 123.45);
  assert.equal(r.externalPaymentId, "pay-1");
  assert.equal(r.status, "completed");
});

// ---------------------------------------------------------------------------
// 4) Webhook verification
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "whsec_test_xxx";

function signRevolut(rawBody: string, ts: number) {
  const payload = `v1.${ts}.${rawBody}`;
  const sig = createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return `v1=${sig}`;
}

test("verifyRevolutSignature: valid signature with v1= prefix verifies", () => {
  const ts = Date.now();
  const body = '{"event":"TransactionStateChanged"}';
  const sig = signRevolut(body, ts);
  const payload = `v1.${ts}.${body}`;
  assert.equal(verifyRevolutSignature(payload, sig, WEBHOOK_SECRET), true);
});

test("verifyRevolutSignature: tampered body fails", () => {
  const ts = Date.now();
  const body = '{"event":"TransactionStateChanged"}';
  const sig = signRevolut(body, ts);
  const tamperedPayload = `v1.${ts}.{"event":"OTHER"}`;
  assert.equal(verifyRevolutSignature(tamperedPayload, sig, WEBHOOK_SECRET), false);
});

test("verifyRevolutSignature: empty secret or signature returns false", () => {
  assert.equal(verifyRevolutSignature("payload", "v1=abc", ""), false);
  assert.equal(verifyRevolutSignature("payload", "", "secret"), false);
});

test("verifyRevolutWebhook: in-window timestamp + valid signature → true", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  const ts = now.getTime() - 60_000; // 1 min ago
  const body = '{"x":1}';
  const sig = signRevolut(body, ts);
  assert.equal(
    verifyRevolutWebhook({
      rawBody: body,
      timestamp: ts,
      signature: sig,
      secret: WEBHOOK_SECRET,
      now,
    }),
    true,
  );
});

test("verifyRevolutWebhook: out-of-window timestamp rejects (replay protection)", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  const ts = now.getTime() - REVOLUT_REPLAY_WINDOW_MS - 60_000;
  const body = '{"x":1}';
  const sig = signRevolut(body, ts);
  assert.equal(
    verifyRevolutWebhook({
      rawBody: body,
      timestamp: ts,
      signature: sig,
      secret: WEBHOOK_SECRET,
      now,
    }),
    false,
  );
});

test("verifyRevolutWebhook: future timestamp beyond window rejects", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  const ts = now.getTime() + REVOLUT_REPLAY_WINDOW_MS + 60_000;
  const body = '{"x":1}';
  const sig = signRevolut(body, ts);
  assert.equal(
    verifyRevolutWebhook({
      rawBody: body,
      timestamp: ts,
      signature: sig,
      secret: WEBHOOK_SECRET,
      now,
    }),
    false,
  );
});

test("verifyRevolutWebhook: non-numeric timestamp rejects", () => {
  assert.equal(
    verifyRevolutWebhook({
      rawBody: "x",
      timestamp: "not-a-number",
      signature: "v1=abc",
      secret: "s",
    }),
    false,
  );
});

test("RevolutProvider.verifyWebhook: delegates to Revolut HMAC scheme (not the messaging sha256= scheme)", () => {
  const provider = new RevolutProvider({
    provider: "revolut",
    apiKey: "k",
    environment: "sandbox",
    webhookSecret: WEBHOOK_SECRET,
  });
  const ts = Date.now();
  const body = '{"event":"TransactionCreated"}';
  const payload = `v1.${ts}.${body}`;
  const sig = signRevolut(body, ts);
  // With explicit secret arg.
  assert.equal(provider.verifyWebhook(payload, sig, WEBHOOK_SECRET), true);
  // With empty secret arg → falls back to credentials.webhookSecret.
  assert.equal(provider.verifyWebhook(payload, sig, ""), true);
});

test("RevolutProvider.parseWebhook: TransactionStateChanged → projects transaction", () => {
  const provider = new RevolutProvider({
    provider: "revolut",
    apiKey: "k",
    environment: "sandbox",
  });
  const result = provider.parseWebhook({
    event: "TransactionStateChanged",
    data: {
      id: "t1",
      state: "completed",
      created_at: "2026-05-07T10:00:00Z",
      legs: [{ leg_id: "L1", account_id: "a", amount: 5, currency: "USD" }],
    },
  });
  assert.ok(result);
  assert.equal(result.eventType, "TransactionStateChanged");
  assert.ok(result.transaction);
  assert.equal(result.transaction.externalTransactionId, "t1");
});

test("RevolutProvider.parseWebhook: unknown event without transaction → eventType + raw, no transaction", () => {
  const provider = new RevolutProvider({
    provider: "revolut",
    apiKey: "k",
    environment: "sandbox",
  });
  const result = provider.parseWebhook({ event: "PayoutScheduled" });
  assert.ok(result);
  assert.equal(result.eventType, "PayoutScheduled");
  assert.equal(result.transaction, undefined);
});

// ---------------------------------------------------------------------------
// 5) Selector dispatch
// ---------------------------------------------------------------------------

test("selectBankProvider: revolut creds with provider='revolut' → RevolutProvider", () => {
  const creds: BankCredentials = {
    provider: "revolut",
    apiKey: "k",
    environment: "sandbox",
  };
  const provider = selectBankProvider("revolut", creds);
  assert.ok(provider instanceof RevolutProvider);
  assert.ok(!(provider instanceof DryRunBankProvider));
  assert.equal(provider.provider, "revolut");
});

test("selectBankProvider: revolut requested + non-revolut creds → DryRun", () => {
  const wrong: BankCredentials = {
    provider: "wise",
    apiToken: "x",
    profileId: "1",
    environment: "sandbox",
  };
  const provider = selectBankProvider("revolut", wrong);
  assert.ok(provider instanceof DryRunBankProvider);
});

test("selectBankProvider: revolut creds + null falls through to DryRun", () => {
  const provider = selectBankProvider("revolut", null);
  assert.ok(provider instanceof DryRunBankProvider);
});

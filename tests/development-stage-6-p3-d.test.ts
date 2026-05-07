/**
 * Stage 6.P3.D — Wise (TransferWise) provider tests.
 *
 * Pure-helper invariants + selector dispatch. Real HTTP via injected
 * mock fetch — same shape as the P3.C Revolut tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  selectBankProvider,
  DryRunBankProvider,
  type BankCredentials,
} from "../src/lib/banking";
import { WiseClient } from "../src/lib/banking/providers/wise/client";
import { WiseProvider } from "../src/lib/banking/providers/wise/provider";
import {
  projectWiseBalance,
  projectWiseStatement,
  projectWiseStatementRow,
} from "../src/lib/banking/providers/wise/parsers";

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

const SAMPLE_STATEMENT = {
  query: {
    intervalStart: "2026-05-01T00:00:00Z",
    intervalEnd: "2026-05-31T23:59:59Z",
    timezone: "UTC",
  },
  transactions: [
    {
      type: "CREDIT",
      date: "2026-05-07T10:00:00Z",
      amount: { value: 1500, currency: "EUR" },
      details: {
        description: "Salary May",
        senderName: "Acme Corp",
      },
      runningBalance: { value: 1500, currency: "EUR" },
      referenceNumber: "REF-001",
    },
    {
      type: "DEBIT",
      date: "2026-05-08T11:00:00Z",
      amount: { value: -250.5, currency: "EUR" },
      details: {
        description: "Vendor invoice",
        paymentReference: "INV-42",
      },
      referenceNumber: "REF-002",
    },
  ],
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

test("WiseClient: sandbox + production hosts route correctly", async () => {
  const seenSandbox: string[] = [];
  const seenProd: string[] = [];
  const sandbox = new WiseClient(
    {
      provider: "wise",
      apiToken: "t",
      profileId: "1",
      environment: "sandbox",
    },
    {
      fetch: mockFetch((url) => {
        seenSandbox.push(url);
        return jsonResponse([]);
      }),
      backoffBaseMs: 1,
    },
  );
  const prod = new WiseClient(
    {
      provider: "wise",
      apiToken: "t",
      profileId: "1",
      environment: "production",
    },
    {
      fetch: mockFetch((url) => {
        seenProd.push(url);
        return jsonResponse([]);
      }),
      backoffBaseMs: 1,
    },
  );
  await sandbox.listBalances();
  await prod.listBalances();
  assert.match(seenSandbox[0], /^https:\/\/api\.sandbox\.transferwise\.tech/);
  assert.match(seenProd[0], /^https:\/\/api\.wise\.com/);
});

test("WiseClient: every request carries Bearer token + Accept", async () => {
  const captured: { url: string; init?: RequestInit }[] = [];
  const c = new WiseClient(
    {
      provider: "wise",
      apiToken: "tok-xxx",
      profileId: "42",
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
  await c.listBalances();
  await c.listStatements({
    balanceId: 7,
    from: new Date("2026-05-01T00:00:00Z"),
    to: new Date("2026-05-31T23:59:59Z"),
  });
  for (const cap of captured) {
    const headers = cap.init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer tok-xxx");
    assert.equal(headers["Accept"], "application/json");
  }
});

test("WiseClient: listStatements sets intervalStart, intervalEnd, type", async () => {
  let seen = "";
  const c = new WiseClient(
    {
      provider: "wise",
      apiToken: "t",
      profileId: "42",
      environment: "sandbox",
    },
    {
      fetch: mockFetch((url) => {
        seen = url;
        return jsonResponse(SAMPLE_STATEMENT);
      }),
      backoffBaseMs: 1,
    },
  );
  await c.listStatements({
    balanceId: 7,
    from: new Date("2026-05-01T00:00:00Z"),
    to: new Date("2026-05-31T23:59:59Z"),
    statementType: "FLAT",
  });
  const url = new URL(seen);
  assert.equal(url.searchParams.get("intervalStart"), "2026-05-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("type"), "FLAT");
  assert.match(url.pathname, /\/profiles\/42\/balance-statements\/7\/statement\.json/);
});

test("WiseClient: createTransfer POSTs JSON with quoteUuid + customerTransactionId", async () => {
  let seenBody = "";
  const c = new WiseClient(
    {
      provider: "wise",
      apiToken: "t",
      profileId: "1",
      environment: "sandbox",
    },
    {
      fetch: mockFetch((_url, init) => {
        seenBody = init?.body as string;
        return jsonResponse({ id: 12345, status: "incoming_payment_waiting" });
      }),
      backoffBaseMs: 1,
    },
  );
  await c.createTransfer({
    targetAccount: 99,
    quoteUuid: "Q-1",
    customerTransactionId: "CTX-1",
    details: { reference: "Inv-42" },
  });
  const parsed = JSON.parse(seenBody);
  assert.equal(parsed.targetAccount, 99);
  assert.equal(parsed.quoteUuid, "Q-1");
  assert.equal(parsed.customerTransactionId, "CTX-1");
  assert.equal(parsed.details.reference, "Inv-42");
});

// ---------------------------------------------------------------------------
// Pure parsers
// ---------------------------------------------------------------------------

test("projectWiseStatementRow: signed amount preserved + description from details", () => {
  const r = projectWiseStatementRow({
    type: "DEBIT",
    date: "2026-05-08T11:00:00Z",
    amount: { value: -250.5, currency: "EUR" },
    details: { description: "Vendor invoice", paymentReference: "INV-42" },
    referenceNumber: "REF-002",
  });
  assert.ok(r);
  assert.equal(r.amountMinor, -25050n);
  assert.equal(r.currency, "EUR");
  assert.equal(r.externalTransactionId, "REF-002");
  assert.equal(r.externalReference, "INV-42");
  assert.match(r.description, /Vendor invoice/);
});

test("projectWiseStatementRow: missing referenceNumber → synthesized id", () => {
  const r = projectWiseStatementRow({
    type: "CREDIT",
    date: "2026-05-07T10:00:00Z",
    amount: { value: 100, currency: "USD" },
    details: { description: "x" },
  });
  assert.ok(r);
  assert.match(r.externalTransactionId, /^wise:2026-05-07/);
});

test("projectWiseStatementRow: invalid date returns null", () => {
  assert.equal(
    projectWiseStatementRow({
      type: "CREDIT",
      date: "not-a-date",
      amount: { value: 1, currency: "USD" },
      details: {},
    }),
    null,
  );
});

test("projectWiseStatement: end-to-end with a 2-row response + period range", () => {
  const r = projectWiseStatement(JSON.stringify(SAMPLE_STATEMENT));
  assert.equal(r.rows.length, 2);
  assert.equal(
    r.periodStart!.toISOString().slice(0, 10),
    "2026-05-01",
  );
  assert.equal(
    r.periodEnd!.toISOString().slice(0, 10),
    "2026-05-31",
  );
});

test("projectWiseStatement: malformed JSON returns empty", () => {
  const r = projectWiseStatement("not json");
  assert.equal(r.rows.length, 0);
});

test("projectWiseBalance: picks the matching currency wallet", () => {
  const body = JSON.stringify([
    { id: 1, currency: "USD", amount: { value: 100, currency: "USD" } },
    { id: 2, currency: "EUR", amount: { value: 250.5, currency: "EUR" } },
  ]);
  const r = projectWiseBalance(body, "EUR");
  assert.ok(r);
  assert.equal(r.availableMinor, 25050n);
  assert.equal(r.currency, "EUR");
});

test("projectWiseBalance: no matching currency → null", () => {
  const body = JSON.stringify([
    { id: 1, currency: "USD", amount: { value: 100, currency: "USD" } },
  ]);
  assert.equal(projectWiseBalance(body, "JPY"), null);
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

test("WiseProvider: fetchTransactions projects rows on success", async () => {
  const provider = new WiseProvider(
    { provider: "wise", apiToken: "t", profileId: "1", environment: "sandbox" },
    {
      fetch: mockFetch(() => jsonResponse(SAMPLE_STATEMENT)),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.fetchTransactions({
    externalAccountId: "7",
    since: new Date("2026-05-01T00:00:00Z"),
    until: new Date("2026-05-31T23:59:59Z"),
  });
  assert.equal(r.transactions.length, 2);
  assert.equal(r.hasMore, false);
});

test("WiseProvider: fetchTransactions degrades to empty on non-2xx", async () => {
  const provider = new WiseProvider(
    { provider: "wise", apiToken: "t", profileId: "1", environment: "sandbox" },
    {
      fetch: mockFetch(() => new Response("nope", { status: 401 })),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.fetchTransactions({
    externalAccountId: "7",
    since: new Date(),
  });
  assert.deepEqual(r.transactions, []);
});

test("WiseProvider: testConnection reports balanceCount on success", async () => {
  const provider = new WiseProvider(
    { provider: "wise", apiToken: "t", profileId: "1", environment: "sandbox" },
    {
      fetch: mockFetch(() =>
        jsonResponse([
          { id: 1, currency: "USD", amount: { value: 100, currency: "USD" } },
          { id: 2, currency: "EUR", amount: { value: 250, currency: "EUR" } },
        ]),
      ),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["balanceCount"], 2);
});

test("WiseProvider: initiatePayment requires toAccountId", async () => {
  const provider = new WiseProvider(
    { provider: "wise", apiToken: "t", profileId: "1", environment: "sandbox" },
    { fetch: mockFetch(() => jsonResponse({})), backoffBaseMs: 1 },
  );
  const r = await provider.initiatePayment({
    fromAccountId: "src",
    amountMinor: 10000n,
    currency: "EUR",
    reference: "x",
  });
  assert.equal(r.status, "rejected_missing_recipient");
});

test("WiseProvider: verifyWebhook fail-closes (RSA wiring deferred)", () => {
  const provider = new WiseProvider({
    provider: "wise",
    apiToken: "t",
    profileId: "1",
    environment: "sandbox",
  });
  assert.equal(provider.verifyWebhook("payload", "sig", "secret"), false);
});

test("WiseProvider: parseWebhook surfaces eventType + raw", () => {
  const provider = new WiseProvider({
    provider: "wise",
    apiToken: "t",
    profileId: "1",
    environment: "sandbox",
  });
  const out = provider.parseWebhook({ event_type: "transfers#state-change" });
  assert.ok(out);
  assert.equal(out.eventType, "transfers#state-change");
});

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

test("selectBankProvider: wise creds → WiseProvider; mismatch → DryRun", () => {
  const ok: BankCredentials = {
    provider: "wise",
    apiToken: "t",
    profileId: "1",
    environment: "sandbox",
  };
  const provider = selectBankProvider("wise", ok);
  assert.ok(provider instanceof WiseProvider);

  const wrong: BankCredentials = {
    provider: "revolut",
    apiKey: "k",
    environment: "sandbox",
  };
  assert.ok(selectBankProvider("wise", wrong) instanceof DryRunBankProvider);
});

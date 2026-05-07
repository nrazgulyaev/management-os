/**
 * Stage 6.P3.F — Stripe payment-processor tests.
 *
 * Covers form-encoding, client auth + content-type, signature
 * verification with replay protection, intent projection, event →
 * lifecycle mapping, selector dispatch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  selectPaymentProvider,
  DryRunPaymentProvider,
  type PaymentCredentials,
} from "../src/lib/payment-processors";
import { stripeFormEncode } from "../src/lib/payment-processors/providers/stripe/form-encode";
import { StripeClient } from "../src/lib/payment-processors/providers/stripe/client";
import {
  StripeProvider,
  STRIPE_REPLAY_WINDOW_MS,
  projectStripeIntent,
  stripeEventToLifecycle,
  verifyStripeSignature,
} from "../src/lib/payment-processors/providers/stripe/provider";

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
// stripeFormEncode
// ---------------------------------------------------------------------------

test("stripeFormEncode: scalar values url-encoded", () => {
  assert.equal(stripeFormEncode({ amount: 1000 }), "amount=1000");
  assert.equal(stripeFormEncode({ description: "Hello world" }), "description=Hello%20world");
});

test("stripeFormEncode: nested objects use bracket syntax", () => {
  assert.equal(
    stripeFormEncode({ metadata: { order_id: "42" } }),
    "metadata%5Border_id%5D=42",
  );
});

test("stripeFormEncode: arrays of objects emit indexed keys", () => {
  const out = stripeFormEncode({
    line_items: [
      { price_data: { currency: "usd" }, quantity: 1 },
    ],
  });
  // line_items[0][price_data][currency]=usd&line_items[0][quantity]=1
  assert.match(out, /line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd/);
  assert.match(out, /line_items%5B0%5D%5Bquantity%5D=1/);
});

test("stripeFormEncode: null + undefined values are skipped (not zeroed)", () => {
  const out = stripeFormEncode({ a: 1, b: null, c: undefined });
  assert.equal(out, "a=1");
});

test("stripeFormEncode: empty array emits empty value (Stripe clear-list semantics)", () => {
  assert.equal(stripeFormEncode({ items: [] }), "items=");
});

test("stripeFormEncode: booleans serialize as 'true'/'false'", () => {
  assert.equal(
    stripeFormEncode({ enabled: true, disabled: false }),
    "enabled=true&disabled=false",
  );
});

test("stripeFormEncode: Date → unix seconds", () => {
  const d = new Date("2026-05-07T00:00:00Z");
  assert.equal(stripeFormEncode({ at: d }), `at=${Math.floor(d.getTime() / 1000)}`);
});

test("stripeFormEncode: bigint serializes (no scientific notation)", () => {
  assert.equal(stripeFormEncode({ amount: 1234n }), "amount=1234");
});

// ---------------------------------------------------------------------------
// StripeClient
// ---------------------------------------------------------------------------

test("StripeClient: every request carries Bearer + form-urlencoded", async () => {
  const captured: { url: string; init?: RequestInit }[] = [];
  const c = new StripeClient(
    {
      provider: "stripe",
      secretKey: "sk_test_xxx",
      publishableKey: "pk_test_x",
      webhookSecret: "whsec_x",
      mode: "test",
    },
    {
      fetch: mockFetch((url, init) => {
        captured.push({ url, init });
        return jsonResponse({ id: "pi_x", status: "requires_payment_method" });
      }),
      backoffBaseMs: 1,
    },
  );
  await c.createPaymentIntent({ amount: 1000, currency: "usd" });
  await c.retrievePaymentIntent("pi_x");
  for (const cap of captured) {
    const headers = cap.init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer sk_test_xxx");
    assert.equal(headers["Content-Type"], "application/x-www-form-urlencoded");
  }
});

test("StripeClient: createPaymentIntent body shape via stripeFormEncode", async () => {
  let seenBody = "";
  const c = new StripeClient(
    {
      provider: "stripe",
      secretKey: "sk_test_x",
      publishableKey: "pk",
      webhookSecret: "w",
      mode: "test",
    },
    {
      fetch: mockFetch((_url, init) => {
        seenBody = init?.body as string;
        return jsonResponse({ id: "pi_1", status: "requires_payment_method" });
      }),
      backoffBaseMs: 1,
    },
  );
  await c.createPaymentIntent({
    amount: 12345,
    currency: "usd",
    metadata: { order_id: "42" },
  });
  assert.match(seenBody, /amount=12345/);
  assert.match(seenBody, /currency=usd/);
  assert.match(seenBody, /metadata%5Border_id%5D=42/);
});

test("StripeClient: account ID adds Stripe-Account header", async () => {
  let seenHeaders: Record<string, string> = {};
  const c = new StripeClient(
    {
      provider: "stripe",
      secretKey: "sk",
      publishableKey: "pk",
      webhookSecret: "w",
      accountId: "acct_999",
      mode: "test",
    },
    {
      fetch: mockFetch((_url, init) => {
        seenHeaders = init?.headers as Record<string, string>;
        return jsonResponse({});
      }),
      backoffBaseMs: 1,
    },
  );
  await c.getAccount();
  assert.equal(seenHeaders["Stripe-Account"], "acct_999");
});

// ---------------------------------------------------------------------------
// projectStripeIntent + lifecycle mapping
// ---------------------------------------------------------------------------

test("projectStripeIntent: maps id, status, amount, currency, client_secret", () => {
  const out = projectStripeIntent({
    id: "pi_test_1",
    status: "requires_action",
    amount: 12345,
    currency: "usd",
    client_secret: "pi_test_1_secret_x",
  });
  assert.equal(out.externalIntentId, "pi_test_1");
  assert.equal(out.status, "requires_action");
  assert.equal(out.amountMinor, 12345n);
  assert.equal(out.currency, "USD");
  assert.equal(out.clientSecret, "pi_test_1_secret_x");
});

test("stripeEventToLifecycle: payment_intent.succeeded → succeeded", () => {
  assert.equal(
    stripeEventToLifecycle("payment_intent.succeeded", null),
    "succeeded",
  );
});

test("stripeEventToLifecycle: payment_intent.canceled → cancelled", () => {
  assert.equal(
    stripeEventToLifecycle("payment_intent.canceled", null),
    "cancelled",
  );
});

test("stripeEventToLifecycle: payment_intent.payment_failed → failed", () => {
  assert.equal(
    stripeEventToLifecycle("payment_intent.payment_failed", null),
    "failed",
  );
});

test("stripeEventToLifecycle: charge.refunded → refunded", () => {
  assert.equal(stripeEventToLifecycle("charge.refunded", null), "refunded");
});

test("stripeEventToLifecycle: refund.* → refunded", () => {
  assert.equal(stripeEventToLifecycle("refund.created", null), "refunded");
  assert.equal(stripeEventToLifecycle("refund.updated", null), "refunded");
});

test("stripeEventToLifecycle: falls back to obj.status when event type unknown", () => {
  assert.equal(
    stripeEventToLifecycle("payment_intent.amount_capturable_updated", {
      status: "processing",
    }),
    "processing",
  );
});

// ---------------------------------------------------------------------------
// Stripe signature verification
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "whsec_test_xxx";

function signStripe(rawBody: string, ts: number): string {
  const signed = `${ts}.${rawBody}`;
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(signed).digest("hex");
  return `t=${ts},v1=${sig}`;
}

test("verifyStripeSignature: valid header in window verifies", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  const ts = Math.floor(now.getTime() / 1000) - 30;
  const body = '{"id":"evt_x","type":"payment_intent.succeeded"}';
  const header = signStripe(body, ts);
  assert.equal(
    verifyStripeSignature({
      rawBody: body,
      signatureHeader: header,
      secret: WEBHOOK_SECRET,
      now,
    }),
    true,
  );
});

test("verifyStripeSignature: tampered body fails", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  const ts = Math.floor(now.getTime() / 1000) - 30;
  const body = '{"id":"evt_x"}';
  const header = signStripe(body, ts);
  assert.equal(
    verifyStripeSignature({
      rawBody: '{"id":"evt_y"}',
      signatureHeader: header,
      secret: WEBHOOK_SECRET,
      now,
    }),
    false,
  );
});

test("verifyStripeSignature: out-of-window timestamp rejects (replay protection)", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  const ts = Math.floor(now.getTime() / 1000) - STRIPE_REPLAY_WINDOW_MS / 1000 - 60;
  const body = '{"id":"evt_x"}';
  const header = signStripe(body, ts);
  assert.equal(
    verifyStripeSignature({
      rawBody: body,
      signatureHeader: header,
      secret: WEBHOOK_SECRET,
      now,
    }),
    false,
  );
});

test("verifyStripeSignature: empty secret/header/body returns false", () => {
  assert.equal(
    verifyStripeSignature({ rawBody: "x", signatureHeader: "y", secret: "" }),
    false,
  );
  assert.equal(
    verifyStripeSignature({ rawBody: "", signatureHeader: "y", secret: "s" }),
    false,
  );
  assert.equal(
    verifyStripeSignature({ rawBody: "x", signatureHeader: "", secret: "s" }),
    false,
  );
});

test("verifyStripeSignature: multiple v1 candidates — any match wins (rotation support)", () => {
  const now = new Date("2026-05-07T12:00:00Z");
  const ts = Math.floor(now.getTime() / 1000) - 30;
  const body = '{"id":"evt_x"}';
  const validSig = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${ts}.${body}`)
    .digest("hex");
  const wrongSig = "0".repeat(validSig.length);
  const header = `t=${ts},v1=${wrongSig},v1=${validSig}`;
  assert.equal(
    verifyStripeSignature({
      rawBody: body,
      signatureHeader: header,
      secret: WEBHOOK_SECRET,
      now,
    }),
    true,
  );
});

// ---------------------------------------------------------------------------
// StripeProvider (high-level)
// ---------------------------------------------------------------------------

test("StripeProvider: createPaymentIntent returns external id + clientSecret", async () => {
  const provider = new StripeProvider(
    {
      provider: "stripe",
      secretKey: "sk_test_x",
      publishableKey: "pk",
      webhookSecret: "whsec_x",
      mode: "test",
    },
    {
      fetch: mockFetch(() =>
        jsonResponse({
          id: "pi_test_1",
          status: "requires_payment_method",
          amount: 1000,
          currency: "usd",
          client_secret: "pi_test_1_secret_x",
        }),
      ),
      backoffBaseMs: 1,
    },
  );
  const out = await provider.createPaymentIntent({
    amountMinor: 1000n,
    currency: "USD",
    purpose: "reservation_deposit",
    description: "Villa hold",
  });
  assert.equal(out.externalIntentId, "pi_test_1");
  assert.equal(out.amountMinor, 1000n);
  assert.equal(out.currency, "USD");
  assert.equal(out.clientSecret, "pi_test_1_secret_x");
});

test("StripeProvider: testConnection 200 → connected with accountId + livemode", async () => {
  const provider = new StripeProvider(
    {
      provider: "stripe",
      secretKey: "sk_live_x",
      publishableKey: "pk_live_x",
      webhookSecret: "w",
      mode: "live",
    },
    {
      fetch: mockFetch(() =>
        jsonResponse({ id: "acct_xxx", livemode: true }),
      ),
      backoffBaseMs: 1,
    },
  );
  const r = await provider.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details["accountId"], "acct_xxx");
  assert.equal(r.details["livemode"], true);
  assert.equal(r.details["mode"], "live");
});

test("StripeProvider: parseWebhook surfaces eventType + lifecycleState mapping", () => {
  const provider = new StripeProvider({
    provider: "stripe",
    secretKey: "sk",
    publishableKey: "pk",
    webhookSecret: "w",
    mode: "test",
  });
  const out = provider.parseWebhook({
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_x", status: "succeeded" } },
  });
  assert.ok(out);
  assert.equal(out.eventType, "payment_intent.succeeded");
  assert.equal(out.externalIntentId, "pi_x");
  assert.equal(out.lifecycleState, "succeeded");
});

test("StripeProvider: capabilities surface includes refunds + payouts", () => {
  const provider = new StripeProvider({
    provider: "stripe",
    secretKey: "sk",
    publishableKey: "pk",
    webhookSecret: "w",
    mode: "test",
  });
  assert.ok(provider.capabilities!.includes("refunds"));
  assert.ok(provider.capabilities!.includes("payouts"));
  assert.ok(provider.capabilities!.includes("card_payments"));
});

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

test("selectPaymentProvider: stripe creds → StripeProvider", () => {
  const creds: PaymentCredentials = {
    provider: "stripe",
    secretKey: "sk_test_x",
    publishableKey: "pk_test_x",
    webhookSecret: "whsec_x",
    mode: "test",
  };
  const p = selectPaymentProvider("stripe", creds);
  assert.ok(p instanceof StripeProvider);
});

test("selectPaymentProvider: stripe + paypal creds → DryRun (mismatch)", () => {
  const wrong: PaymentCredentials = {
    provider: "paypal",
    clientId: "c",
    clientSecret: "s",
    mode: "test",
  };
  assert.ok(selectPaymentProvider("stripe", wrong) instanceof DryRunPaymentProvider);
});

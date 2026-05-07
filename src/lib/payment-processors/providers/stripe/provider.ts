/**
 * Stage 6.P3.F — Stripe `PaymentProviderInterface` adapter.
 *
 * Webhook signing — Stripe sends:
 *
 *   Stripe-Signature: t=<unix>,v1=<hex>,v0=<hex-deprecated>
 *
 * Verification:
 *   1. Parse `t=` (timestamp) + `v1=` (current scheme).
 *   2. Compute HMAC-SHA256(secret, "<t>.<rawBody>") in hex.
 *   3. Constant-time compare with `v1`.
 *   4. Reject when timestamp is outside ±5 minutes (replay window).
 *
 * Stripe lets you check multiple `v1=` values per header (during
 * secret rotation); we accept any that matches.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ConnectionTestResult,
  CreatePaymentIntentInput,
  PaymentCapability,
  PaymentIntent,
  PaymentLifecycleState,
  PaymentProviderInterface,
  PaymentProviderName,
  PaymentWebhookEvent,
  RefundInput,
  RefundResult,
  StripeCredentials,
} from "../../types";
import { StripeClient, type StripeClientOptions } from "./client";

const PROVIDER: PaymentProviderName = "stripe";
export const STRIPE_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export class StripeProvider implements PaymentProviderInterface {
  readonly provider: PaymentProviderName = PROVIDER;
  readonly capabilities: readonly PaymentCapability[] = [
    "card_payments",
    "bank_transfers",
    "recurring",
    "refunds",
    "payouts",
  ];
  private readonly client: StripeClient;
  private readonly creds: StripeCredentials;

  constructor(credentials: StripeCredentials, opts: StripeClientOptions = {}) {
    this.client = new StripeClient(credentials, opts);
    this.creds = credentials;
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntent> {
    // Stripe expects amount as integer minor units; we already store
    // bigint minor units, so convert to number (safe for ≤ Number.MAX_SAFE_INTEGER).
    const amount = Number(input.amountMinor);
    const metadata: Record<string, string> = {
      ...(input.metadata ?? {}),
      purpose: input.purpose,
    };
    if (input.linkedReservationId)
      metadata["linked_reservation_id"] = input.linkedReservationId;
    if (input.linkedInvoiceId)
      metadata["linked_invoice_id"] = input.linkedInvoiceId;
    if (input.linkedInvestorId)
      metadata["linked_investor_id"] = input.linkedInvestorId;
    if (input.linkedBuyerId)
      metadata["linked_buyer_id"] = input.linkedBuyerId;
    if (input.linkedVendorId)
      metadata["linked_vendor_id"] = input.linkedVendorId;

    const result = await this.client.createPaymentIntent({
      amount,
      currency: input.currency.toLowerCase(),
      description: input.description,
      receipt_email: input.customerEmail,
      automatic_payment_methods: { enabled: true },
      metadata,
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Stripe createPaymentIntent failed: HTTP ${result.status}: ${truncate(result.body, 240)}`,
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.body) as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `Stripe response not JSON: ${err instanceof Error ? err.message : err}`,
      );
    }
    return projectStripeIntent(parsed);
  }

  async retrievePaymentIntent(externalIntentId: string): Promise<PaymentIntent> {
    const result = await this.client.retrievePaymentIntent(externalIntentId);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Stripe retrievePaymentIntent failed: HTTP ${result.status}`,
      );
    }
    const parsed = JSON.parse(result.body) as Record<string, unknown>;
    return projectStripeIntent(parsed);
  }

  async cancelPaymentIntent(
    externalIntentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.client.cancelPaymentIntent(externalIntentId);
    if (result.status >= 200 && result.status < 300) return { success: true };
    return {
      success: false,
      error: `HTTP ${result.status}: ${truncate(result.body, 240)}`,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const body: Record<string, unknown> = {
      payment_intent: input.externalIntentId,
    };
    if (input.amountMinor != null) body.amount = Number(input.amountMinor);
    if (input.reason) body.reason = input.reason;
    const result = await this.client.createRefund(body as never);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Stripe refund failed: HTTP ${result.status}: ${truncate(result.body, 240)}`,
      );
    }
    const parsed = JSON.parse(result.body) as Record<string, unknown>;
    return {
      externalRefundId: typeof parsed["id"] === "string" ? parsed["id"] : "",
      status: typeof parsed["status"] === "string" ? parsed["status"] : "unknown",
    };
  }

  /**
   * Stripe scheme: header is `t=<unix>,v1=<hex>[,v1=<hex2>]`. Caller
   * passes the raw header value as `signature` and the raw request
   * body as `payload`. Replay protection is enforced.
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    const key = secret || this.creds.webhookSecret || "";
    return verifyStripeSignature({
      rawBody: payload,
      signatureHeader: signature,
      secret: key,
    });
  }

  parseWebhook(payload: Record<string, unknown>): PaymentWebhookEvent | null {
    const eventType =
      typeof payload["type"] === "string" ? (payload["type"] as string) : "";
    const data =
      typeof payload["data"] === "object" && payload["data"]
        ? (payload["data"] as Record<string, unknown>)
        : null;
    const obj =
      data && typeof data["object"] === "object" && data["object"]
        ? (data["object"] as Record<string, unknown>)
        : null;
    const externalIntentId =
      obj && typeof obj["id"] === "string" ? (obj["id"] as string) : undefined;
    const lifecycleState = stripeEventToLifecycle(eventType, obj);
    return {
      eventType,
      externalIntentId,
      lifecycleState,
      raw: payload,
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.client.getAccount();
    let accountId: string | undefined;
    let livemode: boolean | undefined;
    if (result.status >= 200 && result.status < 300) {
      try {
        const parsed = JSON.parse(result.body) as Record<string, unknown>;
        if (typeof parsed["id"] === "string") accountId = parsed["id"];
        if (typeof parsed["livemode"] === "boolean")
          livemode = parsed["livemode"] as boolean;
      } catch {
        // ignore
      }
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        mode: this.creds.mode,
        status: result.status,
        accountId,
        livemode,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function projectStripeIntent(
  raw: Record<string, unknown>,
): PaymentIntent {
  return {
    externalIntentId:
      typeof raw["id"] === "string" ? (raw["id"] as string) : "",
    status: typeof raw["status"] === "string" ? (raw["status"] as string) : "unknown",
    amountMinor:
      typeof raw["amount"] === "number" ? BigInt(raw["amount"] as number) : 0n,
    currency:
      typeof raw["currency"] === "string"
        ? (raw["currency"] as string).toUpperCase()
        : "USD",
    clientSecret:
      typeof raw["client_secret"] === "string"
        ? (raw["client_secret"] as string)
        : undefined,
    rawPayload: raw,
  };
}

export function stripeEventToLifecycle(
  eventType: string,
  obj: Record<string, unknown> | null,
): PaymentLifecycleState | undefined {
  // payment_intent.* events drive most of the FSM; charge.refunded
  // and refund.* events drive the refunded state.
  if (eventType === "payment_intent.succeeded") return "succeeded";
  if (eventType === "payment_intent.canceled") return "cancelled";
  if (eventType === "payment_intent.payment_failed") return "failed";
  if (eventType === "payment_intent.requires_action") return "requires_action";
  if (eventType === "payment_intent.processing") return "processing";
  if (eventType === "payment_intent.created") return "created";
  if (
    eventType === "charge.refunded" ||
    eventType.startsWith("refund.") ||
    eventType === "payment_intent.refunded"
  ) {
    return "refunded";
  }
  if (obj && typeof obj["status"] === "string") {
    const s = obj["status"] as string;
    if (s === "succeeded") return "succeeded";
    if (s === "canceled") return "cancelled";
    if (s === "processing") return "processing";
    if (s === "requires_action") return "requires_action";
    if (s === "requires_payment_method") return "failed";
  }
  return undefined;
}

/**
 * Verify a Stripe-Signature header. Implements the v1 scheme +
 * replay protection. Returns false (does not throw) on any failure.
 */
export function verifyStripeSignature(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  /** Tolerance window in ms — defaults to 5 minutes. */
  toleranceMs?: number;
  /** Override `Date.now()` for tests. */
  now?: Date;
}): boolean {
  if (!input.secret || !input.signatureHeader || !input.rawBody) return false;

  // Header format: "t=...,v1=...,v1=...,v0=..."
  const parts = input.signatureHeader.split(",").map((p) => p.trim());
  let timestamp: number | undefined;
  const v1Sigs: string[] = [];
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const key = p.slice(0, idx);
    const value = p.slice(idx + 1);
    if (key === "t") {
      const n = Number(value);
      if (Number.isFinite(n)) timestamp = n;
    } else if (key === "v1") {
      v1Sigs.push(value);
    }
  }
  if (!timestamp || v1Sigs.length === 0) return false;

  const now = input.now?.getTime() ?? Date.now();
  const tolerance = input.toleranceMs ?? STRIPE_REPLAY_WINDOW_MS;
  // Stripe timestamps are in seconds (unix), not ms.
  const tsMs = timestamp * 1000;
  if (Math.abs(now - tsMs) > tolerance) return false;

  const signedPayload = `${timestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", input.secret)
    .update(signedPayload)
    .digest("hex");

  for (const candidate of v1Sigs) {
    if (candidate.length !== expected.length) continue;
    try {
      if (
        timingSafeEqual(
          Buffer.from(candidate, "utf8"),
          Buffer.from(expected, "utf8"),
        )
      ) {
        return true;
      }
    } catch {
      // length mismatch — already filtered above; ignore
    }
  }
  return false;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

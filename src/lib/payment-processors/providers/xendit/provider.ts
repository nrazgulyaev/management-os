/**
 * Xendit `PaymentProviderInterface` adapter — the first Indonesia-local
 * rail (founder's rule: Xendit for QRIS / e-wallets / Virtual Accounts;
 * Stripe is international-only and NOT wired for org money).
 *
 * Surface choice: the Invoice API. One POST returns a hosted checkout
 * (`invoice_url`) that offers every payment channel enabled on the
 * Xendit account — QRIS, OVO/DANA/LinkAja e-wallets, bank Virtual
 * Accounts, cards, retail outlets — so a single integration covers all
 * methods. Caveat (verified honest): which channels actually render on
 * the checkout depends on the Xendit account's activated channels and
 * the invoice currency (QRIS / e-wallets / VAs are IDR-only).
 *
 * Webhook verification: Xendit does NOT sign payloads. Every callback
 * carries the account's static "callback verification token" in the
 * `x-callback-token` header; verification is a constant-time equality
 * check against the per-org stored token. Fail-closed when either side
 * is missing.
 *
 * Refunds: NOT implemented yet — `refund()` throws an honest
 * not-supported error instead of pretending (Xendit refund coverage is
 * per-channel and needs its own design pass).
 *
 * Money: this codebase stores ALL currencies as bigint minor units with
 * a fixed 2-digit storage exponent (see src/lib/money.ts). Xendit's
 * `amount` is in major units, so we divide/multiply by 100 at the edge.
 */

import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
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
  XenditCredentials,
} from "../../types";
import { XenditClient, type XenditClientOptions } from "./client";

const PROVIDER: PaymentProviderName = "xendit";

/** Storage exponent shared with src/lib/money.ts (all currencies). */
const STORAGE_FRACTION_DIGITS = 2;

export class XenditProvider implements PaymentProviderInterface {
  readonly provider: PaymentProviderName = PROVIDER;
  /** Hosted invoice covers cards + bank (VA) channels; QRIS/e-wallets
   *  have no dedicated capability tag in the shared enum. */
  readonly capabilities: readonly PaymentCapability[] = [
    "card_payments",
    "bank_transfers",
  ];
  private readonly client: XenditClient;
  private readonly creds: XenditCredentials;

  constructor(credentials: XenditCredentials, opts: XenditClientOptions = {}) {
    this.client = new XenditClient(credentials, opts);
    this.creds = credentials;
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntent> {
    const metadata: Record<string, string> = {
      ...(input.metadata ?? {}),
      purpose: input.purpose,
    };
    if (input.linkedBuyerId) metadata["linked_buyer_id"] = input.linkedBuyerId;
    if (input.linkedInvoiceId)
      metadata["linked_invoice_id"] = input.linkedInvoiceId;
    if (input.linkedReservationId)
      metadata["linked_reservation_id"] = input.linkedReservationId;

    const externalId =
      input.metadata?.["externalRef"] ?? `apsi_${randomUUID()}`;

    const result = await this.client.createInvoice({
      external_id: externalId,
      amount: minorToMajor(input.amountMinor),
      currency: input.currency.toUpperCase(),
      description: input.description,
      payer_email: input.customerEmail,
      success_redirect_url: input.successUrl,
      failure_redirect_url: input.cancelUrl,
      metadata,
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Xendit createInvoice failed: HTTP ${result.status}: ${truncate(result.body, 240)}`,
      );
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.body) as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `Xendit response not JSON: ${err instanceof Error ? err.message : err}`,
      );
    }
    return projectXenditInvoice(parsed);
  }

  async retrievePaymentIntent(
    externalIntentId: string,
  ): Promise<PaymentIntent> {
    const result = await this.client.getInvoice(externalIntentId);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Xendit getInvoice failed: HTTP ${result.status}: ${truncate(result.body, 240)}`,
      );
    }
    const parsed = JSON.parse(result.body) as Record<string, unknown>;
    return projectXenditInvoice(parsed);
  }

  /** "Cancel" for a Xendit invoice is expiry. */
  async cancelPaymentIntent(
    externalIntentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.client.expireInvoice(externalIntentId);
    if (result.status >= 200 && result.status < 300) return { success: true };
    return {
      success: false,
      error: `HTTP ${result.status}: ${truncate(result.body, 240)}`,
    };
  }

  /** Honest not-supported-yet stub — never pretends a refund happened. */
  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error(
      "Xendit refunds are not implemented yet. Issue the refund from the Xendit dashboard and reconcile it here manually.",
    );
  }

  /**
   * Xendit webhook auth: the `x-callback-token` header must equal the
   * account's callback verification token. The route passes the header
   * value as `signature`; `secret` is the per-org stored token (falls
   * back to the credentials' token). Constant-time compare, fail-closed.
   */
  verifyWebhook(_payload: string, signature: string, secret: string): boolean {
    const expected = secret || this.creds.callbackToken || "";
    if (!expected || !signature) return false;
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  parseWebhook(payload: Record<string, unknown>): PaymentWebhookEvent | null {
    // Invoice callback payload is the invoice object itself:
    // { id, external_id, status: "PAID" | "EXPIRED", paid_amount, ... }
    const id = typeof payload["id"] === "string" ? payload["id"] : undefined;
    const status =
      typeof payload["status"] === "string"
        ? (payload["status"] as string).toUpperCase()
        : "";
    if (!id || !status) return null;
    return {
      eventType: `invoice.${status.toLowerCase()}`,
      externalIntentId: id,
      lifecycleState: xenditInvoiceStatusToLifecycle(status),
      raw: payload,
    };
  }

  /** Cheap real call — GET /balance proves the secret key works. */
  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.client.getBalance();
    let balance: number | undefined;
    if (result.status >= 200 && result.status < 300) {
      try {
        const parsed = JSON.parse(result.body) as Record<string, unknown>;
        if (typeof parsed["balance"] === "number")
          balance = parsed["balance"] as number;
      } catch {
        // ignore — connectivity already proven by the 2xx
      }
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        mode: this.creds.mode,
        status: result.status,
        balance,
        endpoint: "/balance",
        ...(result.status === 401 || result.status === 403
          ? { error: "Xendit rejected the secret key (check key + mode)." }
          : {}),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function minorToMajor(amountMinor: bigint): number {
  return Number(amountMinor) / 10 ** STORAGE_FRACTION_DIGITS;
}

export function majorToMinor(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** STORAGE_FRACTION_DIGITS));
}

export function projectXenditInvoice(
  raw: Record<string, unknown>,
): PaymentIntent {
  const amount =
    typeof raw["amount"] === "number" ? (raw["amount"] as number) : 0;
  return {
    externalIntentId: typeof raw["id"] === "string" ? (raw["id"] as string) : "",
    status:
      typeof raw["status"] === "string"
        ? (raw["status"] as string)
        : "unknown",
    amountMinor: majorToMinor(amount),
    currency:
      typeof raw["currency"] === "string"
        ? (raw["currency"] as string).toUpperCase()
        : "IDR",
    paymentUrl:
      typeof raw["invoice_url"] === "string"
        ? (raw["invoice_url"] as string)
        : undefined,
    rawPayload: raw,
  };
}

export function xenditInvoiceStatusToLifecycle(
  status: string,
): PaymentLifecycleState | undefined {
  switch (status.toUpperCase()) {
    case "PAID":
    case "SETTLED":
      return "succeeded";
    case "EXPIRED":
      return "cancelled";
    case "PENDING":
      return "processing";
    default:
      return undefined;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

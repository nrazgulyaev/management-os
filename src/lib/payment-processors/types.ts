/**
 * Stage 6.P3.A — Payment processor types.
 *
 * Single `PaymentProviderInterface` every processor implementation
 * (Stripe, Wise Payments, PayPal, manual, DryRun) conforms to. Mirrors
 * the proven Stage 3.A AI-provider / Stage 6.P1.A channel-manager /
 * Stage 6.P2.A messaging / Stage 6.P3.A bank provider pattern.
 *
 * Lives in `lib/payment-processors/` (not `lib/payments/`) to avoid
 * colliding with the existing direct-booking deposit module which
 * occupies `lib/payments/`. Both surfaces will coexist; P3.G's
 * reconciliation engine bridges direct-booking deposits into the new
 * `payment_intents` table.
 *
 * Pure types — no DB, no `import "server-only"`. Importable from
 * client code (UI types) and tests.
 */

import type {
  PaymentCapability,
  PaymentLifecycleState,
  PaymentMode,
  PaymentProviderName,
  PaymentPurpose,
} from "@/lib/db/schema/payment-processors";

// Re-export so downstream importers don't need a schema dep.
export type {
  PaymentCapability,
  PaymentLifecycleState,
  PaymentMode,
  PaymentProviderName,
  PaymentPurpose,
};

// ---------------------------------------------------------------------------
// Credentials — discriminated union per provider
// ---------------------------------------------------------------------------

export interface StripeCredentials {
  provider: "stripe";
  /** sk_live_... or sk_test_... */
  secretKey: string;
  publishableKey: string;
  /** Endpoint signing secret (whsec_...). Used by verifyWebhook. */
  webhookSecret: string;
  /** Stripe Connect account ID, when on-behalf-of. */
  accountId?: string;
  mode: PaymentMode;
}

export interface WisePaymentsCredentials {
  provider: "wise_payments";
  apiToken: string;
  profileId: string;
  /** Wise webhook public-key fingerprint — verifier uses RSA-SHA256. */
  webhookPublicKey?: string;
  mode: PaymentMode;
}

export interface PaypalCredentials {
  provider: "paypal";
  clientId: string;
  clientSecret: string;
  /** PayPal webhook ID (used by the verify-webhook-signature API). */
  webhookId?: string;
  mode: PaymentMode;
}

export interface ManualPaymentCredentials {
  provider: "manual";
  /** Free-form label so the UI can disambiguate multiple manual rails
   *  (e.g. "Office cash drawer", "Bank transfer log"). */
  label?: string;
  mode: PaymentMode;
}

export type PaymentCredentials =
  | StripeCredentials
  | WisePaymentsCredentials
  | PaypalCredentials
  | ManualPaymentCredentials;

// ---------------------------------------------------------------------------
// Domain types — what providers consume / return
// ---------------------------------------------------------------------------

export interface CreatePaymentIntentInput {
  amountMinor: bigint;
  currency: string;
  purpose: PaymentPurpose;
  customerEmail?: string;
  customerName?: string;
  customerCountry?: string;
  description: string;
  /** Free-form metadata bag — the provider stores under its own
   *  metadata namespace (Stripe: `metadata`, Wise: `details`, etc.). */
  metadata?: Record<string, string>;
  /** For checkout-redirect flows (Stripe Checkout, PayPal). */
  successUrl?: string;
  cancelUrl?: string;
  /** Optional internal linkage. Stored on the resulting
   *  `payment_intents` row so downstream reconciliation can join. */
  linkedReservationId?: string;
  linkedInvoiceId?: string;
  linkedInvestorId?: string;
  linkedBuyerId?: string;
  linkedVendorId?: string;
}

export interface PaymentIntent {
  externalIntentId: string;
  /** Provider-native status string. Mapping to lifecycleState happens
   *  inside the service layer. */
  status: string;
  amountMinor: bigint;
  currency: string;
  /** Card-element flow (Stripe). */
  clientSecret?: string;
  /** Checkout-redirect flow (Stripe Checkout, PayPal). */
  paymentUrl?: string;
  rawPayload: Record<string, unknown>;
}

export interface RefundInput {
  externalIntentId: string;
  /** Partial refunds: omit to refund the full amount. */
  amountMinor?: bigint;
  reason?: string;
}

export interface RefundResult {
  externalRefundId: string;
  status: string;
}

export interface PaymentWebhookEvent {
  /** Provider-native event type — e.g. `payment_intent.succeeded`. */
  eventType: string;
  externalIntentId?: string;
  /** When known, the lifecycle transition this event implies. Webhook
   *  handlers use this directly to update `payment_intents`. */
  lifecycleState?: PaymentLifecycleState;
  /** Untyped — full provider event for audit logging. */
  raw: Record<string, unknown>;
}

export interface ConnectionTestResult {
  connected: boolean;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider interface — every implementation conforms
// ---------------------------------------------------------------------------

export interface PaymentProviderInterface {
  /** Provider tag — must match the `provider` column on
   *  `payment_processor_connections`. */
  readonly provider: PaymentProviderName;

  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent>;

  retrievePaymentIntent(externalIntentId: string): Promise<PaymentIntent>;

  cancelPaymentIntent(
    externalIntentId: string,
  ): Promise<{ success: boolean; error?: string }>;

  refund(input: RefundInput): Promise<RefundResult>;

  /** Mandatory — every payment provider MUST verify webhook signatures.
   *  This is a financial system — silent webhook acceptance is a security
   *  hole. DryRun fail-closes (returns false). */
  verifyWebhook(payload: string, signature: string, secret: string): boolean;

  parseWebhook(
    payload: Record<string, unknown>,
  ): PaymentWebhookEvent | null;

  testConnection(): Promise<ConnectionTestResult>;

  /** Optional — what this connection can do. The selector reads this
   *  to populate `capabilities` on the connection row. */
  readonly capabilities?: readonly PaymentCapability[];
}

/**
 * Stage 6.P3.F — Stripe API client.
 *
 * Reuses `requestWithRetry` from P1.C. Form-URL-encoded body via the
 * `stripeFormEncode` helper. Bearer-secret auth.
 *
 * Endpoints:
 *   - POST /v1/payment_intents
 *   - GET  /v1/payment_intents/{id}
 *   - POST /v1/payment_intents/{id}/cancel
 *   - POST /v1/refunds
 *   - GET  /v1/events?type=&starting_after=
 *   - POST /v1/checkout/sessions
 *   - GET  /v1/account
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type { StripeCredentials } from "../../types";
import { stripeFormEncode } from "./form-encode";

const BASE = "https://api.stripe.com";

export interface StripeClientOptions extends RetryOptions {
  apiBase?: string;
  /** Stripe API version pin. Default uses Stripe's account default. */
  apiVersion?: string;
}

export class StripeClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly apiVersion?: string;

  constructor(
    private readonly creds: StripeCredentials,
    opts: StripeClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.apiVersion = opts.apiVersion;
  }

  private get authHeader(): string {
    return `Bearer ${this.creds.secretKey}`;
  }

  private get baseHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (this.apiVersion) h["Stripe-Version"] = this.apiVersion;
    if (this.creds.accountId) h["Stripe-Account"] = this.creds.accountId;
    return h;
  }

  async createPaymentIntent(input: {
    amount: number;
    currency: string;
    customer?: string;
    description?: string;
    metadata?: Record<string, string>;
    automatic_payment_methods?: { enabled: true };
    receipt_email?: string;
  }) {
    return this.post(`${this.apiBase}/v1/payment_intents`, input);
  }

  async retrievePaymentIntent(id: string) {
    return this.get(
      `${this.apiBase}/v1/payment_intents/${encodeURIComponent(id)}`,
    );
  }

  async cancelPaymentIntent(id: string) {
    return this.post(
      `${this.apiBase}/v1/payment_intents/${encodeURIComponent(id)}/cancel`,
      {},
    );
  }

  async createRefund(input: {
    payment_intent: string;
    amount?: number;
    reason?: string;
    metadata?: Record<string, string>;
  }) {
    return this.post(`${this.apiBase}/v1/refunds`, input);
  }

  async listEvents(opts: { type?: string; starting_after?: string; limit?: number } = {}) {
    const url = new URL(`${this.apiBase}/v1/events`);
    if (opts.type) url.searchParams.set("type", opts.type);
    if (opts.starting_after)
      url.searchParams.set("starting_after", opts.starting_after);
    if (opts.limit) url.searchParams.set("limit", String(opts.limit));
    return this.get(url.toString());
  }

  async createCheckoutSession(input: Record<string, unknown>) {
    return this.post(`${this.apiBase}/v1/checkout/sessions`, input);
  }

  /**
   * Stage 9.C — Stripe Customer Portal session. Hosted billing UI for
   * the customer (update payment method, view invoices, cancel, etc.).
   * Body: { customer: 'cus_...', return_url: 'https://...' }.
   */
  async createBillingPortalSession(input: {
    customer: string;
    return_url: string;
  }) {
    return this.post(
      `${this.apiBase}/v1/billing_portal/sessions`,
      input as unknown as Record<string, unknown>,
    );
  }

  async getAccount() {
    return this.get(`${this.apiBase}/v1/account`);
  }

  // -------------------------------------------------------------------------
  // Internal HTTP
  // -------------------------------------------------------------------------

  private async get(url: string) {
    const result = await requestWithRetry(
      url,
      {
        method: "GET",
        headers: this.baseHeaders,
      },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  private async post(url: string, body: Record<string, unknown>) {
    const result = await requestWithRetry(
      url,
      {
        method: "POST",
        headers: this.baseHeaders,
        body: stripeFormEncode(body),
      },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}

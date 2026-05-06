/**
 * Payment-provider abstraction. Pure module — no DB, no `server-only`
 * import. The actual implementations (`manual-stub-provider.ts`) live
 * one level up.
 *
 * The deposit row is the source of truth: providers read / write
 * the row by `depositId`. The provider-session id is opaque to us;
 * we round-trip it through the deposit row.
 */

export type ProviderKey =
  | "manual_stub"
  | "stripe"
  | "xendit"
  | "wise"
  | "bank_transfer";

export interface ProviderCreateSessionInput {
  depositId: string;
  amountMinor: bigint;
  currency: string;
  /** Where the guest should land after the (mock) checkout. */
  returnUrl: string;
  metadata?: Record<string, string>;
}

export interface ProviderSession {
  providerKey: ProviderKey;
  /** Opaque ID we round-trip through `direct_booking_deposits.provider_session_id`. */
  sessionId: string;
  /** Public-safe URL the guest visits. The manual stub points to our
   *  own `/book/hold/<token>/payment` page; future providers point at
   *  Stripe / Xendit / etc. */
  paymentUrl: string;
  /** Optional expiry the deposit row will mirror. */
  expiresAt: Date | null;
}

export type ProviderStatusKind =
  | "draft"
  | "pending"
  | "requires_action"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

export interface ProviderStatus {
  kind: ProviderStatusKind;
  rawStatus: string;
  /** Provider-side payment id (e.g. Stripe `pi_xxx`) once captured. */
  paymentId: string | null;
  /** Human-readable detail; never includes credentials / raw payloads. */
  detail: string | null;
}

export interface ProviderCancelInput {
  depositId: string;
  providerSessionId: string | null;
  reason?: string | null;
}

export interface PaymentProvider {
  readonly key: ProviderKey;
  createSession(input: ProviderCreateSessionInput): Promise<ProviderSession>;
  getStatus(input: {
    depositId: string;
    providerSessionId: string | null;
  }): Promise<ProviderStatus>;
  cancelSession(input: ProviderCancelInput): Promise<{ ok: boolean }>;
}

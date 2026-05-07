/**
 * Stage 6.P3.A — Banking provider types.
 *
 * Single `BankProviderInterface` every bank implementation (Revolut,
 * Wise, Mandiri, BCA, Plaid, manual, DryRun) conforms to. Mirrors the
 * proven Stage 6.P1.A channel-manager / Stage 6.P2.A messaging
 * provider pattern.
 *
 * Pure types — no DB, no `import "server-only"`. Importable from
 * client code (UI types) and tests.
 */

import type {
  BankProviderName,
  BankAccountType,
} from "@/lib/db/schema/banking";

// Re-export for downstream importers that don't want a schema dep.
export type { BankProviderName, BankAccountType };

// ---------------------------------------------------------------------------
// Credentials — discriminated union per provider
// ---------------------------------------------------------------------------

export interface RevolutCredentials {
  provider: "revolut";
  apiKey: string;
  environment: "sandbox" | "production";
  /** HMAC-SHA256 secret for inbound webhook verification (set when
   *  the operator registers the webhook). */
  webhookSecret?: string;
}

export interface WiseCredentials {
  provider: "wise";
  apiToken: string;
  profileId: string;
  environment: "sandbox" | "production";
  /** Wise webhook public key fingerprint — verifier uses RSA-SHA256
   *  over the raw payload. Optional until the operator wires inbound
   *  webhooks. */
  webhookPublicKey?: string;
}

/** Mandiri / BCA: limited public API. P3.E ships manual CSV +
 *  optional email parsing; the credentials blob is mostly metadata. */
export interface MandiriCredentials {
  provider: "mandiri";
  /** Account number used on the statement export — used by the import
   *  wizard to pre-populate the column-mapping template. */
  accountNumber: string;
  /** Optional partner-API token. Empty until the operator obtains a
   *  Mandiri Corporate API contract. */
  partnerApiToken?: string;
}

export interface BcaCredentials {
  provider: "bca";
  accountNumber: string;
  /** Optional KlikBCA Bisnis API token. Empty in the manual-import
   *  path. */
  partnerApiToken?: string;
}

export interface PlaidCredentials {
  provider: "plaid";
  clientId: string;
  secret: string;
  accessToken: string;
  itemId: string;
  environment: "sandbox" | "development" | "production";
}

/** Manual / "no provider" — used for hand-entered accounts where every
 *  transaction lands via CSV upload or manual entry. */
export interface ManualBankCredentials {
  provider: "manual";
  /** Free-form label so the UI can distinguish multiple manual
   *  accounts. */
  label?: string;
}

export type BankCredentials =
  | RevolutCredentials
  | WiseCredentials
  | MandiriCredentials
  | BcaCredentials
  | PlaidCredentials
  | ManualBankCredentials;

// ---------------------------------------------------------------------------
// Domain types — what providers return / consume
// ---------------------------------------------------------------------------

/**
 * Normalized bank transaction shape that every provider parser projects
 * inbound rows into. Sign convention: positive = credit (incoming),
 * negative = debit (outgoing).
 */
export interface BankTransactionRecord {
  externalTransactionId: string;
  externalReference?: string;
  transactionDate: Date;
  valueDate?: Date;
  bookingDate?: Date;
  amountMinor: bigint;
  currency: string;
  /** Original (pre-FX) amount when the booking currency differs from
   *  the account currency. */
  originalAmountMinor?: bigint;
  originalCurrency?: string;
  fxRate?: number;
  description: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  counterpartyIban?: string;
  counterpartySwift?: string;
  counterpartyCountry?: string;
  isPending?: boolean;
  /** Untyped escape hatch — the original provider response payload so
   *  downstream consumers can pull bank-specific fields. */
  rawPayload: Record<string, unknown>;
}

export interface FetchTransactionsInput {
  externalAccountId: string;
  since: Date;
  until?: Date;
  limit?: number;
  cursor?: string;
}

export interface FetchTransactionsResult {
  transactions: BankTransactionRecord[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface BankBalance {
  externalAccountId: string;
  availableMinor: bigint;
  ledgerMinor?: bigint;
  currency: string;
  asOf: Date;
}

export interface InitiatePaymentInput {
  fromAccountId: string;
  toIban?: string;
  toAccountId?: string;
  amountMinor: bigint;
  currency: string;
  reference: string;
  /** Optional human-readable beneficiary name. Some providers require
   *  this for compliance / counterparty display. */
  beneficiaryName?: string;
}

export interface InitiatePaymentResult {
  externalPaymentId: string;
  status: string;
}

export interface BankWebhookEvent {
  /** Provider-specific event identifier — e.g. Revolut's `event`. */
  eventType: string;
  /** Subset of fields the unified ingestion path knows how to handle. */
  transaction?: BankTransactionRecord;
  /** Untyped escape hatch — full provider event for audit logging. */
  raw: Record<string, unknown>;
}

export interface ConnectionTestResult {
  connected: boolean;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider interface — every implementation conforms
// ---------------------------------------------------------------------------

export interface BankProviderInterface {
  /** Provider tag — must match the `provider` column on
   *  `bank_connections`. */
  readonly provider: BankProviderName;

  fetchTransactions(
    input: FetchTransactionsInput,
  ): Promise<FetchTransactionsResult>;

  fetchBalance(externalAccountId: string): Promise<BankBalance>;

  /** Optional — only payment-capable providers (Revolut, Wise) wire
   *  this. Manual / Plaid (read-only) leave it undefined. */
  initiatePayment?(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;

  /** Optional — webhook providers (Revolut) implement; pull-only
   *  providers (Mandiri, BCA, manual) leave undefined. */
  verifyWebhook?(payload: string, signature: string, secret: string): boolean;
  parseWebhook?(payload: Record<string, unknown>): BankWebhookEvent | null;

  testConnection(): Promise<ConnectionTestResult>;
}

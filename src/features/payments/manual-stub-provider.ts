/**
 * Manual stub payment provider.
 *
 * Behaviour:
 *   - Never calls an external service.
 *   - Generates a deterministic-ish `man_<deposit_id>` session id.
 *   - Emits a `payment_url` that points back to our own
 *     `/book/hold/<token>/payment` page — never to a real PSP host.
 *   - `getStatus` always reports `pending` (the manual flow flips
 *     status via the admin "mark paid" action; webhooks are not used).
 *   - `cancelSession` is a no-op success.
 *
 * No `server-only` import: this module is import-safe from tests.
 */
import type {
  PaymentProvider,
  ProviderCancelInput,
  ProviderCreateSessionInput,
  ProviderSession,
  ProviderStatus,
} from "./provider-types";

export interface ManualStubOptions {
  /** Used to build the `payment_url`. The stub URL only needs the
   *  hold token; the deposit id is in the query string for traceability. */
  buildPaymentUrl: (args: {
    depositId: string;
    holdToken: string;
  }) => string;
  /** Optional expiry — defaults to 24 h from now when not provided. */
  defaultExpiryMinutes?: number;
}

export class ManualStubProvider implements PaymentProvider {
  readonly key = "manual_stub" as const;
  private readonly buildPaymentUrl: ManualStubOptions["buildPaymentUrl"];
  private readonly defaultExpiryMinutes: number;

  constructor(opts: ManualStubOptions) {
    this.buildPaymentUrl = opts.buildPaymentUrl;
    this.defaultExpiryMinutes = opts.defaultExpiryMinutes ?? 24 * 60;
  }

  async createSession(
    input: ProviderCreateSessionInput,
  ): Promise<ProviderSession> {
    // Deterministic prefix so admins can spot the stub from a glance.
    const sessionId = `man_${input.depositId}`;
    // We piggy-back the hold token via the metadata so the URL builder
    // can construct `/book/hold/<token>/payment`.
    const holdToken = input.metadata?.holdToken ?? "";
    const paymentUrl = this.buildPaymentUrl({
      depositId: input.depositId,
      holdToken,
    });
    const expiresAt = new Date(
      Date.now() + this.defaultExpiryMinutes * 60_000,
    );
    return {
      providerKey: "manual_stub",
      sessionId,
      paymentUrl,
      expiresAt,
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    // The manual stub never completes on its own — admin clicks the
    // "mark paid" button to flip the deposit row.
    return {
      kind: "pending",
      rawStatus: "manual_pending",
      paymentId: null,
      detail: "Manual stub — admin verifies payment off-platform.",
    };
  }

  async cancelSession(_input: ProviderCancelInput): Promise<{ ok: boolean }> {
    // No external surface to cancel; the deposit row is the source of
    // truth, and the action layer flips it to `cancelled`.
    return { ok: true };
  }
}

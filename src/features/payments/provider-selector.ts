import { ManualStubProvider } from "./manual-stub-provider";
import type { PaymentProvider, ProviderKey } from "./provider-types";

/**
 * Selector — returns the provider implementation for a given
 * `provider_key`. Future Stripe / Xendit / Wise / bank_transfer
 * implementations can register here without touching call sites.
 */
export function selectPaymentProvider(
  key: ProviderKey,
  opts?: {
    buildPaymentUrl?: (args: {
      depositId: string;
      holdToken: string;
    }) => string;
  },
): PaymentProvider {
  const buildPaymentUrl =
    opts?.buildPaymentUrl ??
    ((args: { depositId: string; holdToken: string }) =>
      args.holdToken
        ? `/book/hold/${args.holdToken}/payment?d=${args.depositId}`
        : `#`);

  switch (key) {
    case "manual_stub":
      return new ManualStubProvider({ buildPaymentUrl });
    case "stripe":
    case "xendit":
    case "wise":
    case "bank_transfer":
      // The direct-booking DEPOSIT workflow has no live provider yet and
      // falls through to the manual stub so the system stays runnable.
      // Note: a real Xendit adapter now exists in the unified processor
      // framework (src/lib/payment-processors/providers/xendit/) and is
      // live for buyer installments; bridging the deposit flow onto it
      // is a follow-on (ADR-0028/0029/0030 reconciliation path).
      return new ManualStubProvider({ buildPaymentUrl });
  }
}

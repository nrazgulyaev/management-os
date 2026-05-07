import type { PaymentProviderName } from "@/lib/db/schema/payment-processors";
import { DryRunPaymentProvider } from "./providers/dry-run";
import { StripeProvider } from "./providers/stripe/provider";
import type {
  PaymentCredentials,
  PaymentProviderInterface,
} from "./types";

/**
 * Stage 6.P3.A — Payment processor selector.
 *
 * One entry point — returns a real implementation when credentials are
 * present and match the requested provider, returns a DryRun fallback
 * otherwise. Mirrors the proven Stage 3.A AI-provider / Stage 6.P1.A
 * channel-manager / Stage 6.P2.A messaging / Stage 6.P3.A banking
 * selector pattern.
 *
 * P3.A scope ships only the DryRun fallback. P3.F lands the Stripe
 * provider behind this selector — the switch grows but the contract
 * doesn't change. Webhook routes, the operator UI, and any internal
 * caller always go through this function so they get the same
 * interface regardless of credential state.
 */
export function selectPaymentProvider(
  provider: PaymentProviderName,
  credentials: PaymentCredentials | null,
): PaymentProviderInterface {
  if (!credentials) {
    return new DryRunPaymentProvider(provider);
  }

  if (credentials.provider !== provider) {
    return new DryRunPaymentProvider(provider);
  }

  switch (provider) {
    case "stripe":
      // P3.F landed Stripe — see providers/stripe/.
      if (credentials.provider !== "stripe") {
        return new DryRunPaymentProvider(provider);
      }
      return new StripeProvider(credentials);

    // P3 doesn't ship Wise Payments / PayPal in this iteration.
    case "wise_payments":
    case "paypal":
    case "manual":
      return new DryRunPaymentProvider(provider);

    default: {
      const exhaustive: never = provider;
      void exhaustive;
      return new DryRunPaymentProvider(provider as PaymentProviderName);
    }
  }
}

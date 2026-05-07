import type { BankProviderName } from "@/lib/db/schema/banking";
import { DryRunBankProvider } from "./providers/dry-run";
import type { BankCredentials, BankProviderInterface } from "./types";

/**
 * Stage 6.P3.A — Bank provider selector.
 *
 * One entry point — returns a real implementation when credentials are
 * present and match the requested provider, returns a DryRun fallback
 * otherwise. Mirrors the proven Stage 3.A AI-provider / Stage 6.P1.A
 * channel-manager / Stage 6.P2.A messaging selector pattern.
 *
 * P3.A scope ships only the DryRun fallback. P3.C/D/E/F land each real
 * provider behind this selector — the switch grows but the contract
 * doesn't change. Callers (cron jobs, webhook routes, service layer,
 * import wizards) always go through this function so they get the
 * same interface regardless of credential state.
 */
export function selectBankProvider(
  provider: BankProviderName,
  credentials: BankCredentials | null,
): BankProviderInterface {
  // No credentials → safe default. Same answer for any provider.
  if (!credentials) {
    return new DryRunBankProvider(provider);
  }

  // "other" is a catch-all slot on the schema — no credentials union
  // member exists for it, so always degrade to DryRun.
  if (provider === "other") {
    return new DryRunBankProvider(provider);
  }

  // Defensive: the DB-stored provider tag must match the credentials
  // discriminator. A mismatch means somebody persisted the wrong
  // shape; fall back to DryRun rather than constructing a misconfigured
  // real provider.
  if (credentials.provider !== provider) {
    return new DryRunBankProvider(provider);
  }

  switch (provider) {
    // P3.C lands Revolut.
    case "revolut":
    // P3.D lands Wise.
    case "wise":
    // P3.E lands Mandiri + BCA.
    case "mandiri":
    case "bca":
    // P3 doesn't ship Plaid in this iteration, but the selector keeps
    // the slot reserved.
    case "plaid":
    case "manual":
      return new DryRunBankProvider(provider);

    default: {
      // Exhaustiveness guard — TS flags missing cases when a new
      // BankProviderName value is added.
      const exhaustive: never = provider;
      void exhaustive;
      return new DryRunBankProvider(provider as BankProviderName);
    }
  }
}

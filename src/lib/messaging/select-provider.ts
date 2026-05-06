import type { MessagingChannel } from "@/lib/db/schema/messaging";
import { DryRunMessagingProvider } from "./providers/dry-run";
import { WhatsAppMetaProvider } from "./providers/whatsapp-meta/provider";
import { WhatsAppTwilioProvider } from "./providers/whatsapp-twilio/provider";
import { TelegramProvider } from "./providers/telegram/provider";
import type {
  MessagingCredentials,
  MessagingProvider,
} from "./types";

/**
 * Stage 6.P2.A — Messaging provider selector.
 *
 * Mirrors the proven Stage 3.A AI-provider / Stage 6.P1.A
 * channel-manager selector pattern: one entry point, returns a real
 * implementation when credentials are present, returns a DryRun
 * fallback otherwise.
 *
 * P2.A scope ships only the DryRun fallback. P2.B/C/D/E land each
 * real provider behind this selector — the switch grows but the
 * contract doesn't change. Callers (cron jobs, webhook routes,
 * service layer) always go through this function so they get the
 * same interface regardless of credential state.
 *
 * `internal_note` is intentionally not handled here — internal notes
 * are platform-side annotations on threads, not sent through any
 * external channel.
 */
export function selectMessagingProvider(
  channel: MessagingChannel,
  credentials: MessagingCredentials | null,
): MessagingProvider {
  // Internal notes never go through a channel provider — DryRun no-op.
  if (channel === "internal_note") {
    return new DryRunMessagingProvider(channel);
  }

  // No credentials → safe default. Same answer for any channel.
  if (!credentials) {
    return new DryRunMessagingProvider(channel);
  }

  // Defensive: the DB-stored channel must match the credentials union
  // tag. A mismatch means somebody persisted the wrong shape; fall
  // back to DryRun rather than returning a misconfigured real provider.
  if (credentials.channel !== channel) {
    return new DryRunMessagingProvider(channel);
  }

  switch (channel) {
    case "whatsapp": {
      // P2.B landed both WhatsApp providers. The credential blob's
      // `provider` discriminator picks Meta Cloud vs Twilio.
      if (credentials.channel !== "whatsapp") {
        return new DryRunMessagingProvider(channel);
      }
      const wa = credentials;
      switch (wa.provider) {
        case "meta_cloud":
          return new WhatsAppMetaProvider(wa);
        case "twilio":
          return new WhatsAppTwilioProvider(wa);
        default: {
          // Unknown WhatsApp provider tag — fall back to DryRun rather
          // than crash. Future providers (e.g. 360dialog) extend the
          // discriminated union and add a case here.
          return new DryRunMessagingProvider(channel);
        }
      }
    }

    case "telegram":
      // P2.C landed Telegram — see providers/telegram/.
      if (credentials.channel !== "telegram") {
        return new DryRunMessagingProvider(channel);
      }
      return new TelegramProvider(credentials);

    // P2.D–E land the rest. Until then, the safe default is DryRun
    // even when credentials are present — operators can configure
    // the connection now and it goes live when the provider class
    // is wired up.
    case "instagram":
    case "facebook_messenger":
    case "email":
    case "sms":
      return new DryRunMessagingProvider(channel);

    default: {
      // Exhaustiveness guard — TS flags missing cases when a new
      // MessagingChannel value is added.
      const exhaustive: never = channel;
      void exhaustive;
      return new DryRunMessagingProvider(channel as MessagingChannel);
    }
  }
}

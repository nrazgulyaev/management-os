import type { MessagingChannel } from "@/lib/db/schema/messaging";
import { DryRunMessagingProvider } from "./providers/dry-run";
import { WhatsAppMetaProvider } from "./providers/whatsapp-meta/provider";
import { WhatsAppTwilioProvider } from "./providers/whatsapp-twilio/provider";
import { TelegramProvider } from "./providers/telegram/provider";
import { InstagramProvider } from "./providers/instagram/provider";
import { MessengerProvider } from "./providers/messenger/provider";
import { GmailProvider } from "./providers/gmail/provider";
import { ResendProvider } from "./providers/resend/provider";
import { TwilioSmsProvider } from "./providers/twilio-sms/provider";
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

    case "instagram":
      // P2.D landed Instagram — see providers/instagram/.
      if (credentials.channel !== "instagram") {
        return new DryRunMessagingProvider(channel);
      }
      return new InstagramProvider(credentials);

    case "facebook_messenger":
      // P2.D landed Messenger — see providers/messenger/.
      if (credentials.channel !== "facebook_messenger") {
        return new DryRunMessagingProvider(channel);
      }
      return new MessengerProvider(credentials);

    case "email": {
      // P2.E landed Gmail. The credential blob's `provider`
      // discriminator picks Gmail OAuth vs Resend transactional.
      // Resend's MessagingProvider adapter lands in P2.F alongside
      // the operator UI.
      if (credentials.channel !== "email") {
        return new DryRunMessagingProvider(channel);
      }
      const em = credentials;
      switch (em.provider) {
        case "gmail":
          return new GmailProvider(em);
        case "resend":
          // P2.F landed the Resend transactional adapter.
          return new ResendProvider(em);
        default:
          return new DryRunMessagingProvider(channel);
      }
    }

    case "sms":
      // P2.F landed the Twilio SMS adapter under the unified interface.
      // Stage 3.D's env-var-driven path coexists for in-app callers.
      if (credentials.channel !== "sms") {
        return new DryRunMessagingProvider(channel);
      }
      return new TwilioSmsProvider(credentials);

    default: {
      // Exhaustiveness guard — TS flags missing cases when a new
      // MessagingChannel value is added.
      const exhaustive: never = channel;
      void exhaustive;
      return new DryRunMessagingProvider(channel as MessagingChannel);
    }
  }
}

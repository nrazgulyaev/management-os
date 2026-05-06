// Provider modules avoid `import "server-only"` so the pure
// `selectProvider` selector stays importable from node:test. The fetch
// call only fires when env is configured + dry-run is off, which is
// always a server-side context.
import { env, isTwilioConfigured } from "@/lib/env";
import type { DeliveryInput, NotificationProvider } from "./types";

/**
 * Twilio SMS + WhatsApp via the Messages REST API. Plain `fetch` + Basic
 * Auth so we don't drag in the `twilio` SDK.
 *
 *   POST https://api.twilio.com/2010-04-01/Accounts/<sid>/Messages.json
 *   form-urlencoded:
 *     From=<from>
 *     To=<to>
 *     Body=<body>
 *
 * For WhatsApp the `From` and `To` numbers must be prefixed `whatsapp:` —
 * we apply that here so the queue can store plain E.164.
 */
export const twilioProvider: NotificationProvider = {
  key: "twilio",
  supports: (channel) => channel === "sms" || channel === "whatsapp",
  isConfigured: () => isTwilioConfigured(),
  async send(input: DeliveryInput) {
    if (!isTwilioConfigured()) {
      return { status: "skipped", errorMessage: "twilio not configured" };
    }
    if (!input.recipientAddress) {
      return { status: "skipped", errorMessage: "missing recipient phone" };
    }
    const sid = env.server.TWILIO_ACCOUNT_SID!;
    const token = env.server.TWILIO_AUTH_TOKEN!;

    const fromBase =
      input.channel === "sms"
        ? env.server.TWILIO_FROM_SMS
        : env.server.TWILIO_FROM_WHATSAPP;
    if (!fromBase) {
      return {
        status: "skipped",
        errorMessage: `twilio FROM number not configured for ${input.channel}`,
      };
    }

    const prefix = input.channel === "whatsapp" ? "whatsapp:" : "";
    const params = new URLSearchParams({
      From: `${prefix}${fromBase}`,
      To: `${prefix}${input.recipientAddress}`,
      Body: `${input.title}\n\n${input.body}`,
    });

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          status: "failed",
          errorMessage:
            typeof json.message === "string"
              ? json.message
              : `Twilio HTTP ${res.status}`,
          responseJson: json,
        };
      }
      const id =
        typeof json.sid === "string" ? json.sid : `twilio-${input.notificationId}`;
      return {
        status: "sent",
        providerMessageId: id,
        responseJson: json,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "twilio request failed";
      return { status: "failed", errorMessage: message };
    }
  },
};

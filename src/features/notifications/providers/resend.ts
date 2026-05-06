// Provider modules avoid `import "server-only"` so the pure
// `selectProvider` selector stays importable from node:test. The fetch
// call only fires when env is configured + dry-run is off, which is
// always a server-side context.
import { env, isResendConfigured } from "@/lib/env";
import type { DeliveryInput, NotificationProvider } from "./types";

/**
 * Email via Resend. Uses the public REST API directly so we don't pull in
 * the `resend` SDK (smaller bundle, easier to test). Only fires when both
 * `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set — otherwise reports
 * skipped and the worker falls through to noop.
 *
 * Body is sent as plain text; richer HTML templates land with v8B. Title
 * becomes the email subject.
 */
export const resendProvider: NotificationProvider = {
  key: "resend",
  supports: (channel) => channel === "email",
  isConfigured: () => isResendConfigured(),
  async send(input: DeliveryInput) {
    if (!isResendConfigured()) {
      return { status: "skipped", errorMessage: "resend not configured" };
    }
    if (!input.recipientAddress) {
      return { status: "skipped", errorMessage: "missing recipient email" };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.server.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.server.RESEND_FROM_EMAIL,
          to: [input.recipientAddress],
          subject: input.title,
          text: input.body,
          // v8B — send HTML when the template supplied one. Resend renders
          // the html body when present and falls back to text otherwise.
          ...(input.html ? { html: input.html } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          status: "failed",
          errorMessage:
            typeof json.message === "string"
              ? json.message
              : `Resend HTTP ${res.status}`,
          responseJson: json,
        };
      }
      const id =
        typeof json.id === "string" ? json.id : `resend-${input.notificationId}`;
      return {
        status: "sent",
        providerMessageId: id,
        responseJson: json,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "resend request failed";
      return { status: "failed", errorMessage: message };
    }
  },
};

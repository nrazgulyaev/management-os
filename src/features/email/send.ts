// Intentionally NOT marked `server-only`: pure helpers + the resend
// provider are importable from node:test the same way
// notifications/providers/* are. The live fetch call only fires when
// RESEND_API_KEY is set.
import type {
  EmailTemplate,
  RenderedEmail,
  SendEmailResult,
} from "./templates/types";
import { resendProvider } from "@/features/notifications/providers/resend";
import { isResendConfigured } from "@/lib/env";

/**
 * Stage 10.G — Operator-facing transactional email send entry point.
 * Stage 10.L — wires the live Resend call.
 *
 * Behaviour:
 * - Validates recipient + renders template (always).
 * - When `RESEND_API_KEY` + `RESEND_FROM_EMAIL` are configured: sends
 *   via the existing `resendProvider` (re-uses the queued-notification
 *   integration; same audit trail in case of failure).
 * - When not configured: logs to console + returns
 *   `{ ok: true, skipped: true, reason: 'resend_not_configured' }` so
 *   dev environments + CI continue to work without external services.
 *
 * Why a separate surface from `src/features/notifications/*`:
 * notifications is a fan-out delivery system (push + email + in-app,
 * with retries, scheduled queues, RLS scoping). This is the thin
 * transactional path — operator action triggers an email immediately,
 * no queue, no notification record. Most marketing / onboarding flows
 * live here.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendEmail<Data>(
  to: string,
  template: EmailTemplate<Data>,
  data: Data,
): Promise<SendEmailResult> {
  if (!EMAIL_REGEX.test(to)) {
    return { ok: false, reason: "invalid recipient email" };
  }

  let rendered: RenderedEmail;
  try {
    rendered = template.render(data);
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "template render failed";
    return { ok: false, reason };
  }

  // Dev / CI graceful fallback when env unconfigured.
  if (!isResendConfigured()) {
    if (process.env.NODE_ENV !== "test") {
      console.info(
        `[email] resend not configured — skipped template=${template.key} to=${maskEmail(to)} subject="${rendered.subject}"`,
      );
    }
    return {
      ok: true,
      skipped: true,
      reason: "resend_not_configured",
    };
  }

  // Live delivery via the existing resend provider (Stage 8.B v8B).
  // Synthesises a DeliveryInput with a placeholder notificationId so
  // the provider's existing audit / response-logging shape continues
  // to work; the transactional path doesn't write a notification row.
  const result = await resendProvider.send({
    notificationId: `transactional-${template.key}-${Date.now()}`,
    channel: "email",
    recipientType: "internal_user",
    recipientId: null,
    recipientAddress: to,
    title: rendered.subject,
    body: rendered.text,
    html: rendered.html,
    payload: null,
    priority: "normal",
  });

  if (result.status === "sent") {
    return { ok: true };
  }
  if (result.status === "skipped") {
    return {
      ok: true,
      skipped: true,
      reason: result.errorMessage ?? "skipped",
    };
  }
  return {
    ok: false,
    reason: result.errorMessage ?? `resend status: ${result.status}`,
  };
}

/** "ada@example.com" → "a***@example.com". */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

export { maskEmail as maskEmailForTesting };

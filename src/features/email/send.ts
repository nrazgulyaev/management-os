// Intentionally NOT marked `server-only`: the pure no-op body needs to
// be importable from node:test the same way notifications/providers/*
// do. When 10.L swaps the body to call resendProvider, the live HTTP
// call is fired only inside server runtimes anyway.
import type {
  EmailTemplate,
  RenderedEmail,
  SendEmailResult,
} from "./templates/types";

/**
 * Stage 10.G — Operator-facing transactional email send entry point.
 *
 * Today: NO-OP. Renders the template, validates the recipient, logs to
 * the server console, and returns `{ ok: true, skipped: true }`. No
 * outbound HTTP. No provider wired.
 *
 * Stage 10.L will swap the no-op body for the live Resend call (the
 * provider integration already exists in
 * `src/features/notifications/providers/resend.ts` — the swap is a few
 * lines). The function signature + return shape stays stable so every
 * caller built before 10.L keeps working.
 *
 * Why a separate surface from `src/features/notifications/*`:
 * notifications is a fan-out delivery system (push + email +
 * in-app, with retries, scheduled queues, RLS scoping). This is the
 * thin transactional path — operator action triggers an email
 * immediately, no queue, no notification record. Most marketing /
 * onboarding flows live here.
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

  // No-op delivery — Stage 10.L wires Resend here.
  if (process.env.NODE_ENV !== "test") {
    console.info(
      `[email] (no-op until 10.L) template=${template.key} to=${maskEmail(to)} subject="${rendered.subject}"`,
    );
  }

  return {
    ok: true,
    skipped: true,
    reason: "stage_10_g_noop_pending_resend_wiring",
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

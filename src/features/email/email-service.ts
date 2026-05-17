import "server-only";

import { Resend } from "resend";

/**
 * Sprint EMAIL-1 — Resend email service.
 *
 * Wraps the Resend SDK. Returns a structured result instead of
 * throwing so callers (cron jobs, server actions) can handle the
 * "no API key configured" path gracefully without bringing down
 * the parent operation.
 *
 * Env required:
 *   - RESEND_API_KEY            (production sending)
 *   - RESEND_FROM_EMAIL         (sender, e.g. statements@arconique.com)
 * Fallback sender when domain unverified: onboarding@resend.dev
 *
 * Status today: HALT acknowledged — no RESEND_API_KEY in env. The
 * service ships with all wiring so the moment the operator adds the
 * key + verifies arconique.com in the Resend dashboard, every caller
 * (statement send, magic links, etc.) starts working without code
 * changes.
 */

const FALLBACK_FROM = "Arconique <onboarding@resend.dev>";

let cached: Resend | null = null;

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  fromName?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  reason?: "no_api_key" | "send_failed";
}

function getResendClient(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function resolveFromAddress(fromName?: string): string {
  const configured = process.env.RESEND_FROM_EMAIL;
  if (configured) {
    return fromName ? `${fromName} <${configured}>` : configured;
  }
  return FALLBACK_FROM;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getResendClient();
  if (!client) {
    return {
      ok: false,
      error: "RESEND_API_KEY not configured",
      reason: "no_api_key",
    };
  }
  try {
    const { data, error } = await client.emails.send({
      from: resolveFromAddress(input.fromName),
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    if (error) {
      return { ok: false, error: error.message ?? "send-failed", reason: "send_failed" };
    }
    return { ok: true, messageId: data?.id };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message,
      reason: "send_failed",
    };
  }
}

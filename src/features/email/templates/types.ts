/**
 * Stage 10.G — Transactional email template contract.
 *
 * Operator-facing transactional emails (welcome, trial-expiry, etc.)
 * funnel through `sendEmail()` in src/features/email/send.ts. This file
 * defines the shared template + payload shape so each template module
 * stays a pure renderer — no env / fetch / DB.
 *
 * Stage 10.L will wire `sendEmail()` to Resend; today the function
 * no-ops + logs. The template contract does NOT change between
 * no-op and live.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface EmailTemplate<Data> {
  /** Stable identifier for logs + analytics. Snake_case. */
  key: string;
  render(data: Data): RenderedEmail;
}

export interface SendEmailOptions {
  to: string;
  template: EmailTemplate<unknown>;
  data: unknown;
}

export interface SendEmailResult {
  ok: boolean;
  /** True when delivery was skipped because the provider isn't wired
   *  yet (Stage 10.G no-op state). */
  skipped?: boolean;
  reason?: string;
}

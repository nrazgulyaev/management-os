import type { EmailTemplate, RenderedEmail } from "./types";

export interface TrialExpiryEmailData {
  recipientName: string;
  organizationName: string;
  /** Days left in the trial. Negative means already expired. */
  daysRemaining: number;
  /** ISO YYYY-MM-DD when the trial ends. */
  trialEndsOn: string;
  /** Absolute URL to the upgrade flow. */
  upgradeUrl: string;
}

/**
 * Stage 11.A.4 — per-day reminder template variation.
 *
 * Buckets the same template into four tonal registers based on days
 * remaining. The cron sweeps T-3 → T-0 daily; the same recipient may
 * receive up to 4 emails over their trial-end window. Identical copy
 * across all 4 firings would feel robotic, so we vary subject line,
 * headline, body framing, and CTA per bucket:
 *
 *   T-3 / T-2 (2-3 days)   — "Heads up" — calm, informational
 *   T-1     (tomorrow)      — explicit "tomorrow" framing, gentle nudge
 *   T-0     (today)         — strong urgency, last-chance copy
 *   T+ (already expired)    — recovery framing, "no work is lost"
 */
type ReminderBucket = "heads_up" | "tomorrow" | "today" | "ended";

export function bucketForDaysRemaining(daysRemaining: number): ReminderBucket {
  if (daysRemaining < 0) return "ended";
  if (daysRemaining === 0) return "today";
  if (daysRemaining === 1) return "tomorrow";
  return "heads_up";
}

interface BucketCopy {
  subject: (orgName: string) => string;
  headline: string;
  bodyLead: (orgName: string, trialEndsOn: string) => string;
  cta: string;
  ctaLabel: string;
  /** Hex color for the headline accent. */
  tone: string;
}

const COPY: Record<ReminderBucket, BucketCopy> = {
  heads_up: {
    subject: (org) => `Heads up — ${org}'s Arconique trial ends soon`,
    headline: "Heads up — your trial ends soon",
    bodyLead: (org, ends) =>
      `Your workspace ${org} is still on the free trial through ${ends}. Picking a plan now keeps everything live with no interruption.`,
    cta: "Pick a plan when you have a moment:",
    ctaLabel: "Choose a plan",
    tone: "#111",
  },
  tomorrow: {
    subject: (org) => `${org}'s Arconique trial ends tomorrow`,
    headline: "Your trial ends tomorrow",
    bodyLead: (org, ends) =>
      `Your workspace ${org} ends its trial tomorrow (${ends}). Choose a plan today to avoid the workspace dropping into read-only mode.`,
    cta: "Pick a plan to keep your workspace running:",
    ctaLabel: "Choose a plan",
    tone: "#b45309",
  },
  today: {
    subject: (org) => `${org}'s Arconique trial ends today`,
    headline: "Your trial ends today",
    bodyLead: (org, ends) =>
      `Your workspace ${org} ends its trial today (${ends}). After today the workspace becomes read-only until a plan is selected — no data is lost.`,
    cta: "Pick a plan now to stay live:",
    ctaLabel: "Choose a plan now",
    tone: "#b45309",
  },
  ended: {
    subject: (org) => `${org}'s Arconique trial has ended`,
    headline: "Your Arconique trial has ended",
    bodyLead: (org, ends) =>
      `Your workspace ${org} ended its trial on ${ends} and is now read-only. No work is lost — picking a plan brings it back to full access right away.`,
    cta: "Reactivate by choosing a plan:",
    ctaLabel: "Reactivate workspace",
    tone: "#b91c1c",
  },
};

export const trialExpiryEmailTemplate: EmailTemplate<TrialExpiryEmailData> = {
  key: "trial_expiry",
  render(data: TrialExpiryEmailData): RenderedEmail {
    const bucket = bucketForDaysRemaining(data.daysRemaining);
    const copy = COPY[bucket];

    const subject = copy.subject(data.organizationName);
    const headline = copy.headline;

    const text = [
      `Hi ${data.recipientName},`,
      ``,
      copy.bodyLead(data.organizationName, data.trialEndsOn),
      ``,
      `${copy.cta} ${data.upgradeUrl}`,
      ``,
      `Reply to this email if you'd like a guided walkthrough of the plan options.`,
      ``,
      `— The Arconique team`,
    ].join("\n");

    const html = baseLayout(`
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;color:${copy.tone}">${escapeHtml(
        headline,
      )}</h1>
      <p style="margin:0 0 16px">Hi ${escapeHtml(data.recipientName)},</p>
      <p style="margin:0 0 16px">${escapeHtml(
        copy.bodyLead(data.organizationName, data.trialEndsOn),
      )}</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(
        data.upgradeUrl,
      )}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(
        copy.ctaLabel,
      )}</a></p>
      <p style="margin:0;color:#5f6368">Reply to this email if you'd like a guided walkthrough of the plan options.</p>
      <p style="margin:24px 0 0;color:#5f6368">— The Arconique team</p>
    `);

    return { subject, text, html };
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f6f6f6;color:#111"><div style="max-width:520px;margin:0 auto;background:#fff;padding:32px;border-radius:8px">${content}</div></body></html>`;
}

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

export const trialExpiryEmailTemplate: EmailTemplate<TrialExpiryEmailData> = {
  key: "trial_expiry",
  render(data: TrialExpiryEmailData): RenderedEmail {
    const headline =
      data.daysRemaining < 0
        ? "Your Arconique trial has ended"
        : data.daysRemaining === 0
          ? "Your Arconique trial ends today"
          : `Your Arconique trial ends in ${data.daysRemaining} day${
              data.daysRemaining === 1 ? "" : "s"
            }`;

    const subject = headline;

    const cta =
      data.daysRemaining < 0
        ? "Reactivate by choosing a plan:"
        : "Pick a plan to keep your workspace running:";

    const text = [
      `Hi ${data.recipientName},`,
      ``,
      `${headline} (${data.trialEndsOn}). The workspace "${data.organizationName}" stays read-only after the trial ends until you choose a plan — no work is lost.`,
      ``,
      `${cta} ${data.upgradeUrl}`,
      ``,
      `Reply to this email if you'd like a guided walkthrough of the plan options.`,
      ``,
      `— The Arconique team`,
    ].join("\n");

    const tone =
      data.daysRemaining < 0 ? "#b91c1c" : data.daysRemaining <= 1 ? "#b45309" : "#111";

    const html = baseLayout(`
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;color:${tone}">${escapeHtml(
        headline,
      )}</h1>
      <p style="margin:0 0 16px">Hi ${escapeHtml(data.recipientName)},</p>
      <p style="margin:0 0 16px">Your workspace <strong>${escapeHtml(
        data.organizationName,
      )}</strong> stays read-only after the trial ends (${escapeHtml(
        data.trialEndsOn,
      )}) until you choose a plan — no work is lost.</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(
        data.upgradeUrl,
      )}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Choose a plan</a></p>
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

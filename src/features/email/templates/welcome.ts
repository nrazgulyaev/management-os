import type { EmailTemplate, RenderedEmail } from "./types";

export interface WelcomeEmailData {
  /** Recipient's display name (or email-local-part fallback). */
  recipientName: string;
  /** Workspace / org name shown in copy. */
  organizationName: string;
  /** Absolute URL to the dashboard or onboarding step. */
  dashboardUrl: string;
  /** ISO date string (YYYY-MM-DD) — only present when this is a trial. */
  trialEndsOn?: string;
}

export const welcomeEmailTemplate: EmailTemplate<WelcomeEmailData> = {
  key: "welcome",
  render(data: WelcomeEmailData): RenderedEmail {
    const subject = `Welcome to Arconique, ${data.recipientName}`;
    const trialLine = data.trialEndsOn
      ? `\n\nYour trial runs until ${data.trialEndsOn}. We'll email a reminder before it ends — no surprise charges.`
      : "";
    const text = [
      `Hi ${data.recipientName},`,
      ``,
      `Welcome to Arconique. Your workspace "${data.organizationName}" is set up and ready.`,
      ``,
      `Open the dashboard: ${data.dashboardUrl}${trialLine}`,
      ``,
      `Need help getting started? Reply to this email — we read every message.`,
      ``,
      `— The Arconique team`,
    ].join("\n");

    const trialBlock = data.trialEndsOn
      ? `<p style="margin:0 0 16px;color:#5f6368">Your trial runs until <strong>${escapeHtml(
          data.trialEndsOn,
        )}</strong>. We'll email a reminder before it ends — no surprise charges.</p>`
      : "";

    const html = baseLayout(`
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">Welcome to Arconique, ${escapeHtml(
        data.recipientName,
      )}</h1>
      <p style="margin:0 0 16px">Your workspace <strong>${escapeHtml(
        data.organizationName,
      )}</strong> is set up and ready.</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(
        data.dashboardUrl,
      )}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Open the dashboard</a></p>
      ${trialBlock}
      <p style="margin:0;color:#5f6368">Need help getting started? Reply to this email — we read every message.</p>
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

export { escapeHtml as escapeHtmlForTesting };

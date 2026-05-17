import "server-only";

/**
 * EMAIL-1 — Plain-HTML email templates.
 *
 * No React/JSX renderer dependency — these are minimal inline-styled
 * templates returned as HTML strings + a plain-text fallback. When/if
 * Resend's react-email integration is wanted, swap to <Tailwind>/
 * <Container> components.
 */

const BRAND_TERRA = "#c4583c";
const BRAND_INK = "#1f1d1a";
const BRAND_CREAM = "#f8f3eb";

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:${BRAND_CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND_INK};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};padding:48px 24px;">
    <tr><td>
      <table width="560" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #ece6dc;">
        <tr><td style="padding:32px 40px 16px;">
          <div style="font-size:14px;font-weight:700;letter-spacing:0.1em;color:${BRAND_TERRA};margin-bottom:4px;">ARCONIQUE</div>
        </td></tr>
        <tr><td style="padding:0 40px 32px;">${content}</td></tr>
        <tr><td style="padding:16px 40px;background:${BRAND_CREAM};font-size:11px;color:#7a716a;border-top:1px solid #ece6dc;">
          Premium villa management. <a href="https://arconique.com" style="color:${BRAND_TERRA};text-decoration:none;">arconique.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export interface StatementReadyArgs {
  ownerFirstName: string;
  monthLabel: string;
  villaCode: string | null;
  netToOwnerUsdMinor: bigint;
  portalUrl: string;
}

export function statementReady(args: StatementReadyArgs) {
  const usd = (Number(args.netToOwnerUsdMinor) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const html = wrap(`
    <h1 style="font-size:24px;font-weight:500;margin:0 0 12px;">
      Your ${args.monthLabel} statement is ready
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#3f3a33;">
      Hi ${args.ownerFirstName}, your monthly statement for
      ${args.villaCode ? `<strong>${args.villaCode}</strong>` : "your villa"} is now available.
    </p>
    <div style="margin:24px 0;padding:20px;background:${BRAND_CREAM};border-radius:6px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7a716a;margin-bottom:4px;">Net to you</div>
      <div style="font-size:28px;font-weight:600;color:${BRAND_TERRA};font-feature-settings:'tnum';">USD ${usd}</div>
    </div>
    <p style="margin:0 0 24px;">
      <a href="${args.portalUrl}" style="display:inline-block;padding:10px 20px;background:${BRAND_INK};color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">View statement →</a>
    </p>
    <p style="margin:0;font-size:13px;color:#7a716a;">
      Hash-signed and auditable. Reply to this email if you have questions.
    </p>
  `);
  const text = `Hi ${args.ownerFirstName},

Your ${args.monthLabel} statement for ${args.villaCode ?? "your villa"} is ready.

Net to you: USD ${usd}

View it here: ${args.portalUrl}

— Arconique`;
  return {
    subject: `Your ${args.monthLabel} statement is ready`,
    html,
    text,
  };
}

export interface MagicLinkArgs {
  firstName: string;
  signInUrl: string;
  portalLabel: "owner" | "investor";
}

export function magicLink(args: MagicLinkArgs) {
  const label = args.portalLabel === "owner" ? "owner portal" : "investor portal";
  const html = wrap(`
    <h1 style="font-size:22px;font-weight:500;margin:0 0 12px;">
      Sign in to your ${label}
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#3f3a33;">
      Hi ${args.firstName}, click the button below to sign in.
      The link is valid for 30 minutes.
    </p>
    <p style="margin:24px 0;">
      <a href="${args.signInUrl}" style="display:inline-block;padding:12px 24px;background:${BRAND_TERRA};color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">Sign in →</a>
    </p>
    <p style="margin:0;font-size:12px;color:#7a716a;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `);
  return {
    subject: `Sign in to your Arconique ${label}`,
    html,
    text: `Sign in to your Arconique ${label}: ${args.signInUrl}`,
  };
}

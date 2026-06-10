import type { Metadata } from "next";
import { MailOpen } from "lucide-react";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import { AUTH_PLATFORMS, resolveTokenProduct } from "@/components/auth/auth-copy";

export const metadata: Metadata = { title: "Login · Buyer Portal" };
export const dynamic = "force-dynamic";

/**
 * RESKIN-AUTH-3 — buyer-portal login rebuilt onto the shared
 * <AuthShell> brick (cc-functional-handoff/auth · Auth Suite.html).
 * Buyer is a Development-palette variant per auth-theme.jsx
 * (dataProduct "development", editorial brand panel).
 *
 * Visual only — buyer access remains invitation-only (magic link from
 * the welcome email); there is intentionally no credential form here.
 */
export default function BuyerLoginPage() {
  const plat = AUTH_PLATFORMS.buyer;
  const tokenProduct = resolveTokenProduct(plat.dataProduct);

  return (
    <AuthShell
      dataProduct={tokenProduct}
      wordmarkSub={plat.wordmarkSub}
      tone={plat.tone}
      panelKicker={plat.panelKicker}
      testimonial={plat.testimonial}
      stats={plat.stats}
      footer={
        <span>
          © {new Date().getFullYear()} Arconique · {plat.domain}
        </span>
      }
    >
      <AuthHead eyebrow={plat.badge}>
        {plat.headPre}
        <em>{plat.headEm}</em>
      </AuthHead>
      <p className="auth-sub">
        Buyer portal access is invitation-only. Once Arconique sends you the
        welcome email, click the link there to set your password and sign in.
      </p>

      <div className="auth-callout">
        <span className="auth-callout-ic">
          <MailOpen className="w-[15px] h-[15px]" strokeWidth={1.7} aria-hidden />
        </span>
        <span>
          <strong>Already invited?</strong> Use the magic link in your
          invitation email — it logs you in without a separate password step.
        </span>
      </div>

      <div className="auth-foot-row">
        <span className="muted">
          Need help? Email{" "}
          <a href="mailto:hello@arconique.com" className="auth-link">
            hello@arconique.com
          </a>
          .
        </span>
      </div>
    </AuthShell>
  );
}

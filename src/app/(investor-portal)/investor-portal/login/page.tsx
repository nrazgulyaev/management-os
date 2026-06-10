import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, KeyRound } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import { AUTH_PLATFORMS, resolveTokenProduct } from "@/components/auth/auth-copy";

export const metadata: Metadata = {
  title: "Sign in · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

/**
 * RESKIN-AUTH-3 — investor-portal login rebuilt onto the shared
 * <AuthShell> brick (cc-functional-handoff/auth · Auth Suite.html).
 * Investor is a Development-palette variant per auth-theme.jsx
 * (dataProduct "development", premium-dark brand panel).
 *
 * Visual only — the session gate, the "not an investor" branch and the
 * Supabase-auth handoff via /login are unchanged.
 */
export default async function LoginPage() {
  // If the user is already a valid investor session, redirect to dashboard.
  const investor = await getInvestorSession();
  if (investor) redirect("/investor-portal/dashboard");

  // Authenticated but not an investor — show the gating message.
  const auth = await getCurrentAuthUser();
  const strings = getPortalStrings("en");
  const plat = AUTH_PLATFORMS.investor;
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
      <p className="auth-sub">{plat.sub}</p>

      {auth ? (
        <>
          <div className="auth-notice auth-notice-warn">
            <AlertTriangle
              className="auth-notice-ic w-4 h-4"
              strokeWidth={1.7}
            />
            <span>{strings.notInvestor}</span>
          </div>
          <div className="auth-stack auth-stack-tight">
            <p className="field-help">
              Signed in as <span className="font-mono">{auth.email}</span>
            </p>
            <Link
              href="/development-os"
              className="btn btn-accent btn-lg auth-submit"
            >
              Go to internal app{" "}
              <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
            </Link>
            <a href="/login" className="btn btn-secondary btn-lg auth-submit">
              Sign out
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="auth-callout">
            <span className="auth-callout-ic">
              <KeyRound
                className="w-[15px] h-[15px]"
                strokeWidth={1.7}
                aria-hidden
              />
            </span>
            <span>
              <strong>Demo:</strong> dev seed creates portal access for{" "}
              <span className="font-mono">andrey.demo@example.com</span> and{" "}
              <span className="font-mono">singapore.demo@example.com</span>.
              Use the existing Supabase Auth flow at{" "}
              <Link href="/login" className="auth-link">
                /login
              </Link>{" "}
              and you will be redirected here on success.
            </span>
          </div>
          <div className="auth-stack auth-stack-tight">
            <Link href="/login" className="btn btn-accent btn-lg auth-submit">
              {strings.loginSubmit}{" "}
              <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
            </Link>
          </div>
        </>
      )}

      <div className="auth-foot-row">
        <span className="muted">
          Authentication uses your Arconique-issued credentials. If you
          haven&apos;t received a login email yet, contact your account
          manager.
        </span>
      </div>
    </AuthShell>
  );
}

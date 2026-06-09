import Link from "next/link";
import { headers } from "next/headers";
import { CheckCircle2 } from "lucide-react";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import { resolveAuthPlatform, resolveTokenProduct } from "@/components/auth/auth-copy";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/**
 * RESKIN-AUTH-2 — login screen rebuilt onto the shared <AuthShell>
 * brick (cc-functional-handoff/auth · Auth Suite.html). Token-only
 * `.auth-*` classes, zero inline style.
 *
 * Visual only — the form's fields, forgot-password link, submit and
 * `signInAction` are unchanged (see ./form.tsx).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; onboarded?: string }>;
}) {
  const { isSupabaseAuthConfigured } = await import("@/lib/env");
  const supabaseReady = isSupabaseAuthConfigured();
  const h = await headers();
  const product = h.get("x-product") ?? "";
  const plat = resolveAuthPlatform(product);
  const tokenProduct = resolveTokenProduct(plat.dataProduct);

  const sp = await searchParams;
  const notice =
    sp.reset === "1"
      ? "Your password has been updated. Sign in with your new password."
      : sp.onboarded === "1"
        ? "Your workspace is ready. Sign in to get started."
        : null;

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

      {notice ? (
        <div className="auth-notice auth-notice-ok">
          <CheckCircle2 className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>{notice}</span>
        </div>
      ) : null}

      <LoginForm
        supabaseReady={supabaseReady}
        product={product}
        sso={plat.sso}
      />

      <div className="auth-foot-row">
        {plat.signup ? (
          <span>
            New here?{" "}
            <Link href="/signup" className="auth-link">
              Start a trial
            </Link>
          </span>
        ) : (
          <span className="muted">
            Access is provisioned by your Arconique administrator.
          </span>
        )}
      </div>
    </AuthShell>
  );
}

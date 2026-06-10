import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import { resolveAuthPlatform, resolveTokenProduct } from "@/components/auth/auth-copy";
import { isSupabaseAuthConfigured } from "@/lib/env";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Reset your password · Arconique" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabaseReady = isSupabaseAuthConfigured();
  const h = await headers();
  const plat = resolveAuthPlatform(h.get("x-product"));
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
      <Link href="/login" className="auth-back">
        <ArrowLeft className="w-[15px] h-[15px]" strokeWidth={1.8} /> Back to sign in
      </Link>
      <AuthHead eyebrow="Reset access">
        Forgot your <em>password?</em>
      </AuthHead>
      <p className="auth-sub">
        Enter your work email and we&apos;ll send a secure reset link. It
        expires in 30 minutes.
      </p>

      {sp.error === "link_invalid" ? (
        <div className="auth-notice auth-notice-warn">
          <AlertTriangle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>
            That reset link was invalid or has expired. Request a fresh one
            below.
          </span>
        </div>
      ) : null}

      <ForgotPasswordForm supabaseReady={supabaseReady} />

      <div className="auth-foot-row">
        <span className="muted">
          Didn&apos;t get it? Check spam, or contact your administrator.
        </span>
      </div>
    </AuthShell>
  );
}

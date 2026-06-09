import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight } from "lucide-react";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import { resolveAuthPlatform, resolveTokenProduct } from "@/components/auth/auth-copy";
import { isSupabaseAuthConfigured } from "@/lib/env";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Set a new password · Arconique" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabaseReady = isSupabaseAuthConfigured();
  // `/auth/confirm` exchanges the recovery link for a session before
  // forwarding here. If there's no session, the link was invalid/expired
  // or the page was opened directly.
  const user = supabaseReady ? await getCurrentAuthUser() : null;
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
      <AuthHead eyebrow="Reset access">
        Set a new <em>password.</em>
      </AuthHead>

      {!supabaseReady ? (
        <p className="auth-sub">
          Password recovery becomes active once Supabase auth is configured.
        </p>
      ) : user ? (
        <>
          <p className="auth-sub">
            Choose a new password for{" "}
            <span className="text-ink">{user.email}</span>. Minimum 12
            characters.
          </p>
          <ResetPasswordForm />
        </>
      ) : (
        <>
          <p className="auth-sub">This reset link is invalid or has expired.</p>
          <div className="auth-stack">
            <Link
              href="/forgot-password"
              className="btn btn-accent btn-lg auth-submit"
            >
              Request a new reset link{" "}
              <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}

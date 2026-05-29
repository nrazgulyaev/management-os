import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
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

  return (
    <div className="min-h-screen flex flex-col px-6 md:px-12 lg:px-16 py-10 bg-canvas">
      <Logo />
      <div className="flex-1 flex items-center">
        <div className="max-w-sm w-full mx-auto">
          <span className="text-label">Account recovery</span>
          <h1 className="text-display text-[44px] md:text-[56px] leading-[1.0] font-medium mt-4 text-ink tracking-tight">
            Forgot password?
          </h1>
          <p className="mt-3 text-ink-secondary">
            Enter your work email and we’ll send a link to set a new password.
          </p>

          {sp.error === "link_invalid" ? (
            <div className="mt-6 rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
              That reset link was invalid or has expired. Request a fresh one
              below.
            </div>
          ) : null}

          <ForgotPasswordForm supabaseReady={supabaseReady} />

          <p className="mt-8 text-sm text-ink-secondary">
            Remembered it?{" "}
            <Link href="/login" className="text-ink hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
      <p className="text-xs text-ink-tertiary">
        © {new Date().getFullYear()} Arconique
      </p>
    </div>
  );
}

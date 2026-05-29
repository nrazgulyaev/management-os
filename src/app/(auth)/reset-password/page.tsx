import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
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

  return (
    <div className="min-h-screen flex flex-col px-6 md:px-12 lg:px-16 py-10 bg-canvas">
      <Logo />
      <div className="flex-1 flex items-center">
        <div className="max-w-sm w-full mx-auto">
          <span className="text-label">Account recovery</span>
          <h1 className="text-display text-[44px] md:text-[56px] leading-[1.0] font-medium mt-4 text-ink tracking-tight">
            Set a new password.
          </h1>

          {!supabaseReady ? (
            <p className="mt-3 text-ink-secondary">
              Password recovery becomes active once Supabase auth is
              configured.
            </p>
          ) : user ? (
            <>
              <p className="mt-3 text-ink-secondary">
                Choose a new password for{" "}
                <span className="text-ink">{user.email}</span>. Minimum 12
                characters.
              </p>
              <ResetPasswordForm />
            </>
          ) : (
            <>
              <p className="mt-3 text-ink-secondary">
                This reset link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="mt-8 inline-block text-ink hover:underline"
              >
                Request a new reset link →
              </Link>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-tertiary">
        © {new Date().getFullYear()} Arconique
      </p>
    </div>
  );
}

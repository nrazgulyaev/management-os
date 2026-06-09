import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If the user is already a valid investor session, redirect to dashboard.
  const investor = await getInvestorSession();
  if (investor) redirect("/investor-portal/dashboard");

  // Authenticated but not an investor — show the gating message.
  const auth = await getCurrentAuthUser();
  const strings = getPortalStrings("en");

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-surface border border-line-soft rounded-lg shadow-sm p-8">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl tracking-wide text-ink">
            ARCONIQUE
          </h1>
          <p className="text-sm text-ink-secondary mt-2">{strings.loginTitle}</p>
        </div>
        {auth ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-ink">
              {strings.notInvestor}
            </div>
            <div className="text-xs text-ink-secondary">
              Signed in as <span className="font-mono">{auth.email}</span>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild variant="primary" className="w-full">
                <Link href="/development-os">Go to internal app</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full">
                <a href="/auth/logout">Sign out</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-ink-secondary">
              Authentication uses your Arconique-issued credentials. If you
              haven&apos;t received a login email yet, contact your account
              manager.
            </p>
            <div className="rounded-md border border-line-soft bg-muted p-3 text-xs text-ink-secondary">
              <strong>Demo:</strong> dev seed creates portal access for{" "}
              <span className="font-mono">andrey.demo@example.com</span> and{" "}
              <span className="font-mono">singapore.demo@example.com</span>.
              Use the existing Supabase Auth flow at{" "}
              <Link
                href="/auth/login"
                className="underline hover:text-ink"
              >
                /auth/login
              </Link>{" "}
              and you will be redirected here on success.
            </div>
            <Button asChild variant="primary" className="w-full">
              <Link href="/auth/login">{strings.loginSubmit}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import { getPortalStrings } from "@/lib/investor-portal/translations";

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
      <div className="max-w-md w-full bg-white border border-stone-300 rounded-lg shadow-sm p-8">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl tracking-wide text-stone-900">
            ARCONIQUE
          </h1>
          <p className="text-sm text-stone-600 mt-2">{strings.loginTitle}</p>
        </div>
        {auth ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
              {strings.notInvestor}
            </div>
            <div className="text-xs text-stone-600">
              Signed in as <span className="font-mono">{auth.email}</span>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href="/development-os"
                className="text-center rounded-md bg-stone-900 text-white px-4 py-2 text-sm hover:bg-stone-700 transition-colors"
              >
                Go to internal app
              </Link>
              <a
                href="/auth/logout"
                className="text-center rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50 transition-colors"
              >
                Sign out
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-stone-700">
              Authentication uses your Arconique-issued credentials. If you
              haven&apos;t received a login email yet, contact your account
              manager.
            </p>
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
              <strong>Demo:</strong> dev seed creates portal access for{" "}
              <span className="font-mono">andrey.demo@example.com</span> and{" "}
              <span className="font-mono">singapore.demo@example.com</span>.
              Use the existing Supabase Auth flow at{" "}
              <Link
                href="/auth/login"
                className="underline hover:text-stone-900"
              >
                /auth/login
              </Link>{" "}
              and you will be redirected here on success.
            </div>
            <Link
              href="/auth/login"
              className="block text-center rounded-md bg-stone-900 text-white px-4 py-2 text-sm hover:bg-stone-700 transition-colors"
            >
              {strings.loginSubmit}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

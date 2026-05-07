/**
 * Stage 7.E — Public sign-up page.
 *
 * Step 1 of the onboarding wizard: collect email + org name + slug + plan
 * preference. The actual auth + org-creation atomic flow lives in
 * `src/features/onboarding/actions.ts` (lands together with the email
 * verification + Stripe Checkout redirect bridge).
 *
 * This page is a placeholder UI — wires to existing Supabase auth and
 * the new subscription_plans table for the plan picker.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { Logo } from "@/components/brand/logo";
import { getDb } from "@/lib/db/client";
import { subscriptionPlans } from "@/lib/db/schema/subscriptions";

export const metadata = { title: "Start your trial · Arconique" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const requestedPlan = params.plan ?? "trial";
  const db = getDb();
  const plans = db
    ? await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isPublic, true))
        .orderBy(asc(subscriptionPlans.tierRank))
    : [];

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      <div className="flex flex-col px-6 md:px-12 lg:px-16 py-10">
        <Logo />
        <div className="flex-1 flex items-center">
          <div className="max-w-sm w-full mx-auto">
            <span className="text-label">Arconique Management OS</span>
            <h1 className="text-display text-[40px] leading-[1.05] font-medium mt-4 text-ink">
              Start your 14-day trial
            </h1>
            <p className="mt-3 text-ink-secondary">
              Create your organization. No credit card required for the
              trial.
            </p>

            <form className="mt-8 space-y-4" action="/api/onboarding/start" method="POST">
              <div>
                <label className="text-sm text-ink-secondary block mb-1">
                  Work email
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full rounded border border-stone-300 px-3 py-2"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="text-sm text-ink-secondary block mb-1">
                  Organization name
                </label>
                <input
                  type="text"
                  name="orgName"
                  required
                  className="w-full rounded border border-stone-300 px-3 py-2"
                  placeholder="Acme Villas"
                />
              </div>
              <div>
                <label className="text-sm text-ink-secondary block mb-1">
                  Workspace slug
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    name="orgSlug"
                    pattern="[a-z0-9-]+"
                    required
                    className="flex-1 rounded-l border border-stone-300 px-3 py-2"
                    placeholder="acme"
                  />
                  <span className="px-3 py-2 text-sm text-stone-500 bg-stone-50 border border-l-0 border-stone-300 rounded-r">
                    .arconique.com
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm text-ink-secondary block mb-1">
                  Plan
                </label>
                <select
                  name="planCode"
                  defaultValue={requestedPlan}
                  className="w-full rounded border border-stone-300 px-3 py-2 bg-white"
                >
                  {plans.map((p) => (
                    <option key={p.planCode} value={p.planCode}>
                      {p.displayName}
                      {p.trialPeriodDays > 0 ? ` (${p.trialPeriodDays}-day trial)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-stone-900 text-white py-3 rounded hover:bg-stone-700"
              >
                Create workspace
              </button>
            </form>

            <p className="mt-6 text-xs text-stone-500">
              By signing up you agree to our{" "}
              <Link href="/legal/terms" className="underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="underline">
                Privacy Policy
              </Link>.
            </p>

            <div className="mt-10 pt-6 border-t border-line-soft text-sm">
              Already have an account?{" "}
              <Link href="/login" className="underline">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex bg-stone-50 items-center justify-center">
        <div className="max-w-md text-center px-8">
          <h2 className="font-display text-3xl text-stone-900 mb-3">
            Built for villa operators + developers
          </h2>
          <p className="text-stone-600 leading-relaxed">
            Booking channels. Construction lifecycle. Investor distributions.
            Marketing attribution. AI agents for ops, finance, and tax — all
            in one workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

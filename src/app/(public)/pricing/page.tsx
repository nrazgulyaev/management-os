/**
 * Stage 7.E — Public SaaS pricing page.
 *
 * This is the SaaS subscription pricing surface. The internal
 * `/dashboard/pricing` is a separate dynamic-rev-mgmt pricing tool —
 * not the same domain.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { subscriptionPlans } from "@/lib/db/schema/subscriptions";

export const metadata: Metadata = {
  title: "Pricing · Arconique",
  description:
    "Plans for villa management, construction development, and investor portfolios. Trial included on every plan.",
};
export const dynamic = "force-dynamic";

function formatPrice(monthlyMinor: bigint, currency: string): string {
  const monthly = Number(monthlyMinor) / 100;
  if (monthly === 0) return "Custom";
  return `${currency === "USD" ? "$" : currency + " "}${monthly.toLocaleString("en-US")}/mo`;
}

function formatAnnual(annualMinor: bigint | null, currency: string): string | null {
  if (!annualMinor || annualMinor === 0n) return null;
  const annual = Number(annualMinor) / 100;
  return `${currency === "USD" ? "$" : currency + " "}${annual.toLocaleString("en-US")}/yr`;
}

export default async function PricingPage() {
  const db = getDb();
  const plans = db
    ? await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isPublic, true))
        .orderBy(asc(subscriptionPlans.tierRank))
    : [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="font-display text-4xl tracking-wide text-stone-900 mb-4">
          Plans for every stage of operation
        </h1>
        <p className="text-stone-600 leading-relaxed">
          From a single villa to a 25-property portfolio — pick the plan
          that fits today, upgrade as you grow. Every paid plan includes
          a 14-day free trial. Cancel anytime.
        </p>
      </div>

      {plans.length === 0 ? (
        <div className="text-center text-stone-600">
          Pricing coming soon. <Link href="/contact" className="underline">Contact us</Link> for early access.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((p) => {
            const annual = formatAnnual(p.annualPriceMinor, p.currency);
            return (
              <div
                key={p.planCode}
                className="rounded-md border border-stone-200 p-6 flex flex-col"
              >
                <h2 className="font-display text-2xl text-stone-900 mb-1">
                  {p.displayName}
                </h2>
                <p className="text-stone-600 text-sm mb-4 min-h-[3rem]">
                  {p.description}
                </p>
                <div className="font-display text-3xl text-stone-900 mb-1">
                  {formatPrice(p.monthlyPriceMinor, p.currency)}
                </div>
                {annual && (
                  <div className="text-sm text-stone-500 mb-4">
                    {annual} (~17% off)
                  </div>
                )}
                {p.trialPeriodDays > 0 && (
                  <div className="text-xs uppercase tracking-wider text-emerald-700 mb-4">
                    {p.trialPeriodDays}-day free trial
                  </div>
                )}
                <Link
                  href={
                    p.planCode === "enterprise"
                      ? "/contact?plan=enterprise"
                      : `/sign-up?plan=${p.planCode}`
                  }
                  className="mt-auto inline-block text-center bg-stone-900 text-white py-3 px-6 rounded hover:bg-stone-700"
                >
                  {p.planCode === "enterprise" ? "Contact sales" : "Start trial"}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-16 text-center text-sm text-stone-500">
        Need a custom plan? <Link href="/contact" className="underline">Contact our team</Link>.
      </div>
    </main>
  );
}

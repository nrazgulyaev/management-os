/**
 * Stage 9.B — plan-upgrade page.
 *
 * Lists every public + active subscription plan in tier-rank order,
 * highlights the org's current plan (if it has an active
 * subscription), and renders an "Upgrade to <plan>" / "Switch to
 * <plan>" button per row. The button posts to /api/billing/checkout
 * which creates a Stripe Checkout Session and returns the URL — the
 * client redirects there.
 *
 * If `STRIPE_SECRET_KEY` is not yet set on Vercel (Stage 9.A
 * deferred), the checkout endpoint returns 503 and the form surfaces
 * a clear "Stripe not configured — contact support" message. The UI
 * itself is fully rendered + ready for the moment live keys land.
 *
 * Wired to Stage 7.F.D.3 cabinet gating: when `pageGate` returns this
 * URL with `?locked=<flag>`, the banner above the plan grid explains
 * which feature triggered the upgrade prompt.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { eq, asc, and } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import {
  subscriptionPlans,
  orgSubscriptions,
} from "@/lib/db/schema/subscriptions";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { UpgradeButton } from "./upgrade-button";

export const metadata: Metadata = { title: "Upgrade plan · Billing" };
export const dynamic = "force-dynamic";

function formatPriceMinor(minor: bigint, currency: string): string {
  const major = Number(minor) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(major);
}

interface PlanRow {
  id: string;
  planCode: string;
  displayName: string;
  description: string | null;
  tierRank: number;
  monthlyPriceMinor: bigint;
  annualPriceMinor: bigint | null;
  currency: string;
  trialPeriodDays: number;
  hasMonthlyPriceId: boolean;
  hasAnnualPriceId: boolean;
  isInternal: boolean;
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: Promise<{ locked?: string; checkout?: string; reason?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Upgrade plan" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </div>
    );
  }
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");

  const rawPlans = await db
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.isActive, true),
        eq(subscriptionPlans.isPublic, true),
      ),
    )
    .orderBy(asc(subscriptionPlans.tierRank));

  const plans: PlanRow[] = rawPlans.map((p) => ({
    id: p.id,
    planCode: p.planCode,
    displayName: p.displayName,
    description: p.description,
    tierRank: p.tierRank,
    monthlyPriceMinor: p.monthlyPriceMinor,
    annualPriceMinor: p.annualPriceMinor,
    currency: p.currency,
    trialPeriodDays: p.trialPeriodDays,
    hasMonthlyPriceId: !!p.stripeMonthlyPriceId,
    hasAnnualPriceId: !!p.stripeAnnualPriceId,
    isInternal: p.isInternal,
  }));

  const activeSub = org
    ? await db
        .select()
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.organizationId, org.id))
        .limit(1)
        .then((rows) => rows[0])
    : null;
  const currentPlanCode = activeSub?.planCode ?? null;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Billing", href: "/dashboard/billing" },
          { label: "Upgrade" },
        ]}
        title="Pick a plan"
        description={
          currentPlanCode
            ? `Your workspace is on the ${currentPlanCode} plan. Switching takes effect at the next billing cycle.`
            : "Pick a plan to activate your workspace."
        }
      />

      {sp.locked && (
        <div className="rounded border border-warning/40 bg-warning-weak/30 px-4 py-3 text-sm text-ink-secondary">
          <span className="font-medium">Upgrade required.</span>{" "}
          The feature you tried to access (<span className="font-mono text-xs">{sp.locked}</span>)
          isn't included in your current plan. Pick a higher tier below.
        </div>
      )}
      {sp.checkout === "cancelled" && (
        <div className="rounded border border-line-soft bg-muted/30 px-4 py-3 text-sm text-ink-secondary">
          You cancelled the Stripe Checkout flow — your workspace is unchanged.
          Pick a plan again whenever you're ready.
        </div>
      )}
      {sp.reason === "no_customer" && (
        <div className="rounded border border-line-soft bg-muted/30 px-4 py-3 text-sm text-ink-secondary">
          You don't have a Stripe customer record yet — pick a plan to start.
        </div>
      )}

      <Section eyebrow="Plans" title={`${plans.length} plan${plans.length === 1 ? "" : "s"} available`}>
        {plans.length === 0 ? (
          <EmptyState
            title="No plans configured"
            description="The subscription_plans table has no public + active rows. Apply migration 0085 + the seed."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((p) => {
              const isCurrent = currentPlanCode === p.planCode;
              const isFree = p.monthlyPriceMinor === 0n;
              return (
                <div
                  key={p.id}
                  className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-medium">{p.displayName}</h3>
                    {isCurrent && <Badge tone="success">Current</Badge>}
                  </div>
                  <div>
                    <span className="text-2xl font-semibold tabular-nums">
                      {isFree ? "Free" : formatPriceMinor(p.monthlyPriceMinor, p.currency)}
                    </span>
                    {!isFree && (
                      <span className="text-sm text-ink-tertiary"> / month</span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-sm text-ink-secondary leading-relaxed">
                      {p.description}
                    </p>
                  )}
                  {p.trialPeriodDays > 0 && (
                    <p className="text-xs text-ink-tertiary">
                      Includes a {p.trialPeriodDays}-day trial.
                    </p>
                  )}
                  <div className="mt-auto pt-3 flex flex-col gap-2">
                    {p.isInternal ? (
                      <Badge tone="neutral">Internal — by invitation</Badge>
                    ) : !p.hasMonthlyPriceId ? (
                      <Badge tone="warning">Stripe price not yet configured</Badge>
                    ) : isCurrent ? (
                      <Link
                        href="/api/billing/portal"
                        className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium hover:bg-muted/40"
                      >
                        Manage subscription →
                      </Link>
                    ) : (
                      <UpgradeButton
                        planCode={p.planCode}
                        displayName={p.displayName}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section eyebrow="Help" title="Questions?">
        <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
          Plan features + per-plan AI eligibility are documented at{" "}
          <Link href="/dashboard/settings/ai-agents" className="underline">
            /dashboard/settings/ai-agents
          </Link>
          . Contact{" "}
          <a href="mailto:support@arconique.com" className="underline">
            support@arconique.com
          </a>{" "}
          for custom (Enterprise) terms or annual billing.
        </p>
      </Section>
    </div>
  );
}

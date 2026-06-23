/**
 * Sprint 3b — plan-upgrade page (post packaging rewrite).
 *
 * Reads `plan_packaging` (12 rows, 3 plan kinds × 4 tiers, Sprint-3b
 * source of truth) and renders an upgrade card per *packaging*. The
 * Stage-9.B subscription_plans-keyed implementation was retired in
 * Sprint 3b: customers now subscribe to a packaging (e.g.
 * "mgmt-only-pro", "bundle-scale"), and the mapping resolves it to
 * a `plan_code` for gating + a `products_enabled` array for cabinet
 * visibility.
 *
 * Current-packaging detection compares the org's
 * `org_subscriptions.plan_code` AND its `organizations.products_enabled`
 * against each row. A packaging is "current" iff its plan_code matches
 * AND its products_enabled multiset equals the org's.
 *
 * If `STRIPE_SECRET_KEY` is absent (Stage 9.A deferred), the checkout
 * endpoint still returns 503; the button surfaces a clear message.
 *
 * Wired to Stage 7.F.D.3 cabinet gating: `?locked=<flag>` continues
 * to display the explanatory banner above the grid.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { eq, asc, and } from "drizzle-orm";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import {
  planPackaging,
  orgSubscriptions,
} from "@/lib/db/schema/subscriptions";
import { organizations } from "@/lib/db/schema/saas";
import { requireOrgId } from "@/features/auth/require-org";
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

interface PackagingRow {
  id: string;
  packagingKey: string;
  planKind: string;
  tierKey: string;
  planCode: string;
  productsEnabled: string[];
  displayName: string;
  monthlyPriceMinor: bigint;
  annualPriceMinor: bigint;
  currency: string;
  hasMonthlyPriceId: boolean;
  hasAnnualPriceId: boolean;
  isEnterprise: boolean;
}

function arraysEqualAsSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const x of b) if (!set.has(x)) return false;
  return true;
}

function packagingDisplayName(row: {
  planKind: string;
  tierKey: string;
}): string {
  const kindLabel =
    row.planKind === "management-only"
      ? "Management"
      : row.planKind === "development-only"
        ? "Development"
        : "Bundle";
  const tierLabel = row.tierKey[0].toUpperCase() + row.tierKey.slice(1);
  return `${kindLabel} · ${tierLabel}`;
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: Promise<{
    locked?: string;
    checkout?: string;
    reason?: string;
    cycle?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const cycle: "monthly" | "annual" =
    sp.cycle === "annual" ? "annual" : "monthly";

  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <div className="page-header">
          <div className="left">
            <h1>Upgrade plan</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </div>
    );
  }
  let orgId: string | null = null;
  try {
    orgId = await requireOrgId();
  } catch {
    orgId = null;
  }

  const rawPackagings = await db
    .select()
    .from(planPackaging)
    .where(
      and(
        eq(planPackaging.isActive, true),
        eq(planPackaging.isPublic, true),
      ),
    )
    .orderBy(asc(planPackaging.sortOrder));

  const packagings: PackagingRow[] = rawPackagings.map((p) => ({
    id: p.id,
    packagingKey: p.packagingKey,
    planKind: p.planKind,
    tierKey: p.tierKey,
    planCode: p.planCode,
    productsEnabled: p.productsEnabled,
    displayName: packagingDisplayName(p),
    monthlyPriceMinor: p.monthlyPriceMinor,
    annualPriceMinor: p.annualPriceMinor,
    currency: p.currency,
    hasMonthlyPriceId: !!p.stripeMonthlyPriceId,
    hasAnnualPriceId: !!p.stripeAnnualPriceId,
    isEnterprise: p.tierKey === "enterprise",
  }));

  // Resolve current packaging: (plan_code, products_enabled) must
  // match the active subscription + org. A trialing org with plan_code
  // = 'trial' won't match any packaging here — that's fine, the page
  // simply has no "Current" badge until they upgrade.
  let currentPackagingKey: string | null = null;
  if (orgId) {
    const activeSub = await db
      .select({ planCode: orgSubscriptions.planCode })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1)
      .then((rows) => rows[0]);
    const orgRow = await db
      .select({ productsEnabled: organizations.productsEnabled })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
      .then((rows) => rows[0]);
    if (activeSub && orgRow) {
      const orgProducts = orgRow.productsEnabled ?? [];
      const match = packagings.find(
        (p) =>
          p.planCode === activeSub.planCode &&
          arraysEqualAsSet(p.productsEnabled, orgProducts),
      );
      currentPackagingKey = match?.packagingKey ?? null;
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Billing</Link> /{" "}
            <span>Upgrade</span>
          </div>
          <h1>Pick a plan</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {currentPackagingKey
              ? `Your workspace is on the ${currentPackagingKey} packaging. Switching takes effect at the next billing cycle.`
              : "Pick a packaging to activate your workspace."}
          </p>
        </div>
      </div>

      {sp.locked && (
        <div className="rounded border border-warning/40 bg-warning-weak/30 px-4 py-3 text-sm text-ink-secondary">
          <span className="font-medium">Upgrade required.</span>{" "}
          The feature you tried to access (
          <span className="font-mono text-xs">{sp.locked}</span>) isn't
          included in your current plan. Pick a higher tier below.
        </div>
      )}
      {sp.checkout === "success" && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Payment received — thank you! Your subscription is being activated;
          the new plan and limits apply within a few moments (the Stripe webhook
          finalises it). Refresh if you don&apos;t see the change yet.
        </div>
      )}
      {sp.checkout === "cancelled" && (
        <div className="rounded border border-line-soft bg-muted/30 px-4 py-3 text-sm text-ink-secondary">
          You cancelled the Stripe Checkout flow — your workspace is
          unchanged. Pick a plan again whenever you're ready.
        </div>
      )}
      {sp.reason === "no_customer" && (
        <div className="rounded border border-line-soft bg-muted/30 px-4 py-3 text-sm text-ink-secondary">
          You don't have a Stripe customer record yet — pick a plan to
          start.
        </div>
      )}

      <div>
        <div className="label mb-2.5">Plans</div>
        <p className="text-[13px] text-ink-3 mt-0 mb-3 max-w-[680px]">
          {`${packagings.length} packaging${packagings.length === 1 ? "" : "s"} available`}{" "}
          · Billing cycle: {cycle}. Switch via ?cycle=annual or the public
          /pricing toggle.
        </p>
        {packagings.length === 0 ? (
          <EmptyState
            title="No packagings configured"
            description="The plan_packaging table has no public + active rows. Apply migration 0096 + the seed."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packagings.map((p) => {
              const isCurrent = currentPackagingKey === p.packagingKey;
              const priceMinor =
                cycle === "annual" ? p.annualPriceMinor : p.monthlyPriceMinor;
              const hasPriceId =
                cycle === "annual" ? p.hasAnnualPriceId : p.hasMonthlyPriceId;
              const isFree = priceMinor === 0n;
              return (
                <Card
                  key={p.id}
                  padding="default"
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-medium">{p.displayName}</h3>
                    {isCurrent && <HandoffBadge tone="ok">Current</HandoffBadge>}
                  </div>
                  <div>
                    <span className="text-2xl font-semibold tabular-nums">
                      {p.isEnterprise
                        ? "Custom"
                        : isFree
                          ? "Free"
                          : formatPriceMinor(priceMinor, p.currency)}
                    </span>
                    {!p.isEnterprise && !isFree && (
                      <span className="text-sm text-ink-tertiary">
                        {cycle === "annual" ? " / year" : " / month"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-tertiary">
                    {p.planKind} · plan_code:{" "}
                    <span className="font-mono">{p.planCode}</span> ·
                    products: {p.productsEnabled.join(", ") || "—"}
                  </p>
                  <div className="mt-auto pt-3 flex flex-col gap-2">
                    {p.isEnterprise ? (
                      <Link
                        href="/contact?subject=enterprise"
                        className="btn btn-secondary btn-sm"
                      >
                        Talk to sales →
                      </Link>
                    ) : !hasPriceId ? (
                      <HandoffBadge tone="warn">
                        Stripe price not yet provisioned
                      </HandoffBadge>
                    ) : isCurrent ? (
                      /* API redirect endpoint — plain anchor so the router
                         never prefetches it (a <Link> logs a 503 in console
                         while Stripe is unconfigured). */
                      <a
                        href="/api/billing/portal"
                        className="btn btn-secondary btn-sm"
                      >
                        Manage subscription →
                      </a>
                    ) : (
                      <UpgradeButton
                        packagingKey={p.packagingKey}
                        displayName={p.displayName}
                        billingCycle={cycle}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Help</div>
        <Card padding="default">
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose m-0">
            Plan features + per-plan AI eligibility are documented at{" "}
            <Link
              href="/dashboard/settings/ai-agents"
              className="underline"
            >
              /dashboard/settings/ai-agents
            </Link>
            . Contact{" "}
            <a
              href="mailto:support@arconique.com"
              className="underline"
            >
              support@arconique.com
            </a>{" "}
            for custom (Enterprise) terms.
          </p>
        </Card>
      </div>
    </div>
  );
}

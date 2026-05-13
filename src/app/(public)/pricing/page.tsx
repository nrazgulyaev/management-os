/**
 * Sprint 3a + 3b — consolidated `/pricing` page.
 *
 * Three columns (Management only · Development only · Bundle), four
 * tiers per column. Sprint 3b adds the Monthly / Annual toggle and
 * wires each tier's CTA to `/signup?packaging_key=…&cycle=…` so the
 * existing trial-then-tier flow can read both fields.
 *
 * Reads tiers from src/lib/marketing/pricing-tiers.ts.
 *
 * Visual: leans into the 10.6.C.1 gradient hero tokens —
 * emerald-soft / gold-soft / coral-soft per column, rounded-3xl card
 * mass, soft shadows, Fraunces display headlines.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import {
  PRICING_COPY,
  PRICING_FAQ,
  PRICING_PLANS,
  type PricingTier,
} from "@/lib/marketing/pricing-tiers";
import { packagingKeyFor } from "@/lib/billing/marketing-mapping";
import { PricingCycleToggle } from "@/components/marketing/pricing-cycle-toggle";

export const metadata: Metadata = {
  title: "Pricing · Arconique",
  description:
    "Run villas, develop the next one, or both. Plans from $79/mo. 14-day free trial, no credit card.",
};

function formatPrice(monthlyUsd: number | null): string {
  if (monthlyUsd === null) return "Custom";
  return `$${monthlyUsd}`;
}

function formatLimit(value: number | "custom" | undefined): string {
  if (value === undefined) return "—";
  if (value === "custom") return "Custom";
  return value.toLocaleString();
}

interface LimitRowSpec {
  label: string;
  key: keyof PricingTier["limits"];
}

const LIMIT_ROWS_BY_PLAN: Record<string, LimitRowSpec[]> = {
  "management-only": [
    { label: "Villas", key: "villas" },
    { label: "Users", key: "users" },
    { label: "AI calls / mo", key: "aiCalls" },
  ],
  "development-only": [
    { label: "Projects", key: "projects" },
    { label: "Users", key: "users" },
    { label: "AI calls / mo", key: "aiCalls" },
  ],
  bundle: [
    { label: "Villas", key: "villas" },
    { label: "Projects", key: "projects" },
    { label: "Users", key: "users" },
    { label: "AI calls / mo", key: "aiCalls" },
  ],
};

export default function PricingPage() {
  return (
    <div
      className="min-h-screen bg-canvas"
      data-stage10="pricing-page-consolidated"
    >
      {/* Hero */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-28 flex flex-col items-center text-center gap-6">
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary font-medium">
            Pricing
          </span>
          <h1 className="text-display text-[44px] md:text-[80px] leading-[1.02] font-medium text-ink tracking-tight max-w-3xl">
            One platform.{" "}
            <em className="not-italic text-accent italic">Pay for what you run.</em>
          </h1>
          <p className="text-ink-secondary text-base md:text-xl leading-relaxed max-w-2xl">
            {PRICING_COPY.trialBanner}. Annual saves{" "}
            {PRICING_COPY.annualDiscountPct}%. Enterprise tiers are custom —
            we'll work it out together.
          </p>
          <PricingCycleToggle
            annualDiscountPct={PRICING_COPY.annualDiscountPct}
            className="mt-2"
          />
        </div>
      </section>

      {/* Plan grid */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-16 md:py-24">
          <div
            className="group grid grid-cols-1 lg:grid-cols-3 gap-6"
            data-pricing-grid="root"
            data-cycle="monthly"
          >
            {PRICING_PLANS.map((plan) => {
              const limitRows = LIMIT_ROWS_BY_PLAN[plan.key];
              return (
                <article
                  key={plan.key}
                  id={plan.key.replace(/-only$/, "")}
                  className={`rounded-3xl border border-line-soft shadow-soft-card overflow-hidden flex flex-col ${plan.toneClass}`}
                >
                  <header className="px-6 md:px-7 py-7 md:py-8 border-b border-line-soft/60">
                    <h2 className="text-display text-[26px] md:text-[32px] leading-[1.05] font-medium text-ink tracking-tight">
                      {plan.name}
                    </h2>
                    <p className="mt-2 text-sm md:text-base text-ink-secondary leading-relaxed">
                      {plan.tagline}
                    </p>
                  </header>

                  <div className="flex flex-col divide-y divide-line-soft/60 bg-surface/40">
                    {plan.tiers.map((tier) => (
                      <TierRow
                        key={tier.key}
                        tier={tier}
                        limitRows={limitRows}
                        planKey={plan.key}
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trial banner */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-12 md:py-16">
          <div className="rounded-3xl border border-line-soft bg-gradient-coral-soft shadow-elevated-card p-8 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                Start free
              </span>
              <p className="mt-2 text-display text-[24px] md:text-[32px] leading-[1.1] font-medium text-ink tracking-tight">
                {PRICING_COPY.trialBanner}.
              </p>
              <p className="mt-3 text-xs md:text-sm text-ink-tertiary">
                {PRICING_COPY.aiOverageNote}.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href={PRICING_COPY.defaultStartCta.href}
                className="inline-flex items-center gap-2 rounded-3xl bg-ink text-ink-inverse px-6 h-12 text-sm font-medium shadow-soft-card hover:bg-ink/90 transition-colors"
              >
                {PRICING_COPY.defaultStartCta.label}
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              </Link>
              <Link
                href={PRICING_COPY.enterpriseCta.href}
                className="inline-flex items-center gap-2 rounded-3xl bg-surface text-ink border border-line-soft px-6 h-12 text-sm font-medium hover:bg-muted transition-colors"
              >
                {PRICING_COPY.enterpriseCta.label}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-28">
          <div className="max-w-2xl mb-12 md:mb-16">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Frequently asked
            </span>
            <h2 className="mt-4 text-display text-[32px] md:text-[48px] leading-[1.05] font-medium text-ink tracking-tight">
              Questions, answered.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {PRICING_FAQ.map((entry) => (
              <div
                key={entry.q}
                className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 md:p-7"
              >
                <h3 className="text-ink font-medium text-base md:text-lg leading-tight">
                  {entry.q}
                </h3>
                <p className="mt-3 text-sm text-ink-secondary leading-relaxed">
                  {entry.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Tier row (one per tier per plan column)
// ============================================================================

function TierRow({
  tier,
  limitRows,
  planKey,
}: {
  tier: PricingTier;
  limitRows: LimitRowSpec[];
  planKey: string;
}) {
  const isEnterprise = tier.key === "enterprise";
  const packagingKey = packagingKeyFor(
    planKey as "management-only" | "development-only" | "bundle",
    tier.key,
  );
  // Sprint 3b — CTA encodes packaging_key + cycle so the trial flow
  // (and Sprint 3c's checkout redirect after the trial) can read it.
  // The cycle reflects the grid's current data-cycle (set by the
  // PricingCycleToggle); the toggle dispatches `pricing-cycle-change`
  // events so any other surface that depends on `cycle` can subscribe.
  const ctaMonthly = isEnterprise
    ? PRICING_COPY.enterpriseCta
    : {
        label: PRICING_COPY.defaultStartCta.label,
        href: `${PRICING_COPY.defaultStartCta.href}?packaging_key=${packagingKey}&cycle=monthly`,
      };
  const ctaAnnual = isEnterprise
    ? PRICING_COPY.enterpriseCta
    : {
        label: PRICING_COPY.defaultStartCta.label,
        href: `${PRICING_COPY.defaultStartCta.href}?packaging_key=${packagingKey}&cycle=annual`,
      };

  // Annual price (rounded to whole dollars for display). The
  // plan_packaging table holds the canonical cents value; this
  // displayed number is recomputed from the marketing-tier source so
  // anyone re-reading the file can audit the math against the spec.
  const annualMonthlyEquivalent =
    tier.monthlyUsd === null
      ? null
      : Math.round((tier.monthlyUsd * 12 * 0.85) / 12);

  return (
    <div
      className={`px-6 md:px-7 py-7 flex flex-col gap-4 ${
        tier.highlight ? "bg-surface/80" : ""
      }`}
      data-tier-highlight={tier.highlight ? "true" : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-display text-[20px] md:text-[22px] leading-tight font-medium text-ink">
            {tier.name}
          </h3>
          {tier.highlight && (
            <span className="inline-flex items-center rounded-full bg-accent text-accent-contrast text-[10px] font-medium px-2 py-0.5 uppercase tracking-[0.12em]">
              Recommended
            </span>
          )}
        </div>
        <div
          className="flex items-baseline gap-1 font-mono tabular-nums"
          data-price-stack="true"
        >
          {/* Monthly price — visible when grid data-cycle=monthly */}
          <span
            className="text-display text-[28px] md:text-[32px] leading-none font-medium text-ink group-data-[cycle=annual]:hidden"
            data-cycle-price="monthly"
          >
            {formatPrice(tier.monthlyUsd)}
          </span>
          {/* Annual price-per-month — visible when grid data-cycle=annual */}
          <span
            className="text-display text-[28px] md:text-[32px] leading-none font-medium text-ink hidden group-data-[cycle=annual]:inline"
            data-cycle-price="annual"
          >
            {formatPrice(annualMonthlyEquivalent)}
          </span>
          {tier.monthlyUsd !== null && (
            <span className="text-ink-tertiary text-xs">/mo</span>
          )}
        </div>
      </div>

      <p className="text-xs md:text-sm text-ink-tertiary leading-relaxed">
        {tier.pitch}
      </p>

      <ul className="flex flex-col gap-1.5 text-xs text-ink-secondary border border-line-soft/60 rounded-2xl px-4 py-3 bg-surface/60">
        {limitRows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-2"
          >
            <span>{row.label}</span>
            <span className="font-mono tabular-nums text-ink">
              {formatLimit(tier.limits[row.key])}
            </span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-1.5 text-xs md:text-sm text-ink-secondary">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check
              className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5"
              strokeWidth={2}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {/* Two CTAs rendered; toggle hides one. Enterprise uses the
          same href for both so this is also a no-op for that tier. */}
      <Link
        href={ctaMonthly.href}
        data-cycle-cta="monthly"
        className={`inline-flex items-center justify-center gap-1.5 rounded-3xl px-5 h-10 text-xs md:text-sm font-medium transition-colors mt-1 group-data-[cycle=annual]:hidden ${
          tier.highlight
            ? "bg-ink text-ink-inverse hover:bg-ink/90"
            : "bg-surface text-ink border border-line-soft hover:bg-muted"
        }`}
      >
        {ctaMonthly.label}
        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
      </Link>
      <Link
        href={ctaAnnual.href}
        data-cycle-cta="annual"
        className={`hidden group-data-[cycle=annual]:inline-flex items-center justify-center gap-1.5 rounded-3xl px-5 h-10 text-xs md:text-sm font-medium transition-colors mt-1 ${
          tier.highlight
            ? "bg-ink text-ink-inverse hover:bg-ink/90"
            : "bg-surface text-ink border border-line-soft hover:bg-muted"
        }`}
      >
        {ctaAnnual.label}
        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

import Link from "next/link";
import { ArrowUpRight, Check, X } from "lucide-react";
import { HeroSection } from "@/components/marketing/hero-section";
import { Button } from "@/components/ui/button";
import {
  ScrollReveal,
  ScrollStagger,
  ScrollStaggerItem,
} from "@/components/motion/scroll-reveal";
import {
  type ProductPricing,
  type PricingTier,
  formatTierPrice,
  TRIAL_BANNER_COPY,
} from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";

/**
 * Stage 10.I.4 — Shared pricing-page renderer. Both
 * /pricing/management-os and /pricing/development-os pass their
 * `ProductPricing` config through this component.
 *
 * Server component — no client interactivity beyond Next.js Link
 * navigation. The signup CTA wires through to /signup?product=…
 * (10.I.5 ships the form).
 */

export function PricingPage({ pricing }: { pricing: ProductPricing }) {
  return (
    <>
      <HeroSection
        eyebrow={`Pricing · ${pricing.productLabel}`}
        title={
          <>
            Choose a plan.{" "}
            <em className="not-italic text-accent italic">Trial first.</em>
          </>
        }
        description={`${pricing.tagline} ${TRIAL_BANNER_COPY}.`}
        primaryCta={{
          label: "Start free trial",
          href: `/signup?product=${pricing.product}`,
        }}
        secondaryCta={{ label: "Talk to sales", href: "/contact" }}
        kind="pillar"
      />

      {/* Tier cards */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollStagger className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {pricing.tiers.map((t) => (
              <ScrollStaggerItem key={t.key}>
                <TierCard tier={t} />
              </ScrollStaggerItem>
            ))}
          </ScrollStagger>
          <p className="mt-8 text-xs text-ink-tertiary text-center">
            All prices in USD. {TRIAL_BANNER_COPY}.
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-b border-line-soft py-20 md:py-28 bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="max-w-2xl mb-10 md:mb-12">
              <span className="text-label">Compare plans</span>
              <h2 className="mt-4 font-display text-2xl md:text-4xl tracking-[-0.02em] text-ink leading-[1.1]">
                Feature matrix.
              </h2>
            </div>
          </ScrollReveal>
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Feature</th>
                  {pricing.tiers.map((t) => (
                    <th
                      key={t.key}
                      className={cn(
                        "text-left px-4 py-3 font-medium",
                        t.highlight && "text-ink",
                      )}
                    >
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {pricing.comparison.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3 text-ink">{row.feature}</td>
                    {pricing.tiers.map((t) => {
                      const v = row.values[t.key];
                      return (
                        <td
                          key={t.key}
                          className={cn(
                            "px-4 py-3 text-ink-secondary",
                            v === "✓" && "text-success",
                            v === "—" && "text-ink-tertiary",
                          )}
                        >
                          {v === "✓" ? (
                            <Check
                              className="w-4 h-4 text-success"
                              strokeWidth={2}
                            />
                          ) : v === "—" ? (
                            <X
                              className="w-3.5 h-3.5 text-ink-tertiary"
                              strokeWidth={1.75}
                            />
                          ) : (
                            v
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1100px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="max-w-xl mb-10 md:mb-12">
              <span className="text-label">FAQ</span>
              <h2 className="mt-4 font-display text-2xl md:text-4xl tracking-[-0.02em] text-ink leading-[1.1]">
                Common questions.
              </h2>
            </div>
          </ScrollReveal>
          <ScrollStagger className="flex flex-col gap-4">
            {pricing.faq.map((q) => (
              <ScrollStaggerItem key={q.question}>
                <details className="group rounded-md border border-line-soft bg-surface px-5 py-4">
                  <summary className="cursor-pointer flex items-center justify-between gap-3 list-none">
                    <span className="text-sm font-medium text-ink">
                      {q.question}
                    </span>
                    <span className="text-ink-tertiary text-xs group-open:rotate-45 transition-transform">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-ink-secondary leading-relaxed">
                    {q.answer}
                  </p>
                </details>
              </ScrollStaggerItem>
            ))}
          </ScrollStagger>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="rounded-md border border-line-soft bg-surface p-10 md:p-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="max-w-xl">
                <span className="text-label">{TRIAL_BANNER_COPY}</span>
                <h2 className="mt-3 font-display text-2xl md:text-4xl tracking-[-0.02em] text-ink leading-[1.1]">
                  Spin up a workspace.
                </h2>
                <p className="mt-4 text-sm md:text-base text-ink-secondary leading-relaxed">
                  Bring your data, walk the audit trail, decide later.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Button asChild size="lg">
                  <Link href={`/signup?product=${pricing.product}`}>
                    Start free trial
                    <ArrowUpRight
                      className="w-4 h-4"
                      strokeWidth={1.75}
                    />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/contact">Talk to sales</Link>
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

function TierCard({ tier }: { tier: PricingTier }) {
  const isHighlighted = !!tier.highlight;
  return (
    <div
      className={cn(
        "rounded-md border bg-surface p-7 md:p-8 flex flex-col gap-5 h-full",
        isHighlighted
          ? "border-ink shadow-[var(--shadow-floating)]"
          : "border-line-soft",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-base text-ink">{tier.name}</h3>
        {isHighlighted && (
          <span className="text-[10px] tracking-[0.18em] uppercase text-ink-inverse bg-ink rounded-sm px-2 py-1">
            Recommended
          </span>
        )}
      </div>
      <p className="text-xs text-ink-tertiary leading-relaxed">
        {tier.bestFor}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-4xl tracking-[-0.02em] text-ink">
          {formatTierPrice(tier)}
        </span>
        {tier.monthlyUsd !== null && (
          <span className="text-sm text-ink-tertiary">/mo</span>
        )}
      </div>
      <span className="text-[11px] text-ink-tertiary">{tier.limit}</span>
      <ul className="flex flex-col gap-2.5 text-sm text-ink-secondary">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check
              className="w-3.5 h-3.5 text-success mt-1 shrink-0"
              strokeWidth={2}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-2">
        <Button
          asChild
          className="w-full"
          variant={isHighlighted ? "primary" : "secondary"}
        >
          <Link href={tier.cta.href}>
            {tier.cta.label}
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </Button>
      </div>
    </div>
  );
}

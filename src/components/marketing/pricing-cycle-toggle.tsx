/**
 * Sprint 3b — Monthly / Annual cycle toggle for the consolidated
 * `/pricing` page.
 *
 * Client component. State lives here; the page below renders prices
 * for both cycles and the toggle reveals one set at a time via a
 * `data-cycle` attribute on the wrapper. This avoids re-rendering the
 * server-rendered tier grid on every click — Tailwind selectors do
 * the show/hide work.
 *
 * Conventions:
 *   - Defaults to "monthly".
 *   - Annual price = round(monthly × 12 × 0.85). Pre-computed by the
 *     server (see plan_packaging.annual_price_minor) so the toggle
 *     is purely a presentation choice.
 *   - The data attribute is `data-cycle="monthly" | "annual"` on the
 *     toggle's wrapper; the pricing page wraps the tier grid in a
 *     div that consumes it via Tailwind's data-[…] variants.
 *
 * The toggle deliberately exposes `cycle` via a CustomEvent
 * (`pricing-cycle-change`) so any sibling component (e.g. a CTA that
 * needs to append `&cycle=annual` to its href) can subscribe without
 * forcing a state-management layer.
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type BillingCycle = "monthly" | "annual";

export interface PricingCycleToggleProps {
  /** Initial cycle. Defaults to monthly. */
  defaultCycle?: BillingCycle;
  /** Percentage saving copy shown next to the "Annual" label. */
  annualDiscountPct?: number;
  className?: string;
}

export function PricingCycleToggle({
  defaultCycle = "monthly",
  annualDiscountPct = 15,
  className,
}: PricingCycleToggleProps) {
  const [cycle, setCycle] = React.useState<BillingCycle>(defaultCycle);

  // Reflect cycle on the closest ancestor with [data-pricing-grid="root"]
  // so the grid's Tailwind data-[cycle=…] variants pick up the toggle.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>(
      '[data-pricing-grid="root"]',
    );
    if (root) root.dataset.cycle = cycle;
    // Broadcast for sibling CTAs that depend on the cycle.
    document.dispatchEvent(
      new CustomEvent<BillingCycle>("pricing-cycle-change", { detail: cycle }),
    );
  }, [cycle]);

  return (
    <div
      role="tablist"
      aria-label="Billing cycle"
      className={cn(
        "inline-flex items-center rounded-full border border-line-soft bg-surface p-1 shadow-soft-card",
        className,
      )}
      data-pricing-cycle-toggle="true"
    >
      <button
        type="button"
        role="tab"
        aria-selected={cycle === "monthly"}
        onClick={() => setCycle("monthly")}
        className={cn(
          "px-4 h-9 rounded-full text-xs md:text-sm font-medium transition-colors",
          cycle === "monthly"
            ? "bg-ink text-ink-inverse"
            : "text-ink-secondary hover:text-ink",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={cycle === "annual"}
        onClick={() => setCycle("annual")}
        className={cn(
          "px-4 h-9 rounded-full text-xs md:text-sm font-medium transition-colors inline-flex items-center gap-1.5",
          cycle === "annual"
            ? "bg-ink text-ink-inverse"
            : "text-ink-secondary hover:text-ink",
        )}
      >
        Annual
        <span
          className={cn(
            "rounded-full text-[10px] font-medium px-1.5 py-0.5 tabular-nums",
            cycle === "annual"
              ? "bg-ink-inverse/15 text-ink-inverse"
              : "bg-success-weak text-success",
          )}
        >
          −{annualDiscountPct}%
        </span>
      </button>
    </div>
  );
}

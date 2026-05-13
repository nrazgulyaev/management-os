/**
 * Sprint 4 — KpiRowMixed primitive.
 *
 * Reference 2 layout: four KPI cards in a row where the FIRST card is
 * a solid-toned gradient hero ("Total Projects 24") and the next
 * three are white/surface cards with the same content shape. Each
 * card carries a label, a value, an arrow-up affordance in the top-
 * right corner, and an optional delta footer ("Increased from last
 * month" / "+18% vs last week").
 *
 * Server component. Accepts 1–4 items in `kpis`; the FIRST item is
 * always rendered with the supplied `heroTone`, the rest white.
 *
 * Uses Stage 10.6.C.1 tokens only (rounded-3xl, shadow-soft-card,
 * gradient-emerald-soft / gold-soft / coral-soft).
 */

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiHeroTone =
  | "emerald-solid"
  | "gold-solid"
  | "coral-solid"
  | "ink-deep";

export interface KpiItem {
  label: string;
  /** Pre-formatted value (e.g. "24", "$23,194.80", "10"). */
  value: string;
  /**
   * Optional delta caption shown under the value (e.g. "Increased
   * from last month", "+18 vs prior week"). Plain string — no
   * automatic arrow/icon styling so callers can encode their own.
   */
  delta?: string;
  /** Optional sublabel (small chip) next to the delta. */
  badge?: string;
  /** Optional href for a click-through (renders the whole card as a Link). */
  href?: string;
}

export interface KpiRowMixedProps {
  /** 1–4 items. The first item is rendered with the hero tone. */
  kpis: KpiItem[];
  /** Tone for the hero (first) card. Defaults to emerald-solid. */
  heroTone?: KpiHeroTone;
  /** Optional className passthrough. */
  className?: string;
}

const HERO_BG: Record<KpiHeroTone, string> = {
  "emerald-solid": "bg-accent text-accent-contrast",
  "gold-solid": "bg-gold text-white",
  "coral-solid":
    "bg-gradient-to-br from-[#9e5a49] to-[#7e4537] text-accent-contrast",
  "ink-deep": "bg-gradient-ink-deep text-ink-inverse",
};

function KpiCard({
  kpi,
  isHero,
  heroTone = "emerald-solid",
}: {
  kpi: KpiItem;
  isHero: boolean;
  heroTone?: KpiHeroTone;
}) {
  const isDark = isHero || heroTone === "ink-deep";
  const wrapperCls = cn(
    "rounded-3xl border shadow-soft-card p-6 md:p-7 flex flex-col gap-5 min-h-[164px]",
    isHero
      ? `border-transparent ${HERO_BG[heroTone]}`
      : "border-line-soft bg-surface text-ink",
  );
  const body = (
    <>
      <header className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-sm md:text-base font-medium leading-tight",
            isHero ? "opacity-95" : "text-ink-secondary",
          )}
        >
          {kpi.label}
        </span>
        <span
          aria-hidden
          className={cn(
            "shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center",
            isHero
              ? "bg-white/15 text-accent-contrast"
              : "bg-canvas border border-line-soft text-ink-tertiary",
          )}
        >
          <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
        </span>
      </header>
      <div
        className={cn(
          "font-display tabular-nums leading-none",
          isHero
            ? "text-[44px] md:text-[56px]"
            : "text-[36px] md:text-[44px] text-ink",
        )}
      >
        {kpi.value}
      </div>
      {(kpi.delta || kpi.badge) && (
        <footer
          className={cn(
            "flex items-center gap-2 text-xs",
            isHero ? "opacity-95" : "text-ink-tertiary",
          )}
        >
          {kpi.badge && (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                isHero
                  ? "bg-white/20"
                  : "bg-muted text-ink-secondary",
              )}
            >
              {kpi.badge}
            </span>
          )}
          {kpi.delta && (
            <span className={cn(isDark ? "" : "text-ink-secondary")}>
              {kpi.delta}
            </span>
          )}
        </footer>
      )}
    </>
  );

  if (kpi.href) {
    return (
      <Link
        href={kpi.href}
        className={cn(wrapperCls, "transition-shadow hover:shadow-elevated-card")}
      >
        {body}
      </Link>
    );
  }
  return <div className={wrapperCls}>{body}</div>;
}

export function KpiRowMixed({
  kpis,
  heroTone = "emerald-solid",
  className,
}: KpiRowMixedProps) {
  if (kpis.length === 0) return null;
  const colsCls =
    kpis.length === 1
      ? "grid-cols-1"
      : kpis.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : kpis.length === 3
          ? "grid-cols-1 md:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div
      className={cn("grid gap-4 md:gap-5", colsCls, className)}
      data-stage10="kpi-row-mixed"
    >
      {kpis.map((k, i) => (
        <KpiCard
          key={`${k.label}-${i}`}
          kpi={k}
          isHero={i === 0}
          heroTone={heroTone}
        />
      ))}
    </div>
  );
}

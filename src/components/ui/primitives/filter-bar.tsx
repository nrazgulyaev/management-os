"use client";

/**
 * Arconique OS redesign — FilterBar primitive.
 *
 * Pill-grouped chip selector. Pills sit inside a rounded surface-warm
 * container; the active pill gets surface background + soft shadow.
 *
 * Reference: design_handoff_arconique_os/COMPONENTS.md §15.
 *
 * Server-safe by default — pass `href` per option for a Link-based
 * filter (URL-driven). For client-driven selection, pass `onSelect`
 * and the component renders <button> chips.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface FilterBarOption {
  value: string;
  label: React.ReactNode;
  /** Optional count badge to the right of the label. */
  count?: number;
  /** When using URL-driven filters, the destination for this chip. */
  href?: string;
}

export interface FilterBarProps {
  options: FilterBarOption[];
  /** Currently-active option value. */
  active?: string;
  /** Client-side selection handler. If absent, chips render as <Link href>. */
  onSelect?: (value: string) => void;
  /** Optional eyebrow label rendered before the first chip. */
  label?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  options,
  active,
  onSelect,
  label,
  className,
}: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label="Filter"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface-warm border border-line p-1.5",
        className,
      )}
      data-primitive="filter-bar"
    >
      {label && (
        <span className="text-[11px] uppercase tracking-[0.10em] text-ink-3 px-2">
          {label}
        </span>
      )}
      {options.map((opt) => {
        const isActive = opt.value === active;
        const cls = cn(
          "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terra",
          isActive
            ? "bg-surface text-ink shadow-redesign-card"
            : "text-ink-2 hover:text-ink",
        );
        const content = (
          <>
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "tabular-nums text-[11.5px] px-1.5 py-0.5 rounded-full",
                  isActive
                    ? "bg-terra-soft text-terra-deep"
                    : "bg-surface-sunken text-ink-3",
                )}
              >
                {opt.count}
              </span>
            )}
          </>
        );

        if (opt.href && !onSelect) {
          return (
            <Link
              key={opt.value}
              href={opt.href}
              aria-current={isActive ? "page" : undefined}
              className={cls}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect?.(opt.value)}
            className={cls}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

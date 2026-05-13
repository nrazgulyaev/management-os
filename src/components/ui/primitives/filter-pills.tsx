/**
 * Stage 10.6.C.2 — FilterPills primitive.
 *
 * Reference: recruiting (Awsmd) "Round 1 / Round 2 / Round 3" chips +
 * PPC dashboard pastel filter pills. Rounded-full, color-coded
 * active state, optional per-pill count badge.
 *
 * Server-safe — every pill is a Link (server-driven filtering via
 * `?status=active` URL params). For client-side filtering, pass
 * onClick handlers and a `current` prop.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface FilterPillItem {
  /** Unique key — typically the URL param value. Empty string for "All". */
  value: string;
  /** Display label. */
  label: string;
  /** Optional count shown as a small subscript inside the pill. */
  count?: number;
  /** Optional href for the pill (server-driven nav). If absent, pill is non-clickable. */
  href?: string;
  /** Optional click handler (client-driven). */
  onClick?: () => void;
}

export interface FilterPillsProps {
  items: FilterPillItem[];
  /** Currently-active pill `value`. Pass empty string for "All". */
  current: string;
  /** Optional eyebrow / label above the pills (e.g. "Filter"). */
  label?: string;
  className?: string;
}

export function FilterPills({
  items,
  current,
  label,
  className,
}: FilterPillsProps) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-stage10="filter-pills"
    >
      {label && (
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const isActive = item.value === current;
          const baseCls = cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors",
            isActive
              ? "bg-ink text-ink-inverse hover:bg-ink/90"
              : "bg-surface text-ink-secondary border border-line-soft hover:border-line-strong hover:text-ink",
          );
          const body = (
            <>
              {item.label}
              {typeof item.count === "number" && (
                <span
                  className={cn(
                    "tabular-nums text-xs",
                    isActive ? "opacity-80" : "text-ink-tertiary",
                  )}
                >
                  {item.count}
                </span>
              )}
            </>
          );

          if (item.href) {
            return (
              <Link key={item.value} href={item.href} className={baseCls}>
                {body}
              </Link>
            );
          }
          if (item.onClick) {
            return (
              <button
                key={item.value}
                type="button"
                onClick={item.onClick}
                className={baseCls}
              >
                {body}
              </button>
            );
          }
          return (
            <span key={item.value} className={cn(baseCls, "cursor-default")}>
              {body}
            </span>
          );
        })}
      </div>
    </div>
  );
}

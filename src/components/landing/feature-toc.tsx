/**
 * Sprint LD-2 — FeatureTOC primitive.
 *
 * Horizontal pill row of anchor links shown under the compact hero
 * on both /features pages. Sticky on desktop so the operator can
 * jump between feature sections without losing context.
 *
 * Server component — pure anchor links, no Intersection Observer
 * island. Active-state highlight is a nice-to-have that the spec
 * mentions ("Active pill highlights as user scrolls") with an
 * explicit fallback to "plain anchor links". This implementation
 * ships the fallback; a future enhancement can wrap it in a client
 * island without changing the contract.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface FeatureTOCItem {
  id: string;
  label: string;
}

export interface FeatureTOCProps {
  items: FeatureTOCItem[];
  className?: string;
}

export function FeatureTOC({ items, className }: FeatureTOCProps) {
  return (
    <nav
      aria-label="Feature sections"
      data-stage10="feature-toc"
      className={cn(
        "sticky top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-line-soft",
        className,
      )}
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-3 md:py-4">
        <ul className="flex items-center gap-2 md:gap-3 overflow-x-auto -mx-1 px-1">
          {items.map((it) => (
            <li key={it.id} className="shrink-0">
              <Link
                href={`#${it.id}`}
                className="inline-flex items-center rounded-full border border-line-soft bg-surface px-4 h-9 text-xs md:text-sm text-ink-secondary hover:text-ink hover:border-line-strong transition-colors whitespace-nowrap"
              >
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

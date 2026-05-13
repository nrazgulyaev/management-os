/**
 * Stage 10.6.C.3 — DetailPageHero primitive.
 *
 * Entity-detail page hero header. Wraps the existing PageHeader content
 * (eyebrow + title + breadcrumbs) in a rounded-3xl card with optional
 * status row + summary chip strip + side panel slot.
 *
 * Reference: doctor-portal patient profile + recruiting candidate detail
 * page. The card-treatment makes detail pages feel "premium" vs the
 * flat top-of-page header look.
 *
 * Backward-compatible — existing detail pages can keep PageHeader and
 * adopt this incrementally.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DetailPageHeroProps {
  /** Optional breadcrumb trail. Last entry should be the current entity name. */
  breadcrumbs?: { label: string; href?: string }[];
  /** Small label above the title (e.g. project name for a villa detail). */
  eyebrow?: string;
  /** Entity name — the H1. */
  title: string;
  /** Single-line description below the title. */
  description?: string;
  /**
   * Status row content — typically <StatusPill> + <Badge>s + ArchiveButton.
   * Renders inline below the title, before the action row.
   */
  statusRow?: React.ReactNode;
  /** Primary actions — Edit, Archive, etc. Right-aligned. */
  actions?: React.ReactNode;
  /**
   * Optional 2-3 column KPI / summary strip rendered below the header
   * inside the same card. Each item: { label, value, hint? }.
   */
  summaryStrip?: Array<{
    label: string;
    value: React.ReactNode;
    hint?: string;
  }>;
  className?: string;
  /** Card tone. Default "surface"; "soft" uses a muted background. */
  tone?: "surface" | "soft";
}

const TONE_CLS: Record<NonNullable<DetailPageHeroProps["tone"]>, string> = {
  surface: "bg-surface",
  soft: "bg-muted/40",
};

export function DetailPageHero({
  breadcrumbs,
  eyebrow,
  title,
  description,
  statusRow,
  actions,
  summaryStrip,
  className,
  tone = "surface",
}: DetailPageHeroProps) {
  return (
    <header
      className={cn(
        "rounded-3xl border border-line-soft shadow-soft-card overflow-hidden",
        TONE_CLS[tone],
        className,
      )}
      data-stage10="detail-page-hero"
    >
      <div className="px-7 md:px-8 py-7 md:py-8 flex flex-col gap-5">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-ink-tertiary">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {b.href ? (
                  <Link
                    href={b.href}
                    className="hover:text-ink transition-colors"
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span className="text-ink-secondary">{b.label}</span>
                )}
                {i < breadcrumbs.length - 1 && (
                  <ChevronRight className="w-3 h-3 opacity-60" />
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2 min-w-0 max-w-3xl">
            {eyebrow && (
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                {eyebrow}
              </span>
            )}
            <h1 className="text-display text-[36px] leading-[1.05] md:text-[48px] md:leading-[1.02] font-medium text-ink tracking-tight">
              {title}
            </h1>
            {description && (
              <p className="text-ink-secondary text-base md:text-lg leading-relaxed max-w-2xl">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {actions}
            </div>
          )}
        </div>

        {statusRow && (
          <div className="flex items-center gap-2 flex-wrap pt-1">{statusRow}</div>
        )}
      </div>

      {summaryStrip && summaryStrip.length > 0 && (
        <div className="border-t border-line-soft bg-canvas/40 px-7 md:px-8 py-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4">
            {summaryStrip.map((item, i) => (
              <div key={i} className="flex flex-col gap-1 min-w-0">
                <span className="text-[11px] uppercase tracking-[0.14em] text-ink-tertiary font-medium">
                  {item.label}
                </span>
                <span className="text-display text-[20px] leading-tight font-medium text-ink truncate">
                  {item.value}
                </span>
                {item.hint && (
                  <span className="text-xs text-ink-tertiary truncate">
                    {item.hint}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

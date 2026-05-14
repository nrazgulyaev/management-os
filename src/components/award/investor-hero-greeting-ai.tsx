/**
 * Mega-Sprint Phase 12 — InvestorHeroGreetingAI primitive.
 *
 * Formal-tone variant of <HeroGreetingAI>. The operator surface uses
 * "Hey, need help?" / "Just ask me anything!" — investor-grade copy
 * needs to be quieter: "Welcome back, {name}", "Reports", formal
 * date label without the casual "Tue, December" abbreviation. No
 * mic affordance by default.
 *
 * Bilingual-ready: copy strings are passed in via props so the
 * portal's existing `getPortalStrings(reportingLanguage)` system can
 * thread translations through.
 *
 * Server component shell (no client state); the optional ask input
 * lives in a separate island similar to HeroGreetingAI's
 * <HeroAskInput>.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InvestorHeroGreetingAIProps {
  /** Investor legal name (or display name) for the greeting line. */
  investorName: string;
  /** Optional investor code, surfaced as the eyebrow. */
  investorCode?: string;
  /** Pre-formatted date label (e.g. "May 14, 2026"). */
  dateLabel?: string;
  /** Override the welcome line — defaults to "Welcome back, {name}". */
  greetingOverride?: string;
  /** Override the sub-line text. */
  subline?: string;
  /** Localized "Reports" CTA label. Defaults to "Reports". */
  reportsLabel?: string;
  /** Href for the reports CTA. */
  reportsHref?: string;
  /** Placeholder for the AI ask input. */
  aiPromptPlaceholder?: string;
  /**
   * Optional href the AI input "ask" arrow points at. When omitted,
   * the input renders as a read-only placeholder (graceful degrade
   * for portals where the investor-copilot agent is not yet wired).
   */
  askHref?: string;
  className?: string;
}

export function InvestorHeroGreetingAI({
  investorName,
  investorCode,
  dateLabel,
  greetingOverride,
  subline,
  reportsLabel = "Reports",
  reportsHref,
  aiPromptPlaceholder = "What changed in my position this quarter?",
  askHref,
  className,
}: InvestorHeroGreetingAIProps) {
  const greeting =
    greetingOverride ?? `Welcome back, ${investorName}.`;
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card px-6 md:px-10 py-8 md:py-10",
        "grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] gap-8 items-stretch",
        className,
      )}
      data-stage10="investor-hero-greeting-ai"
    >
      <div className="flex flex-col items-start justify-center gap-3">
        {investorCode && (
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
            {investorCode}
          </span>
        )}
        {dateLabel && (
          <div className="inline-flex items-center gap-2.5 rounded-full bg-canvas border border-line-soft px-3.5 h-10">
            <CalendarDays
              className="w-4 h-4 text-ink-tertiary"
              strokeWidth={1.75}
            />
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-ink-secondary">
              {dateLabel}
            </span>
          </div>
        )}
        {reportsHref && (
          <Link
            href={reportsHref}
            className="inline-flex items-center gap-2 rounded-full border border-line-soft px-4 h-10 text-xs font-medium text-ink hover:bg-muted/40 transition-colors"
          >
            <FileText className="w-4 h-4" strokeWidth={1.75} />
            {reportsLabel}
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-4 justify-center">
        <h1 className="text-display text-[36px] md:text-[48px] lg:text-[56px] leading-[1.05] font-medium text-ink tracking-tight">
          {greeting}
        </h1>
        {subline && (
          <p className="text-sm md:text-base text-ink-secondary leading-relaxed max-w-2xl">
            {subline}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3 rounded-full bg-canvas border border-line-soft px-5 h-12 max-w-xl">
          <span className="text-sm text-ink-tertiary flex-1 truncate">
            {aiPromptPlaceholder}
          </span>
          {askHref ? (
            <Link
              href={askHref}
              className="shrink-0 w-8 h-8 rounded-full bg-ink text-ink-inverse inline-flex items-center justify-center"
              aria-label="Ask"
            >
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </Link>
          ) : (
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary"
            >
              Coming soon
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

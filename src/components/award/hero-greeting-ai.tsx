/**
 * Sprint 4 — HeroGreetingAI primitive.
 *
 * The operator's signature "Hey, need help? 👋 | Just ask me anything!"
 * hero pattern from Reference 1 (financial dashboard). Two columns:
 *
 *   Left  — date chip + "Show my Tasks" pill (small CTAs, calendar
 *           chip, branded number-circle on far left)
 *   Right — huge "Hey, need help?" line + AI prompt input + mic icon
 *
 * Server component shell with one client child for the input + mic
 * interaction. The shell can be rendered from any server page; the
 * input island wires up the AI submit + voice handlers via callback
 * props the parent passes as `action`-style server-action references.
 *
 * Uses existing Stage 10.6.C.1 tokens (no new tokens). Headline uses
 * the Fraunces display font; placeholder uses Inter.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroAskInput, type HeroAskAction } from "./hero-greeting-ai-input";

export interface HeroGreetingAIProps {
  /** First name shown in the greeting prefix (e.g. "Hey, Aleksandra"). Optional. */
  firstName?: string | null;
  /** Role chip shown under the greeting (e.g. "Bookkeeper"). Optional. */
  role?: string;
  /** Pre-formatted "19 · Tue, December" date label. */
  dateLabel?: string;
  /** Placeholder for the AI ask input. */
  aiPromptPlaceholder?: string;
  /**
   * Server action invoked when the operator submits a prompt. Receives
   * the raw query string. The action is responsible for routing to the
   * right agent (tax_assistant, operations_copilot, etc.) and may
   * return a string-or-undefined response that will be rendered inline.
   * Parent must wrap the action with `"use server";`.
   */
  onAsk?: HeroAskAction;
  /**
   * Optional href to surface a "Show my tasks" pill on the left
   * column. Hidden when undefined.
   */
  showMyTasksHref?: string;
  /** Hide the microphone affordance (some surfaces don't want it). */
  hideMic?: boolean;
  /**
   * Hide the AI ask input + mic (read-mostly surfaces, e.g. the
   * Owner overview where no agent input is wired). When set, the
   * card still renders the greeting + date chip + role label so the
   * Sprint-4 hero band silhouette matches every other Mgmt-OS apex.
   */
  hideAiInput?: boolean;
  /**
   * Override the auto-generated "Hey, {name}, need help?" greeting
   * with a custom line. Useful for read-mostly surfaces where the
   * "need help?" framing doesn't fit (e.g. Owner overview).
   */
  greetingOverride?: React.ReactNode;
  /**
   * Sub-line shown beneath the greeting. Renders as a sentence above
   * the AI input slot when present; useful on read-mostly cabinets
   * where the AI input is hidden.
   */
  subline?: React.ReactNode;
  className?: string;
}

export function HeroGreetingAI({
  firstName,
  role,
  dateLabel,
  aiPromptPlaceholder = "Just ask me anything!",
  onAsk,
  showMyTasksHref,
  hideMic,
  hideAiInput,
  greetingOverride,
  subline,
  className,
}: HeroGreetingAIProps) {
  const name = firstName?.trim() || "there";
  const greetingLine =
    greetingOverride ??
    `Hey, ${name === "there" ? "need help?" : `${name}, need help?`}`;
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card px-6 md:px-8 py-6 md:py-8",
        "grid grid-cols-1 lg:grid-cols-[minmax(0,260px)_1fr] gap-6 items-stretch",
        className,
      )}
      data-stage10="hero-greeting-ai"
    >
      {/* Left column — date chip + Show my Tasks pill */}
      <div className="flex flex-col items-start justify-center gap-3">
        {dateLabel && (
          <div className="inline-flex items-center gap-2.5 rounded-full bg-canvas border border-line-soft px-3.5 h-10">
            <CalendarDays
              className="w-4 h-4 text-ink-tertiary"
              strokeWidth={1.75}
            />
            <span className="font-mono tabular-nums text-sm text-ink">
              {dateLabel}
            </span>
          </div>
        )}
        {showMyTasksHref && (
          <Link
            href={showMyTasksHref}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-coral-soft border border-line-soft px-5 h-10 text-sm font-medium text-ink hover:shadow-soft-card transition-shadow"
          >
            Show my tasks
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
        )}
        {role && (
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium mt-1">
            {role}
          </span>
        )}
      </div>

      {/* Right column — huge greeting + AI input + optional mic */}
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-display text-[32px] md:text-[48px] lg:text-[56px] leading-[1.04] font-medium text-ink tracking-tight">
            {greetingLine}
            {!greetingOverride && (
              <span aria-hidden className="inline-block ml-2">
                👋
              </span>
            )}
          </h2>
          {subline && (
            <p className="mt-3 text-sm md:text-base text-ink-secondary leading-relaxed max-w-2xl">
              {subline}
            </p>
          )}
          {!hideAiInput && (
            <div className="mt-2">
              <HeroAskInput
                placeholder={aiPromptPlaceholder}
                onAsk={onAsk}
              />
            </div>
          )}
        </div>
        {!hideAiInput && !hideMic && (
          <button
            type="button"
            className="hidden md:inline-flex shrink-0 w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-canvas border border-line-soft items-center justify-center hover:bg-muted transition-colors"
            aria-label="Voice input — coming soon"
            // Server component — no onClick. Voice input wires in a
            // future sprint (currently a visual affordance only).
          >
            <Mic className="w-6 h-6 text-ink-secondary" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </section>
  );
}

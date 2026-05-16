/**
 * Arconique OS redesign — HeroGreet primitive.
 *
 * The landing block at the top of every "main" cabinet page (Mgmt
 * overview, Dev command center, role apex pages). Replaces a
 * standard `<PageHeader>` for those surfaces.
 *
 * Anatomy (design_handoff_arconique_os/COMPONENTS.md §2):
 *   [ date-badge | greeting-line + CTA pill + mic button ]
 *
 * The greeting line is large italic-accented display text. Caller
 * supplies `firstName`; the italic word can be either the name (Mgmt
 * overview style: "Hey, _Nikita_.") or an action word (Dev style:
 * "Today's _command center_.").
 *
 * Server-safe. The mic button is a slot — pass `<MicButton>` when
 * the parent wants click behaviour (voice intake / AI prompt).
 */

import * as React from "react";
import { Mic, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CtaPill } from "./cta-pill";

export interface HeroGreetProps {
  /** Date badge: big number on top, weekday + meta below. */
  date?: Date;
  /** Override the rendered date components instead of computing from `date`. */
  dateNumber?: React.ReactNode;
  dateLabel?: React.ReactNode;
  /** Operator's first name; defaults to "there". */
  firstName?: string | null;
  /**
   * Two-part greeting. `prefix` is the plain text ("Hey, "), `accent`
   * is the italic terra-leaning word ("Nikita"), and `suffix` closes
   * the sentence (".").
   */
  greetingPrefix?: React.ReactNode;
  greetingAccent?: React.ReactNode;
  greetingSuffix?: React.ReactNode;
  /** AI prompt placeholder shown under the greeting. */
  aiPromptPlaceholder?: string;
  /** Primary CTA to the right of the date badge. */
  ctaLabel?: string;
  ctaHref?: string;
  ctaOnClick?: () => void;
  /** Right-edge slot (typically a round mic button). When omitted, a
   *  default mic button is rendered as a non-interactive visual cue. */
  rightAccessory?: React.ReactNode;
  className?: string;
}

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

function weekNumber(d: Date): number {
  // ISO week — Monday-start. Matches the prototype's "Week 20".
  const tmp = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

export function HeroGreet({
  date,
  dateNumber,
  dateLabel,
  firstName,
  greetingPrefix,
  greetingAccent,
  greetingSuffix,
  aiPromptPlaceholder = "Just ask me anything!",
  ctaLabel,
  ctaHref,
  ctaOnClick,
  rightAccessory,
  className,
}: HeroGreetProps) {
  const now = date ?? new Date();
  const dayNum = dateNumber ?? now.getDate();
  const weekday = WEEKDAYS_SHORT[now.getDay()];
  const monthLong = MONTHS_LONG[now.getMonth()];
  const computedDateLabel = dateLabel ?? (
    <>
      <strong className="block text-ink">{weekday}, {monthLong.slice(0, 3)}</strong>
      <span className="text-ink-3">
        Week {weekNumber(now)} · {now.getFullYear()}
      </span>
    </>
  );

  const accent = greetingAccent ?? firstName ?? "there";
  const prefix = greetingPrefix ?? "Hey, ";
  const suffix = greetingSuffix ?? ".";

  return (
    <header
      className={cn(
        "rounded-[var(--radius-card-hero)] bg-surface border border-line shadow-redesign-card",
        "p-5 md:p-7",
        "flex flex-col gap-5",
        className,
      )}
      data-primitive="hero-greet"
    >
      <div className="flex items-center gap-4 flex-wrap">
        {/* Date badge */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-full bg-surface-warm border border-line px-3 py-2",
            "shrink-0",
          )}
        >
          <div className="font-display text-[34px] leading-none tabular-nums text-ink">
            {dayNum}
          </div>
          <div className="text-[11.5px] leading-tight">
            {computedDateLabel}
          </div>
        </div>

        {/* CTA */}
        {ctaLabel && (
          <CtaPill href={ctaHref} onClick={ctaOnClick} variant="default">
            {ctaLabel}
          </CtaPill>
        )}

        {/* Spacer + right accessory */}
        <div className="ml-auto flex items-center gap-3">
          {rightAccessory ?? (
            <button
              type="button"
              aria-label="Voice prompt"
              className={cn(
                "inline-grid place-items-center w-12 h-12 rounded-full",
                "bg-ink-deep text-white hover:opacity-90 transition-opacity",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra",
              )}
            >
              <Mic className="w-5 h-5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[clamp(34px,4.6vw,56px)] leading-[1.05] tracking-[-0.018em] text-ink">
          {prefix}
          <em className="italic text-terra">{accent}</em>
          {suffix}
        </h1>
        {aiPromptPlaceholder && (
          <p className="text-ink-3 text-[15px] inline-flex items-center gap-1.5">
            {aiPromptPlaceholder}
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </p>
        )}
      </div>
    </header>
  );
}

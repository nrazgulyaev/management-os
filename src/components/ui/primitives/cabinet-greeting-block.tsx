/**
 * Stage 10.6.C.1 — CabinetGreetingBlock primitive.
 *
 * The reference doctor-portal pattern: "Good day, Dr. Anderson! 👋"
 * with a wave emoji + avatar with gradient ring + optional badge.
 *
 * Used at the top of every cabinet dashboard. Consumes
 * `getCurrentUserContext().appUser.fullName` (the caller resolves it
 * server-side and passes the first name in).
 *
 * Server-safe — no client hooks.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CabinetGreetingBlockProps {
  /** First name of the logged-in user. If absent, greeting falls back to "there". */
  firstName?: string | null;
  /** Optional eyebrow above the title (e.g. "CFO · Cabinet"). */
  eyebrow?: string;
  /** Override the title (defaults to the friendly greeting). */
  title?: string;
  /** Optional sub-line under the greeting (e.g. "3 alerts today · 2 awaiting your review"). */
  subline?: React.ReactNode;
  /** Optional avatar slot — typically a circular image with gradient ring. */
  avatar?: React.ReactNode;
  /** Optional right-aligned badge (e.g. "3 alerts" pill). */
  badge?: React.ReactNode;
  /** Override "now" for deterministic SSR / tests. */
  now?: Date;
  className?: string;
}

function computeGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function CabinetGreetingBlock({
  firstName,
  eyebrow,
  title,
  subline,
  avatar,
  badge,
  now,
  className,
}: CabinetGreetingBlockProps) {
  const name = firstName?.trim() || "there";
  const greeting = computeGreeting(now ?? new Date());
  const computedTitle = title ?? `${greeting}, ${name}!`;

  return (
    <header
      className={cn(
        "flex items-center gap-5 flex-wrap",
        className,
      )}
      data-stage10="cabinet-greeting-block"
    >
      {avatar && (
        <div className="shrink-0 rounded-full p-[2px] bg-gradient-to-br from-accent via-accent-weak to-gold-weak">
          <div className="rounded-full bg-canvas p-[2px]">{avatar}</div>
        </div>
      )}
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {eyebrow && (
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
            {eyebrow}
          </span>
        )}
        <h1 className="text-display text-[28px] md:text-[32px] leading-[1.1] font-medium text-ink tracking-tight">
          {computedTitle}{" "}
          {!title && (
            <span aria-hidden className="inline-block">
              👋
            </span>
          )}
        </h1>
        {subline && (
          <p className="text-sm text-ink-secondary leading-relaxed">{subline}</p>
        )}
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </header>
  );
}

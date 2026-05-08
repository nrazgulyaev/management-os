/**
 * Stage 10.D.5 — PageHeaderHero (award-winning page header).
 *
 * Reference: doctor-portal "Good day, Dr. Anderson!" pattern. Used by
 * cabinet landings + per-role dashboards in Phase 10.J. Distinct from
 * the existing `<PageHeader>` which is a compact list-page header
 * (kept as-is for non-landing pages).
 *
 * Slots:
 *   - greeting           — auto "Good morning/afternoon/evening, {name}"
 *   - eyebrow / title / description
 *   - search             — slot for the page's search input
 *   - notifications      — slot for an Inbox / unread bell
 *   - avatar             — slot for the user avatar / menu
 *   - actions            — primary CTA(s)
 *
 * Server-safe — caller passes already-resolved name + slots.
 *
 * Used by: Phase 10.J (per-cabinet dashboards), 10.I public landing,
 * any premium landing surface.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderHeroProps {
  /** First name used in the greeting. If absent, no greeting line. */
  firstName?: string;
  /** Override the auto-greeting copy entirely. */
  greeting?: string;
  /** Compute "Good morning/afternoon/evening" based on a Date.
   * Defaults to `new Date()`; pass a fixed date for deterministic
   * tests / SSR. */
  now?: Date;
  eyebrow?: string;
  title: string;
  description?: string;
  /** Reserved slot — typically a search input. */
  search?: React.ReactNode;
  /** Reserved slot — typically an inbox bell with unread count. */
  notifications?: React.ReactNode;
  /** Reserved slot — typically a user avatar / menu. */
  avatar?: React.ReactNode;
  /** Primary action buttons. */
  actions?: React.ReactNode;
  className?: string;
}

function computeGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function PageHeaderHero({
  firstName,
  greeting,
  now,
  eyebrow,
  title,
  description,
  search,
  notifications,
  avatar,
  actions,
  className,
}: PageHeaderHeroProps) {
  const greetLine =
    greeting ?? (firstName ? `${computeGreeting(now ?? new Date())}, ${firstName}!` : null);

  return (
    <header
      className={cn(
        "rounded-md bg-surface border border-line-soft shadow-[var(--shadow-flat)] px-6 py-5 flex flex-col gap-5",
        className,
      )}
      data-stage10="page-header-hero"
    >
      {(greetLine || search || notifications || avatar) && (
        <div className="flex items-center gap-3 flex-wrap">
          {greetLine && (
            <p className="text-sm font-medium text-ink-secondary mr-auto">
              {greetLine}
            </p>
          )}
          {!greetLine && <span className="mr-auto" />}
          {search && <div className="flex-1 max-w-sm min-w-0">{search}</div>}
          {notifications && <div className="shrink-0">{notifications}</div>}
          {avatar && <div className="shrink-0">{avatar}</div>}
        </div>
      )}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0 max-w-3xl">
          {eyebrow && (
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              {eyebrow}
            </span>
          )}
          <h1 className="text-display text-[44px] leading-[1.05] md:text-[56px] md:leading-[1.02] font-medium text-ink tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-ink-secondary text-base md:text-lg leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}

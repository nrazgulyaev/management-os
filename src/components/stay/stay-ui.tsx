import * as React from "react";
import Link from "next/link";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
   Guest Stay Portal presentational primitives. They reproduce
   the mockup's block vocabulary (.eyebrow / .sec-t / .card /
   .row / .tl / .pill / .svc / .shead) on the lightened
   hospitality token scope. Server-safe (no client hooks).
   ============================================================ */

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Sub-screen sticky header with a back chevron (mockup .shead). */
export function StayHeader({
  title,
  backHref,
}: {
  title: string;
  backHref: string;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <Link
        href={backHref}
        aria-label="Back"
        className="w-[38px] h-[38px] shrink-0 rounded-full bg-surface border border-line flex items-center justify-center text-ink"
      >
        <ArrowLeft className="w-[19px] h-[19px]" strokeWidth={2} />
      </Link>
      <h1 className="text-display text-[23px] font-normal tracking-[-0.01em] text-ink">
        {title}
      </h1>
    </div>
  );
}

/** Section title block (mockup .sec-t): serif h2 + optional link. */
export function SectionTitle({
  title,
  actionLabel,
  actionHref,
}: {
  title: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3.5">
      <h2 className="text-display text-[22px] font-normal leading-[1.15] tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-[13px] font-semibold text-terra no-underline"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/** A tappable list row with leading icon tile + chevron (mockup .row). */
export function StayRow({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 py-[15px] w-full text-left"
    >
      <span className="w-[42px] h-[42px] shrink-0 rounded-[13px] bg-muted flex items-center justify-center">
        <Icon className="w-[21px] h-[21px] text-forest" strokeWidth={1.7} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15.5px] font-semibold text-ink">
          {title}
        </span>
        <span className="block text-[13px] text-ink-tertiary mt-0.5">
          {detail}
        </span>
      </span>
      <ChevronRight className="w-[18px] h-[18px] text-ink-4 shrink-0" strokeWidth={2} />
    </Link>
  );
}

const PILL_TONES = {
  ok: "bg-success-weak text-success",
  gold: "bg-gold-weak text-gold",
  terra: "bg-accent-weak text-terra",
  cream: "bg-muted text-ink-secondary",
} as const;

/** Mono uppercase status pill (mockup .pill). */
export function Pill({
  tone = "cream",
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] font-medium px-[11px] py-[5px] rounded-full",
        PILL_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Vertical stay timeline (mockup .tl). */
export function Timeline({ children }: { children: React.ReactNode }) {
  return (
    <ol className="relative pl-[26px] before:content-[''] before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-line">
      {children}
    </ol>
  );
}

export function TimelineItem({
  time,
  title,
  detail,
  now = false,
  done = false,
}: {
  time: string;
  title: string;
  detail: string;
  now?: boolean;
  done?: boolean;
}) {
  return (
    <li
      className={cn(
        "relative pb-[22px] last:pb-0 before:content-[''] before:absolute before:-left-[23px] before:top-1 before:w-3.5 before:h-3.5 before:rounded-full before:border-2",
        now
          ? "before:bg-terra before:border-terra before:shadow-[0_0_0_4px_color-mix(in_srgb,var(--terra)_16%,transparent)]"
          : "before:bg-surface before:border-gold",
      )}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-4">
        {time}
      </div>
      <div className="text-[15px] font-semibold text-ink mt-[3px]">
        {done ? "✓ " : ""}
        {title}
      </div>
      <div className="text-[13px] text-ink-tertiary mt-0.5 leading-[1.45]">
        {detail}
      </div>
    </li>
  );
}

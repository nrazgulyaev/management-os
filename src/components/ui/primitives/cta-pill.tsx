"use client";

/**
 * Arconique OS redesign — CtaPill primitive.
 *
 * The signature call-to-action across the redesigned app: a wide
 * pill with a label on the left and a smaller circular arrow on the
 * right, glued inside the pill. Replaces most `<Button variant="primary">`
 * usages for high-emphasis actions.
 *
 * Anatomy (from design_handoff_arconique_os/COMPONENTS.md §1):
 *   [ Show my tasks  (→) ]
 *
 * Variants:
 *   - `default`: terra background, white text, white-on-white-alpha arrow
 *   - `dark`:    ink-deep background, white text
 *   - `ghost`:   surface-warm background, ink text; arrow circle = ink-deep
 *
 * Server-safe (no client hooks). If the parent needs an onClick, pass
 * one via `as="button" onClick={...}`; if it's a Link, pass `href`.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CtaPillVariant = "default" | "dark" | "ghost";

export interface CtaPillProps {
  children: React.ReactNode;
  variant?: CtaPillVariant;
  /** When provided, the pill renders as `<Link href>` (a real anchor). */
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Replace the default ArrowRight icon. */
  icon?: React.ReactNode;
}

const PILL_BASE =
  "inline-flex items-center gap-3 pl-[22px] pr-2 py-3 rounded-full font-medium text-sm transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra";

const VARIANT_PILL: Record<CtaPillVariant, string> = {
  default: "bg-terra text-white hover:bg-terra-deep",
  dark: "bg-ink-deep text-white hover:opacity-90",
  ghost:
    "bg-surface-warm text-ink hover:bg-bg-elevated border border-line",
};

const VARIANT_ARROW: Record<CtaPillVariant, string> = {
  default: "bg-white/16 text-white",
  dark: "bg-white/14 text-white",
  ghost: "bg-ink-deep text-white",
};

function ArrowBubble({
  variant,
  icon,
}: {
  variant: CtaPillVariant;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-grid place-items-center w-[34px] h-[34px] rounded-full shrink-0",
        VARIANT_ARROW[variant],
      )}
      aria-hidden
    >
      {icon ?? <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />}
    </span>
  );
}

export function CtaPill({
  children,
  variant = "default",
  href,
  onClick,
  type = "button",
  disabled,
  ariaLabel,
  className,
  icon,
}: CtaPillProps) {
  const content = (
    <>
      <span>{children}</span>
      <ArrowBubble variant={variant} icon={icon} />
    </>
  );

  const classes = cn(PILL_BASE, VARIANT_PILL[variant], className);

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={classes}
    >
      {content}
    </button>
  );
}

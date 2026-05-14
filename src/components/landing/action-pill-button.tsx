/**
 * Sprint LD-1 — ActionPillButton primitive.
 *
 * Pill-shaped CTA used across both /products landings. Three variants:
 *   - primary  → solid ink / dark, white text, the standard final CTA
 *   - secondary → bg-canvas + line-soft border, ink text
 *   - ghost    → no bg, ink text, underline-on-hover
 *
 * The arrow icon (optional) animates a tiny translate-x on hover so
 * the button feels alive without a heavy motion library. An optional
 * leading icon slot supports things like a microphone or sparkle.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionPillVariant = "primary" | "secondary" | "ghost";

export interface ActionPillButtonProps {
  label: string;
  href: string;
  variant?: ActionPillVariant;
  /** Optional leading icon component (Lucide-style render-prop). */
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Render a trailing → arrow with the standard hover animation. */
  arrow?: boolean;
  /** Optional size override; defaults to "md". */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLS: Record<NonNullable<ActionPillButtonProps["size"]>, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-sm md:text-base",
};

const VARIANT_CLS: Record<ActionPillVariant, string> = {
  primary:
    "bg-ink text-ink-inverse hover:bg-ink/90 border border-transparent",
  secondary:
    "bg-canvas text-ink hover:bg-muted/60 border border-line-soft",
  ghost: "bg-transparent text-ink hover:underline underline-offset-4",
};

export function ActionPillButton({
  label,
  href,
  variant = "primary",
  icon: Icon,
  arrow,
  size = "md",
  className,
}: ActionPillButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors whitespace-nowrap",
        SIZE_CLS[size],
        VARIANT_CLS[variant],
        className,
      )}
      data-stage10="action-pill-button"
      data-variant={variant}
    >
      {Icon && <Icon className="w-4 h-4" strokeWidth={1.75} />}
      <span>{label}</span>
      {arrow && (
        <ArrowRight
          className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.75}
        />
      )}
    </Link>
  );
}

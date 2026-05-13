import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Stage 10.6.C.3 — `tone` controls visual mass.
 *  - "default" (existing) — dashed border + muted background, neutral
 *  - "soft"               — solid rounded-3xl card on canvas, friendlier
 *  - "emerald" / "gold" / "coral" — gradient accent (use sparingly,
 *                                    matches reference vibes for primary
 *                                    "first-run" empty states)
 */
export type EmptyStateTone =
  | "default"
  | "soft"
  | "emerald"
  | "gold"
  | "coral";

const TONE_CLS: Record<EmptyStateTone, string> = {
  default:
    "rounded-md border border-dashed border-line-soft bg-muted/30 px-8 py-14",
  soft:
    "rounded-3xl border border-line-soft bg-surface shadow-soft-card px-8 py-16",
  emerald:
    "rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-soft-card px-8 py-16",
  gold:
    "rounded-3xl border border-line-soft bg-gradient-gold-soft shadow-soft-card px-8 py-16",
  coral:
    "rounded-3xl border border-line-soft bg-gradient-coral-soft shadow-soft-card px-8 py-16",
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = "default",
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Stage 10.6.C.3 — visual tone. Defaults to existing dashed muted look. */
  tone?: EmptyStateTone;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        TONE_CLS[tone],
        className
      )}
    >
      {icon && (
        <div className="mb-4 w-12 h-12 rounded-full bg-surface flex items-center justify-center border border-line-soft text-ink-tertiary shadow-soft-card">
          {icon}
        </div>
      )}
      <h3 className="text-base md:text-lg font-medium text-ink mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-ink-secondary max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

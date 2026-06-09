import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * STATE-KIT — LoadingState (the "loading" state primitive).
 *
 * A centred spinner + optional label for surfaces where a skeleton is
 * overkill (modals, panels, async sub-sections, button-triggered loads).
 * For full page/table loads prefer <Skeleton>; use this for short,
 * indeterminate waits.
 *
 *   <LoadingState label="Loading bookings…" />
 *   <LoadingState size="sm" inline />            // row-level
 *
 * Tokens only (text-ink-tertiary / accent). Spinner uses the Tailwind
 * `animate-spin` utility, which honours prefers-reduced-motion.
 */

export interface LoadingStateProps {
  /** Message shown under (block) or beside (inline) the spinner. */
  label?: string;
  /** sm for inline rows, md for panels, lg for full surfaces. */
  size?: "sm" | "md" | "lg";
  /** Lay out spinner + label in a row instead of a centred column. */
  inline?: boolean;
  /** Tint the spinner with the product accent instead of ink-tertiary. */
  accent?: boolean;
  className?: string;
}

const SPINNER_SIZE: Record<NonNullable<LoadingStateProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const PADDING: Record<NonNullable<LoadingStateProps["size"]>, string> = {
  sm: "py-2",
  md: "py-10",
  lg: "py-20",
};

export function LoadingState({
  label,
  size = "md",
  inline = false,
  accent = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "flex items-center text-ink-tertiary",
        inline
          ? "flex-row gap-2 justify-start"
          : cn("flex-col gap-3 justify-center text-center", PADDING[size]),
        className
      )}
    >
      <Loader2
        className={cn(
          "animate-spin",
          SPINNER_SIZE[size],
          accent ? "text-accent" : "text-ink-tertiary"
        )}
        strokeWidth={2}
        aria-hidden
      />
      {label ? (
        <span className={cn("leading-none", size === "sm" ? "text-sm" : "text-sm")}>
          {label}
        </span>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  );
}

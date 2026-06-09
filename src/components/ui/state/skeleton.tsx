import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * STATE-KIT — Skeleton (the "loading / skeleton" state primitive).
 *
 * The foundational shimmer atom every loading placeholder should compose
 * from, so the dozens of hand-rolled `bg-muted animate-pulse` divs across
 * cabinets converge on ONE rhythm + ONE token set.
 *
 *   <Skeleton className="h-8 w-64" />            // a single bar
 *   <SkeletonText lines={3} />                   // a paragraph
 *   <SkeletonGroup>...</SkeletonGroup>           // a pulsing region
 *
 * Tokens only (bg-muted / bg-line-soft). No raw colours, no style={{}}.
 * `animate-pulse` is a Tailwind utility that already honours
 * `prefers-reduced-motion`.
 *
 * Server-safe: no hooks, so these compose freely inside RSC `loading.tsx`
 * fallbacks. Each bar carries its own `animate-pulse`; because they all
 * mount together with identical keyframes they pulse in sync. <SkeletonGroup>
 * is a pure a11y wrapper (no extra animation) so nested bars never compound.
 */

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Round the bar fully (avatar / pill placeholders). */
  circle?: boolean;
  /** Use the softer line-soft fill instead of muted. */
  tone?: "muted" | "soft";
}

export function Skeleton({
  className,
  circle = false,
  tone = "muted",
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse",
        tone === "muted" ? "bg-muted" : "bg-line-soft",
        circle ? "rounded-full" : "rounded",
        className
      )}
      {...props}
    />
  );
}

/**
 * SkeletonGroup — announces a composed skeleton region to assistive tech as
 * a single "Loading" instead of dozens of silent divs. Pure a11y wrapper: it
 * does NOT add its own pulse (the child <Skeleton> bars animate, in sync), so
 * nesting never doubles the animation.
 */
export function SkeletonGroup({
  className,
  label = "Loading",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={className}
      {...props}
    >
      {children}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/**
 * SkeletonText — N placeholder lines with the last line shortened, the way
 * a real paragraph wraps. Heights/gaps match the kit's body rhythm.
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          tone="soft"
          className={cn("h-3", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

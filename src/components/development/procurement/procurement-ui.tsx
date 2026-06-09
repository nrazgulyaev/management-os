import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pixel-dev-procurement — shared presentational primitives that match
 * the `cabinets/dev-p1/procurement.html` mockup vocabulary.
 *
 * Server components, no inline styles. Every value pulls from the
 * development Layer-B palette (amber accent, carbon ink, sand surfaces,
 * Space Grotesk display via `.text-display`, IBM Plex Mono via
 * `font-mono`). These mirror the mockup's `.pf-sec-head`, `.pf-card-q`,
 * `.pf-rr` and the request-path timeline so the live procurement
 * pages read section-for-section against the design.
 */

/** Mockup `.pf-sec-head` — mono eyebrow + Space Grotesk h3 + count. */
export function RailSectionHead({
  eyebrow,
  title,
  count,
  countTone = "neutral",
  action,
  className,
}: {
  eyebrow: string;
  title: string;
  count?: React.ReactNode;
  countTone?: "neutral" | "info" | "accent" | "warning";
  action?: React.ReactNode;
  className?: string;
}) {
  const countCls = {
    neutral: "bg-bg-2 text-ink-3 border-line",
    info: "bg-info/10 text-info border-info/35",
    accent: "bg-amber/15 text-amber border-amber/35",
    warning: "bg-warning/10 text-warning border-warning/35",
  }[countTone];
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-3 mt-7 mb-3 flex-wrap",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          {eyebrow}
        </div>
        <h3 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {title}
        </h3>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {count != null && (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] tabular-nums",
              countCls,
            )}
          >
            {count}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

/** Mockup `.pf-card-q` — the white queue card that wraps request rows. */
export function QueueCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-line-2 bg-panel overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Mockup `.pf-emptyq` — terse empty state inside a queue card. */
export function QueueEmpty({ children }: { children: React.ReactNode }) {
  return (
    <QueueCard>
      <div className="px-7 py-8 text-center text-[13px] text-ink-4">
        {children}
      </div>
    </QueueCard>
  );
}

/**
 * Mockup `.pf-rr` — a single request row inside the queue card.
 * Columns: code · item + sub · wait note · status badge · amount · meta.
 * Slots are passed as nodes so the live data wiring stays on the page.
 */
export function QueueRow({
  code,
  title,
  sub,
  wait,
  status,
  amount,
  meta,
  href,
  className,
}: {
  code: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  wait?: React.ReactNode;
  status?: React.ReactNode;
  amount?: React.ReactNode;
  meta?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const Inner = (
    <>
      <span className="font-mono text-[12px] text-ink-3">{code}</span>
      <div className="min-w-0">
        <div className="font-semibold text-[14px] text-ink truncate">
          {title}
        </div>
        {sub != null && (
          <div className="font-mono text-[11.5px] text-ink-4 mt-px truncate">
            {sub}
          </div>
        )}
      </div>
      <span className="hidden md:block font-mono text-[11px] text-ink-4">
        {wait}
      </span>
      <div className="hidden md:block">{status}</div>
      <span className="hidden md:block font-mono tabular-nums text-[13px] text-ink text-right">
        {amount}
      </span>
      <div className="flex justify-end">{meta}</div>
    </>
  );
  const grid =
    "grid grid-cols-[70px_1fr_auto] md:grid-cols-[90px_1fr_130px_150px_120px_110px] gap-3 items-center px-4 py-[13px] border-b border-line-soft last:border-b-0";
  if (href) {
    return (
      <a
        href={href}
        className={cn(grid, "hover:bg-bg-2 transition-colors", className)}
      >
        {Inner}
      </a>
    );
  }
  return <div className={cn(grid, className)}>{Inner}</div>;
}

/** Mockup `.pf-wait` — the muted "awaiting X" hand-off note as a meta chip. */
export function WaitChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line-soft bg-bg-2 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2 whitespace-nowrap">
      {children}
    </span>
  );
}

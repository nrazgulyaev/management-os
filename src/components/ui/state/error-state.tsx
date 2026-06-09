import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * STATE-KIT — ErrorState (the "error" state primitive).
 *
 * An IN-SURFACE error block: use it when a section / panel / data fetch
 * fails but the rest of the page is fine. It is intentionally NOT the
 * route-level boundary — that is `RouteErrorBoundary` (rendered by each
 * portal's error.tsx). Reach for this inside a card, a tab, a widget.
 *
 *   <ErrorState
 *     title="Couldn't load payouts"
 *     description="The finance service didn't respond."
 *     onRetry={() => router.refresh()}
 *     digest={result.error?.digest}
 *   />
 *
 * Two densities:
 *   - default → bordered block (drop into a card body)
 *   - inline  → a compact row (drop into a toolbar / list header)
 */

export interface ErrorStateProps {
  /** Short, human headline. Defaults to a calm generic. */
  title?: React.ReactNode;
  /** One-line explanation. Avoid leaking stack traces here. */
  description?: React.ReactNode;
  /** Wires a "Try again" button when provided. */
  onRetry?: () => void;
  /** Label for the retry button. */
  retryLabel?: string;
  /** Support-correlation id (Next.js digest / request id). Monospaced footer. */
  digest?: string;
  /** Extra actions (e.g. a "Contact support" link) beside Try again. */
  actions?: React.ReactNode;
  /** Compact single-row layout. */
  inline?: boolean;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "This section hit an unexpected error. Your data is safe — only this view failed to load.",
  onRetry,
  retryLabel = "Try again",
  digest,
  actions,
  inline = false,
  className,
}: ErrorStateProps) {
  const retry = onRetry ? (
    <Button variant={inline ? "secondary" : "primary"} size="sm" onClick={onRetry}>
      {retryLabel}
    </Button>
  ) : null;

  if (inline) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center gap-3 rounded-md border border-danger/30 bg-danger-weak/50 px-4 py-3",
          className
        )}
      >
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-danger"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{title}</p>
          {description ? (
            <p className="text-xs text-ink-secondary truncate">{description}</p>
          ) : null}
        </div>
        {(retry || actions) && (
          <div className="flex shrink-0 items-center gap-2">
            {retry}
            {actions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-danger/25 bg-danger-weak/40 px-8 py-12 text-center",
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-weak text-danger">
        <AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-base font-medium text-ink">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-ink-secondary">
          {description}
        </p>
      ) : null}
      {(retry || actions) && (
        <div className="mt-1 flex items-center justify-center gap-2">
          {retry}
          {actions}
        </div>
      )}
      {digest ? (
        <p className="pt-1 font-mono text-xs text-ink-tertiary">digest: {digest}</p>
      ) : null}
    </div>
  );
}

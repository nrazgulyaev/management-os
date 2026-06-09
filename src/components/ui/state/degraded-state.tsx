import * as React from "react";
import { CloudOff, WifiOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * STATE-KIT — DegradedState (the "offline / degraded" state primitive).
 *
 * For when a dependency is down but the page itself rendered: the database
 * connection is null, a downstream service timed out, or the client lost
 * connectivity. We keep the shell and tell the user this surface is
 * running in a reduced mode — not a hard error, not a white screen.
 *
 *   <DegradedState
 *     kind="db"
 *     message="Live data is temporarily unavailable."
 *     onRetry={() => router.refresh()}
 *   />
 *
 * `kind`:
 *   - "service"  → a backend dependency is degraded (default)
 *   - "db"       → the database connection is not active (getDb() === null)
 *   - "offline"  → the client appears offline / lost connectivity
 */

type DegradedKind = "service" | "db" | "offline";

const COPY: Record<
  DegradedKind,
  { badge: string; title: string; description: string; Icon: typeof CloudOff }
> = {
  service: {
    badge: "degraded",
    title: "Running in reduced mode",
    description:
      "A service this view depends on is responding slowly or is temporarily unavailable. Some data may be missing — try again in a moment.",
    Icon: CloudOff,
  },
  db: {
    badge: "database unavailable",
    title: "Live data is paused",
    description:
      "The database connection isn't active right now, so live figures are hidden. The page still works — refresh to reconnect.",
    Icon: CloudOff,
  },
  offline: {
    badge: "offline",
    title: "You appear to be offline",
    description:
      "We can't reach the network. Recent data may be stale until your connection returns.",
    Icon: WifiOff,
  },
};

export interface DegradedStateProps {
  kind?: DegradedKind;
  /** Override the default one-line explanation. */
  message?: React.ReactNode;
  /** Override the default headline. */
  title?: React.ReactNode;
  /** Wires a refresh / retry button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Compact single-row banner instead of a centred block. */
  inline?: boolean;
  className?: string;
}

export function DegradedState({
  kind = "service",
  message,
  title,
  onRetry,
  retryLabel = "Try again",
  inline = false,
  className,
}: DegradedStateProps) {
  const copy = COPY[kind];
  const Icon = copy.Icon;
  const description = message ?? copy.description;

  if (inline) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-center gap-3 rounded-md border border-warning/30 bg-warning-weak/60 px-4 py-3",
          className
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-ink">
          {title ?? copy.title} — <span className="text-ink-secondary">{description}</span>
        </p>
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry} className="shrink-0">
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-warning/25 bg-warning-weak/40 px-8 py-12 text-center",
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning-weak text-warning">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <Badge tone="warning">{copy.badge}</Badge>
      <h3 className="text-base font-medium text-ink">{title ?? copy.title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-ink-secondary">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          <RotateCw className="h-4 w-4" aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

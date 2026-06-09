import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * STATE-KIT — Forbidden (the "forbidden / no-access" state primitive).
 *
 * The clean, on-token answer to "you don't have access" — for surfaces a
 * signed-in user reaches but their role / org scope can't see. This is a
 * DENY-with-dignity screen, not an error and not a login wall: no scary
 * red, no stack trace, a clear reason + a way back.
 *
 *   // full page (a permission-gated route)
 *   <Forbidden
 *     reason="Finance figures are limited to owners and finance admins."
 *     homeHref="/dashboard"
 *     homeLabel="Back to Management OS"
 *   />
 *
 *   // inside a card / widget the user partially sees
 *   <Forbidden variant="inline" title="Restricted" reason="Ask an admin for access." />
 *
 * For the not-signed-in case use the auth redirect, not this. This is for
 * authenticated-but-unauthorised.
 */

export interface ForbiddenProps {
  /** Headline. Defaults to a calm "You don't have access". */
  title?: React.ReactNode;
  /** Why — name the role / scope that would unlock it. */
  reason?: React.ReactNode;
  /** Where "back" points. Omit to hide the link. */
  homeHref?: string;
  /** Label for the back link. */
  homeLabel?: string;
  /** Extra actions (e.g. a "Request access" button). */
  actions?: React.ReactNode;
  /** page → centred full-height screen; inline → a card-body block. */
  variant?: "page" | "inline";
  className?: string;
}

export function Forbidden({
  title = "You don't have access",
  reason = "This area is limited to a different role or workspace. If you think this is a mistake, ask an administrator to grant you access.",
  homeHref,
  homeLabel = "Go back",
  actions,
  variant = "page",
  className,
}: ForbiddenProps) {
  const body = (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        variant === "page" ? "max-w-md gap-5" : "gap-3",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-ink-secondary",
          variant === "page" ? "h-12 w-12" : "h-10 w-10"
        )}
      >
        <Lock
          className={variant === "page" ? "h-6 w-6" : "h-5 w-5"}
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
          Restricted
        </div>
        <h1
          className={cn(
            "font-medium text-ink",
            variant === "page"
              ? "text-display text-[28px] leading-[1.1]"
              : "text-lg leading-snug"
          )}
        >
          {title}
        </h1>
      </div>
      {reason ? (
        <p
          className={cn(
            "leading-relaxed text-ink-secondary",
            variant === "page" ? "text-base" : "max-w-sm text-sm"
          )}
        >
          {reason}
        </p>
      ) : null}
      {(homeHref || actions) && (
        <div className="flex items-center justify-center gap-3 pt-1">
          {actions}
          {homeHref ? (
            <Button variant="secondary" size={variant === "page" ? "md" : "sm"} asChild>
              <Link href={homeHref}>{homeLabel}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="flex justify-center rounded-md border border-line-soft bg-muted/20 px-6 py-10">
        {body}
      </div>
    );
  }

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-canvas px-6 py-16">
      {body}
    </main>
  );
}

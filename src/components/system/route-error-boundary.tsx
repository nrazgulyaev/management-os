"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * OBSERVABILITY-SPINE-H — shared recovery UI for the portal route-group
 * error.tsx boundaries.
 *
 * Next.js renders the nearest `error.tsx` when a server/client component in
 * that segment throws during render. Without one, the framework shows its
 * bare "Application error" white screen. This component gives each portal a
 * branded, on-token fallback with a "Try again" (calls `reset()`) and a
 * "Back to <portal>" link, plus the error digest for support correlation.
 *
 * It is a client component (required for error boundaries). We log to the
 * browser console only — we deliberately do NOT import the server logger,
 * which would ship Sentry/Logtail tokens to the client. Server-side render
 * errors are already captured by Next.js + Vercel's own error reporting.
 */

export interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Human label for the portal, e.g. "Management OS". */
  portalLabel: string;
  /** Where "Back to home" should point, e.g. "/dashboard". */
  homeHref: string;
  /** Label for the back link, e.g. "Management OS home". */
  homeLabel: string;
}

export function RouteErrorBoundary({
  error,
  reset,
  portalLabel,
  homeHref,
  homeLabel,
}: RouteErrorBoundaryProps) {
  useEffect(() => {
    // Surface in the browser console for local debugging; production capture
    // is handled by Next.js/Vercel server-side error reporting.
    console.error(`[${portalLabel}] route render error`, error);
  }, [error, portalLabel]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center bg-canvas px-6 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-ink-secondary">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
          {portalLabel}
        </div>
        <h1 className="text-display text-[32px] leading-[1.1] font-medium text-ink">
          Something went wrong.
        </h1>
        <p className="text-ink-secondary text-base leading-relaxed">
          This view hit an unexpected error. Your data is safe — only the page
          failed to render. Try again, or head back and pick up where you left
          off.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <Button variant="primary" onClick={() => reset()}>
            Try again
          </Button>
          <Button variant="secondary" asChild>
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
        {error.digest && (
          <p className="text-xs text-ink-tertiary pt-2 font-mono">
            digest: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}

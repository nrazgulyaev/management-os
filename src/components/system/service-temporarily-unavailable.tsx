import Link from "next/link";

/**
 * Stage 10.6.B.2-fix — minimal "this area is down" page rendered by
 * the (development-app) and (dashboard) layouts when their auth /
 * product-access guard throws an unexpected runtime error.
 *
 * Distinct from the Next.js error.tsx route boundary:
 *   - Triggered explicitly by the layout's try/catch (not by a child
 *     render error)
 *   - Re-throws Next.js redirect signals (isRedirectError) so
 *     intentional redirects still flow through
 *   - Renders WITHOUT the dashboard / development-os shell so a
 *     broken layout doesn't compound by trying to render the broken
 *     shell again
 *
 * Operator can extend this with a Vercel error-id surface for
 * support correlation when telemetry lands (Phase 10.6.D candidate).
 */

export interface ServiceTemporarilyUnavailableProps {
  /**
   * The product surface that failed — used to label the back link.
   * "mgmt" → /dashboard, "dev" → /development-os, omitted → /.
   */
  area?: "mgmt" | "dev";
}

export function ServiceTemporarilyUnavailable({
  area,
}: ServiceTemporarilyUnavailableProps = {}) {
  const backLabel =
    area === "mgmt"
      ? "Management OS home"
      : area === "dev"
        ? "Development OS home"
        : "Homepage";
  const backHref =
    area === "mgmt" ? "/dashboard" : area === "dev" ? "/development-os" : "/";

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
          Service temporarily unavailable
        </div>
        <h1 className="text-display text-[36px] leading-[1.1] font-medium text-ink">
          We&rsquo;ll be right back.
        </h1>
        <p className="text-ink-secondary text-base leading-relaxed">
          We&rsquo;re seeing intermittent issues with this area. Please reload
          in a moment, or head back to the homepage and try a different
          surface.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <a
            href=""
            className="inline-flex items-center rounded-md border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-line-strong transition-colors"
          >
            Reload
          </a>
          <Link
            href={backHref}
            className="inline-flex items-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-ink/90 transition-colors"
          >
            {backLabel} →
          </Link>
        </div>
        <p className="text-xs text-ink-tertiary pt-4">
          If this persists, contact support and reference the timestamp:{" "}
          <span className="font-mono">{new Date().toISOString()}</span>.
        </p>
      </div>
    </main>
  );
}

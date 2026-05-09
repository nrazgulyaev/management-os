import Link from "next/link";
import { AlertTriangle, Clock, Sparkles } from "lucide-react";
import type { TrialState } from "@/features/billing/trial-state";

/**
 * Stage 10.I.6 — Persistent trial-state banner.
 *
 * Server component. Rendered at the top of the Mgmt OS + Dev OS layouts
 * (above the topbar). Variants by `state.ui`:
 *   - active           → muted info strip, X days remaining
 *   - expiring-soon    → warning strip, urgent CTA
 *   - expired          → danger strip, "Upgrade" mailto CTA prominent
 *   - cancelled        → danger strip, contact-sales CTA
 *   - none / converted → returns null (banner hidden)
 */

const SALES_MAILTO =
  "mailto:sales@arconique.com?subject=Upgrade%20from%20trial";

export function TrialBanner({ state }: { state: TrialState }) {
  if (!state.shouldShowBanner) return null;

  if (state.ui === "active") {
    const days = state.daysRemaining ?? 0;
    return (
      <div className="border-b border-line-soft bg-muted/40 text-ink-secondary text-xs">
        <div className="px-4 md:px-8 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent" strokeWidth={1.75} />
            <span>
              Free trial — <strong className="text-ink">{days}</strong>{" "}
              day{days === 1 ? "" : "s"} remaining.
            </span>
          </span>
          <Link
            href={SALES_MAILTO}
            className="text-ink hover:underline underline-offset-4"
          >
            Upgrade →
          </Link>
        </div>
      </div>
    );
  }

  if (state.ui === "expiring-soon") {
    const days = state.daysRemaining ?? 0;
    return (
      <div className="border-b border-warning/40 bg-warning-weak/40 text-ink text-xs">
        <div className="px-4 md:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
            <strong>Trial ends in {days === 0 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`}.</strong>
            <span className="text-ink-secondary">
              Reach out to sales to keep your workspace active.
            </span>
          </span>
          <Link
            href={SALES_MAILTO}
            className="font-medium text-ink hover:underline underline-offset-4"
          >
            Talk to sales →
          </Link>
        </div>
      </div>
    );
  }

  if (state.ui === "expired" || state.ui === "cancelled") {
    return (
      <div className="border-b border-danger/40 bg-danger-weak/40 text-ink text-xs">
        <div className="px-4 md:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle
              className="w-3.5 h-3.5 text-danger"
              strokeWidth={1.75}
            />
            <strong>
              {state.ui === "expired"
                ? "Your trial has ended."
                : "Your subscription is cancelled."}
            </strong>
            <span className="text-ink-secondary">
              Workspace is read-only — every record is preserved. Choose a
              plan to re-enable mutations.
            </span>
          </span>
          <Link
            href={SALES_MAILTO}
            className="font-medium text-danger hover:underline underline-offset-4"
          >
            Talk to sales →
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

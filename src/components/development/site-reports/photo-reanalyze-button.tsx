"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { reanalyzePhoto } from "@/lib/development/server/photo-analyst-actions";

/**
 * Small inline button on each photo card. Server action triggers a
 * re-analysis; on success the parent page revalidates and the new
 * AI fields render.
 *
 * Disabled when `budgetAllowed=false` (resolved server-side and
 * passed in from the page render).
 */
export function PhotoReanalyzeButton({
  photoId,
  reportId,
  budgetAllowed,
  budgetReason,
  alreadyAnalyzed,
}: {
  photoId: string;
  reportId: string;
  budgetAllowed: boolean;
  budgetReason?: string;
  alreadyAnalyzed?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const disabled = !budgetAllowed || pending;
  const tooltip = !budgetAllowed
    ? `AI photo analyst is paused: ${budgetReason ?? "budget exceeded"}`
    : alreadyAnalyzed
      ? "Re-analyze this photo"
      : "Run AI analysis on this photo";

  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={disabled}
        title={tooltip}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const out = await reanalyzePhoto({ photoId, reportId });
            if (out.status === "failed" || out.status === "budget_exceeded") {
              setError(out.errorMessage ?? "Analysis failed");
            }
          });
        }}
        className="inline-flex items-center gap-1 text-[10px] text-ink-tertiary hover:text-ink-secondary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        {alreadyAnalyzed ? "Re-analyze" : "Analyze"}
      </button>
      {error && (
        <div className="text-[10px] text-danger mt-0.5">{error}</div>
      )}
    </div>
  );
}

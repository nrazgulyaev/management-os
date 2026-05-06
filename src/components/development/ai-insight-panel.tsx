import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import type { AIInsight } from "@/lib/development/types";

const confidenceTone: Record<AIInsight["confidence"], "accent" | "gold" | "neutral"> = {
  high: "accent",
  medium: "gold",
  low: "neutral",
};

export function AIInsightPanel({
  insight,
  className,
}: {
  insight: AIInsight;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative rounded-md border border-line-soft bg-surface overflow-hidden",
        className
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/0 via-accent/50 to-accent/0"
        aria-hidden
      />
      <div className="p-6 flex flex-col gap-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-sm bg-accent-weak text-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4" strokeWidth={1.75} />
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">
                  AI Executive Analyst
                </span>
                <Badge tone="gold">AI-generated</Badge>
                <Badge tone={confidenceTone[insight.confidence]}>
                  {insight.confidence} confidence
                </Badge>
              </div>
              <span className="text-xs text-ink-tertiary mt-0.5">
                Generated {formatDate(insight.generatedAt, "long")}
              </span>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled>
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            Refresh insight
          </Button>
        </header>

        <div className="flex flex-col gap-3">
          <h3 className="text-display text-[22px] leading-tight font-medium text-ink max-w-3xl">
            {insight.headline}
          </h3>
          <p className="text-sm md:text-base text-ink-secondary leading-relaxed max-w-3xl">
            {insight.body}
          </p>
        </div>

        {insight.recommendedAction && (
          <div className="rounded-sm border border-accent/20 bg-accent-weak/60 px-4 py-3 flex flex-col gap-1">
            <span className="text-label text-accent">Recommended action</span>
            <p className="text-sm text-ink leading-relaxed">
              {insight.recommendedAction}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

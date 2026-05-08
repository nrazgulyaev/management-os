/**
 * Stage 10.B — Timeline primitive.
 *
 * Lifecycle journey visualization. Renders a horizontal sequence of
 * stages with status badges + per-transition required-fields gate
 * surfacing.
 *
 * Used by: 10.K Front Office (guest journey: Inquiry → Hold → Quoted
 * → Booked → Pre-arrival → Check-in → In-stay → Check-out → Reviewed),
 * 10.J Owner (capital call sequence), 10.F PM (project phases).
 *
 * Reference patterns: Mews journey timeline + Cloudbeds reservation
 * lifecycle + Procore project-phase tracker (research-summary.md
 * theme 4).
 *
 * Server component. Interaction (clicking a stage) is delegated via
 * `onStageClick` or `stageHref` per stage.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, Circle, Clock, AlertTriangle } from "lucide-react";

export type TimelineStageStatus =
  | "complete"
  | "active"
  | "blocked"
  | "pending";

export interface TimelineStage {
  id: string;
  label: string;
  status: TimelineStageStatus;
  hint?: string;
  href?: string;
  /** Required fields blocking transition into the next stage. */
  blockedBy?: string[];
  /** Free-form right-side content (e.g., timestamp, $ value). */
  meta?: React.ReactNode;
}

export interface TimelineProps {
  stages: TimelineStage[];
  orientation?: "horizontal" | "vertical";
  className?: string;
  onStageClick?: (id: string) => void;
}

const ICON_FOR: Record<TimelineStageStatus, React.ComponentType<{ className?: string }>> = {
  complete: Check,
  active: Clock,
  blocked: AlertTriangle,
  pending: Circle,
};

const COLOR_FOR: Record<TimelineStageStatus, string> = {
  complete: "bg-success text-white border-success",
  active: "bg-accent text-white border-accent",
  blocked: "bg-danger text-white border-danger",
  pending: "bg-surface text-ink-tertiary border-line-soft",
};

const RAIL_FOR: Record<TimelineStageStatus, string> = {
  complete: "bg-success",
  active: "bg-accent",
  blocked: "bg-danger",
  pending: "bg-line-soft",
};

export function Timeline({
  stages,
  orientation = "horizontal",
  className,
  onStageClick,
}: TimelineProps) {
  if (stages.length === 0) {
    return (
      <div
        className={cn("text-sm text-ink-tertiary italic", className)}
        data-empty
      >
        No stages defined
      </div>
    );
  }

  if (orientation === "vertical") {
    return (
      <ol className={cn("flex flex-col", className)}>
        {stages.map((stage, i) => {
          const Icon = ICON_FOR[stage.status];
          const last = i === stages.length - 1;
          return (
            <li key={stage.id} className="flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <StageDot stage={stage} Icon={Icon} onStageClick={onStageClick} />
                {!last && (
                  <span
                    aria-hidden
                    className={cn("w-px flex-1 mt-1", RAIL_FOR[stage.status])}
                  />
                )}
              </div>
              <StageBody stage={stage} />
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={cn("flex items-start", className)} role="list">
      {stages.map((stage, i) => {
        const Icon = ICON_FOR[stage.status];
        const last = i === stages.length - 1;
        return (
          <li key={stage.id} className="flex-1 flex flex-col items-center">
            <div className="w-full flex items-center gap-0">
              {i === 0 ? (
                <span aria-hidden className="flex-1" />
              ) : (
                <span
                  aria-hidden
                  className={cn("flex-1 h-px", RAIL_FOR[stage.status])}
                />
              )}
              <StageDot stage={stage} Icon={Icon} onStageClick={onStageClick} />
              {last ? (
                <span aria-hidden className="flex-1" />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "flex-1 h-px",
                    RAIL_FOR[stages[i + 1]?.status ?? "pending"],
                  )}
                />
              )}
            </div>
            <div className="mt-2 text-center px-1">
              <div className="text-xs font-medium text-ink">{stage.label}</div>
              {stage.hint && (
                <div className="text-xs text-ink-tertiary mt-0.5">{stage.hint}</div>
              )}
              {stage.status === "blocked" && stage.blockedBy && stage.blockedBy.length > 0 && (
                <div className="text-xs text-danger mt-1">
                  Blocked: {stage.blockedBy.join(", ")}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StageDot({
  stage,
  Icon,
  onStageClick,
}: {
  stage: TimelineStage;
  Icon: React.ComponentType<{ className?: string }>;
  onStageClick?: (id: string) => void;
}) {
  const cls = cn(
    "w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0",
    COLOR_FOR[stage.status],
  );
  const inner = <Icon className="w-3.5 h-3.5" />;
  if (stage.href) {
    return (
      <a href={stage.href} className={cls} aria-label={stage.label}>
        {inner}
      </a>
    );
  }
  if (onStageClick) {
    return (
      <button
        type="button"
        onClick={() => onStageClick(stage.id)}
        className={cls}
        aria-label={stage.label}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={cls} aria-label={stage.label}>
      {inner}
    </span>
  );
}

function StageBody({ stage }: { stage: TimelineStage }) {
  return (
    <div className="flex-1 pb-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{stage.label}</span>
        {stage.meta && (
          <span className="text-xs text-ink-tertiary">{stage.meta}</span>
        )}
      </div>
      {stage.hint && (
        <div className="text-xs text-ink-tertiary mt-0.5">{stage.hint}</div>
      )}
      {stage.status === "blocked" && stage.blockedBy && stage.blockedBy.length > 0 && (
        <ul className="text-xs text-danger mt-1 list-disc pl-4">
          {stage.blockedBy.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

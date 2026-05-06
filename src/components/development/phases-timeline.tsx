import * as React from "react";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectPhaseRow } from "@/lib/development/types/projects";

const phaseLabel: Record<string, string> = {
  land_sourcing: "Land sourcing",
  due_diligence: "Due diligence",
  design: "Design",
  permits: "Permits",
  pre_sales: "Pre-sales",
  under_construction: "Construction",
  pre_handover: "Pre-handover",
  handover: "Handover",
  managed: "Managed",
  archived: "Archived",
};

const statusTone: Record<string, string> = {
  not_started: "bg-muted border-line-soft text-ink-tertiary",
  in_progress: "bg-accent text-accent-contrast border-accent",
  completed: "bg-accent-weak text-accent border-accent/30",
  on_hold: "bg-warning-weak text-warning border-warning/30",
  cancelled: "bg-muted text-ink-tertiary border-line-soft line-through",
};

type Bar = {
  phase: ProjectPhaseRow;
  start: number;
  end: number;
  startISO: string;
  endISO: string;
};

function isoToTs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function deriveBar(phase: ProjectPhaseRow): Bar | null {
  const start = isoToTs(phase.actualStartDate ?? phase.plannedStartDate);
  const end = isoToTs(phase.actualEndDate ?? phase.plannedEndDate);
  if (start === null || end === null) return null;
  if (end < start) return null;
  return {
    phase,
    start,
    end,
    startISO: phase.actualStartDate ?? phase.plannedStartDate ?? "",
    endISO: phase.actualEndDate ?? phase.plannedEndDate ?? "",
  };
}

/**
 * Horizontal Gantt-like view of project phases. Overlapping phases stack
 * vertically. Layout uses a normalized 0-100 horizontal scale.
 */
export function PhasesTimeline({
  phases,
  className,
}: {
  phases: ProjectPhaseRow[];
  className?: string;
}) {
  const bars = phases
    .map(deriveBar)
    .filter((b): b is Bar => b !== null)
    .sort((a, b) => a.start - b.start);

  if (bars.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center",
          className,
        )}
      >
        <p className="text-sm text-ink-secondary">
          No phase dates recorded yet. Phases without planned dates do not
          appear on the timeline.
        </p>
      </div>
    );
  }

  const min = Math.min(...bars.map((b) => b.start));
  const max = Math.max(...bars.map((b) => b.end));
  const span = Math.max(1, max - min);

  // Greedy lane assignment for overlap visualization.
  type Lane = { endTs: number };
  const lanes: Lane[] = [];
  const placed = bars.map((b) => {
    const laneIndex = lanes.findIndex((l) => l.endTs <= b.start);
    if (laneIndex === -1) {
      lanes.push({ endTs: b.end });
      return { bar: b, lane: lanes.length - 1 };
    }
    lanes[laneIndex].endTs = b.end;
    return { bar: b, lane: laneIndex };
  });

  const laneCount = Math.max(1, lanes.length);
  const rowHeight = 36;
  const totalHeight = laneCount * rowHeight + 16;

  return (
    <div
      className={cn(
        "rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-4",
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs text-ink-tertiary">
        <span className="font-mono">{formatDate(new Date(min), "short")}</span>
        <span className="font-mono">{formatDate(new Date(max), "short")}</span>
      </div>

      <div
        className="relative w-full"
        style={{ height: totalHeight }}
        role="img"
        aria-label="Project phases timeline"
      >
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}
          aria-hidden
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="border-r border-line-soft/60 last:border-r-0" />
          ))}
        </div>

        {placed.map(({ bar, lane }) => {
          const left = ((bar.start - min) / span) * 100;
          const width = ((bar.end - bar.start) / span) * 100;
          const tone = statusTone[bar.phase.status] ?? statusTone.not_started;
          return (
            <div
              key={bar.phase.id}
              className={cn(
                "absolute rounded-sm border px-2 py-1.5 flex items-center gap-2 text-[11px] font-medium overflow-hidden",
                tone,
              )}
              style={{
                left: `${left}%`,
                width: `max(${width}%, 80px)`,
                top: lane * rowHeight + 4,
                height: rowHeight - 8,
              }}
              title={`${phaseLabel[bar.phase.phaseType] ?? bar.phase.phaseType} · ${bar.phase.status}`}
            >
              <span className="truncate">
                {phaseLabel[bar.phase.phaseType] ?? bar.phase.phaseType}
              </span>
            </div>
          );
        })}
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
        {bars.map(({ phase, startISO, endISO }) => (
          <li
            key={phase.id}
            className="rounded-sm border border-line-soft bg-canvas px-3 py-2 flex flex-col gap-0.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink truncate">
                {phaseLabel[phase.phaseType] ?? phase.phaseType}
              </span>
              <span
                className={cn(
                  "text-[10px] uppercase font-medium tracking-wide rounded-full px-1.5 py-0.5 border",
                  statusTone[phase.status] ?? statusTone.not_started,
                )}
              >
                {phase.status.replace("_", " ")}
              </span>
            </div>
            <span className="text-[11px] text-ink-tertiary font-mono">
              {startISO ? formatDate(startISO, "short") : "—"} →{" "}
              {endISO ? formatDate(endISO, "short") : "—"}
            </span>
            {phase.notes && (
              <span className="text-[11px] text-ink-secondary leading-snug mt-1">
                {phase.notes}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

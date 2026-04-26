import { Badge } from "@/components/ui/badge";
import { PriorityPill } from "./priority-pill";
import { CalendarClock } from "lucide-react";
import type { PreventiveScheduleRow } from "@/features/operations/services";

export function ScheduleCard({ schedule }: { schedule: PreventiveScheduleRow }) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="outline">{schedule.frequency}</Badge>
          <PriorityPill priority={schedule.priority} />
          {schedule.status !== "active" && <Badge tone="neutral">{schedule.status}</Badge>}
        </div>
        <div className="text-ink font-medium text-sm mt-2 flex items-center gap-2">
          <CalendarClock className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.75} />
          {schedule.name}
        </div>
        <div className="text-xs text-ink-secondary mt-0.5 capitalize">
          {schedule.category.replace(/_/g, " ")}
          {schedule.villaCode ? ` · ${schedule.villaCode}` : ""}
          {schedule.projectName ? ` · ${schedule.projectName}` : ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-ink-tertiary">Next due</div>
        <div className="font-mono tabular-nums text-sm text-ink mt-0.5">
          {schedule.nextDueOn}
        </div>
        {schedule.assignedToName && (
          <div className="text-[11px] text-ink-tertiary mt-1 truncate max-w-[160px]">
            {schedule.assignedToName}
          </div>
        )}
      </div>
    </div>
  );
}

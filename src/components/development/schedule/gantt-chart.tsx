/**
 * Server-rendered SVG Gantt chart. No external library, no client JS —
 * tasks are rendered as horizontal bars with critical-path highlighting,
 * a "today" indicator line, and dependency arrows for FS edges.
 *
 * Dimensions are conservative: 24px per task row, 8px per day. For
 * projects with hundreds of tasks the page wraps the SVG in horizontal
 * scroll.
 */

const ROW_HEIGHT = 28;
const DAY_WIDTH = 8;
const HEADER_HEIGHT = 30;
const LEFT_PADDING = 200; // task name column

const MS_PER_DAY = 86_400_000;

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export interface GanttTask {
  id: string;
  taskCode: string;
  name: string;
  plannedStart: string; // YYYY-MM-DD
  plannedFinish: string;
  isOnCriticalPath: boolean;
  status: string;
}

export interface GanttDependency {
  predecessorId: string;
  successorId: string;
}

export function GanttChart({
  tasks,
  dependencies,
}: {
  tasks: GanttTask[];
  dependencies: GanttDependency[];
}) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        No tasks to display. Add a task from the schedule tab.
      </p>
    );
  }

  // Compute project window.
  const startDates = tasks.map((t) => new Date(t.plannedStart));
  const finishDates = tasks.map((t) => new Date(t.plannedFinish));
  const projectStart = new Date(
    Math.min(...startDates.map((d) => d.getTime())),
  );
  const projectEnd = new Date(
    Math.max(...finishDates.map((d) => d.getTime())),
  );
  // Pad ±3 days for visual breathing room.
  projectStart.setDate(projectStart.getDate() - 3);
  projectEnd.setDate(projectEnd.getDate() + 3);
  const totalDays = diffDays(projectStart, projectEnd) + 1;

  const today = new Date();
  const todayOffset = diffDays(projectStart, today);

  const width = LEFT_PADDING + totalDays * DAY_WIDTH;
  const height = HEADER_HEIGHT + tasks.length * ROW_HEIGHT;

  // Position lookup for dependency arrows.
  const taskRowIndex = new Map<string, number>();
  tasks.forEach((t, i) => taskRowIndex.set(t.id, i));

  function taskBar(task: GanttTask, index: number) {
    const start = new Date(task.plannedStart);
    const end = new Date(task.plannedFinish);
    const x = LEFT_PADDING + diffDays(projectStart, start) * DAY_WIDTH;
    const w = (diffDays(start, end) + 1) * DAY_WIDTH;
    const y = HEADER_HEIGHT + index * ROW_HEIGHT + 4;
    const fill = task.isOnCriticalPath
      ? "#dc2626" // red for critical
      : task.status === "completed"
        ? "#059669"
        : task.status === "in_progress"
          ? "#2563eb"
          : "#6b7280";
    return (
      <g key={task.id}>
        <text
          x={4}
          y={y + 14}
          fontSize={11}
          fill="#1f2937"
          className="font-mono"
        >
          {task.taskCode.length > 12
            ? task.taskCode.slice(0, 11) + "…"
            : task.taskCode}
        </text>
        <text x={70} y={y + 14} fontSize={11} fill="#374151">
          {task.name.length > 18 ? task.name.slice(0, 17) + "…" : task.name}
        </text>
        <rect
          x={x}
          y={y}
          width={Math.max(w, 4)}
          height={ROW_HEIGHT - 8}
          fill={fill}
          rx={2}
          opacity={0.85}
        />
        {task.isOnCriticalPath && (
          <text
            x={x + Math.max(w, 4) + 4}
            y={y + 14}
            fontSize={10}
            fill="#dc2626"
            fontWeight="bold"
          >
            CP
          </text>
        )}
      </g>
    );
  }

  function dependencyArrow(dep: GanttDependency, key: string) {
    const predIdx = taskRowIndex.get(dep.predecessorId);
    const succIdx = taskRowIndex.get(dep.successorId);
    if (predIdx === undefined || succIdx === undefined) return null;
    const predTask = tasks[predIdx];
    const succTask = tasks[succIdx];
    const predEnd = new Date(predTask.plannedFinish);
    const succStart = new Date(succTask.plannedStart);
    const x1 =
      LEFT_PADDING +
      (diffDays(projectStart, predEnd) + 1) * DAY_WIDTH;
    const y1 = HEADER_HEIGHT + predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x2 = LEFT_PADDING + diffDays(projectStart, succStart) * DAY_WIDTH;
    const y2 = HEADER_HEIGHT + succIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    return (
      <path
        key={key}
        d={`M ${x1} ${y1} L ${x1 + 4} ${y1} L ${x1 + 4} ${y2} L ${x2 - 2} ${y2}`}
        fill="none"
        stroke="#9ca3af"
        strokeWidth={1}
        markerEnd="url(#arrowhead)"
        opacity={0.6}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        style={{ minWidth: "100%", display: "block" }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth={6}
            markerHeight={6}
            refX={5}
            refY={3}
            orient="auto"
          >
            <polygon points="0 0, 6 3, 0 6" fill="#9ca3af" />
          </marker>
        </defs>
        {/* Header */}
        <rect width={width} height={HEADER_HEIGHT} fill="#f3f4f6" />
        <text
          x={4}
          y={HEADER_HEIGHT - 8}
          fontSize={11}
          fill="#374151"
          fontWeight="bold"
        >
          Task
        </text>
        <text
          x={LEFT_PADDING + 4}
          y={HEADER_HEIGHT - 8}
          fontSize={11}
          fill="#6b7280"
        >
          {projectStart.toISOString().slice(0, 10)} —{" "}
          {projectEnd.toISOString().slice(0, 10)} ({totalDays} days)
        </text>

        {/* Row alternating bands */}
        {tasks.map((_, i) =>
          i % 2 === 0 ? null : (
            <rect
              key={`band-${i}`}
              x={LEFT_PADDING}
              y={HEADER_HEIGHT + i * ROW_HEIGHT}
              width={width - LEFT_PADDING}
              height={ROW_HEIGHT}
              fill="#fafafa"
            />
          ),
        )}

        {/* Today line */}
        {todayOffset >= 0 && todayOffset < totalDays && (
          <line
            x1={LEFT_PADDING + todayOffset * DAY_WIDTH}
            y1={HEADER_HEIGHT - 4}
            x2={LEFT_PADDING + todayOffset * DAY_WIDTH}
            y2={height}
            stroke="#dc2626"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}

        {/* Dependency arrows behind bars */}
        {dependencies.map((d, i) => dependencyArrow(d, `dep-${i}`))}

        {/* Task bars */}
        {tasks.map((t, i) => taskBar(t, i))}
      </svg>

      <p className="text-[11px] text-ink-tertiary mt-2">
        Bars: <span className="text-stone-700">grey = planned</span>,{" "}
        <span className="text-blue-700">blue = in progress</span>,{" "}
        <span className="text-emerald-700">green = completed</span>,{" "}
        <span className="text-red-700">red = critical path</span>. Vertical
        dashed line marks today.
      </p>
    </div>
  );
}

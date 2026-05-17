/**
 * Stage 10.B — DrawingViewer primitive.
 *
 * Raster drawing display with overlay measurement strokes. Three
 * modes: length (line), area (polygon), count (point). Scale
 * calibration: user picks two points + types real-world distance,
 * which sets pixels-per-meter for all subsequent strokes.
 *
 * Strokes are stored as plain JSON so the parent can persist + sync
 * with the BoQ. The primitive does not own DB state.
 *
 * SCOPE: 10.B ships raster (PNG/JPG) overlay only. PDF support comes
 * later — typical workflow: operator exports PDF page to PNG, then
 * uploads. Reference apps (Bluebeam, CostX) handle PDF natively; that
 * is a Stage 10.E follow-up if interview synthesis demands it.
 *
 * Used by: 10.E QS Drawing-Aware Measurement.
 *
 * Reference patterns: Bluebeam Revu measurement tools, CostX takeoff
 * (research-summary.md theme + reference-apps/qs.md).
 *
 * Client component (canvas events).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Ruler, Square, Hash, RotateCcw} from "lucide-react";

export type StrokeKind = "length" | "area" | "count";

export interface DrawingPoint {
  /** Image-space coordinates (not screen pixels). */
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  kind: StrokeKind;
  /** length: 2 points (line). area: ≥3 points (polygon). count: 1 point. */
  points: DrawingPoint[];
  /** Optional caption ("Wall — bedroom 1"). */
  label?: string;
  /** Color override; defaults vary by kind. */
  color?: string;
}

export interface ScaleCalibration {
  /** Two points used to define the calibration line. */
  pixels: number;
  /** Real-world distance in meters that the line represents. */
  meters: number;
}

export interface DrawingViewerProps {
  imageUrl: string;
  imageAlt?: string;
  strokes: DrawingStroke[];
  onStrokeAdd?: (stroke: DrawingStroke) => void;
  onStrokeRemove?: (id: string) => void;
  scale?: ScaleCalibration | null;
  onScaleSet?: (s: ScaleCalibration) => void;
  /** When set, the toolbar is hidden + clicks do nothing. */
  readOnly?: boolean;
  className?: string;
}

const KIND_COLOR: Record<StrokeKind, string> = {
  length: "#a06a1a",
  area: "#0e3b2e",
  count: "#a43e2f",
};

export function DrawingViewer({
  imageUrl,
  imageAlt = "Drawing",
  strokes,
  onStrokeAdd,
  onStrokeRemove,
  scale = null,
  onScaleSet,
  readOnly = false,
  className,
}: DrawingViewerProps) {
  const [tool, setTool] = React.useState<StrokeKind | "calibrate">("length");
  const [draft, setDraft] = React.useState<DrawingPoint[]>([]);
  const [imgSize, setImgSize] = React.useState<{ w: number; h: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  function imgCoords(e: React.MouseEvent<HTMLDivElement>): DrawingPoint | null {
    if (!imgSize || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * imgSize.w;
    const y = ((e.clientY - rect.top) / rect.height) * imgSize.h;
    return { x, y };
  }

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    const pt = imgCoords(e);
    if (!pt) return;

    if (tool === "calibrate") {
      const next = [...draft, pt];
      if (next.length === 2) {
        const [a, b] = next;
        if (a && b) {
          const px = Math.hypot(b.x - a.x, b.y - a.y);
          const meters = Number(
            window.prompt("Real-world distance for this line (meters):", "1") ??
              "0",
          );
          if (Number.isFinite(meters) && meters > 0) {
            onScaleSet?.({ pixels: px, meters });
          }
        }
        setDraft([]);
        setTool("length");
      } else {
        setDraft(next);
      }
      return;
    }

    if (tool === "count") {
      onStrokeAdd?.({ id: crypto.randomUUID(), kind: "count", points: [pt] });
      return;
    }

    if (tool === "length") {
      const next = [...draft, pt];
      if (next.length === 2) {
        onStrokeAdd?.({ id: crypto.randomUUID(), kind: "length", points: next });
        setDraft([]);
      } else {
        setDraft(next);
      }
      return;
    }

    if (tool === "area") {
      // Double-click closes the polygon. Single click adds a vertex.
      setDraft((d) => [...d, pt]);
    }
  }

  function onDoubleClick() {
    if (readOnly) return;
    if (tool === "area" && draft.length >= 3) {
      onStrokeAdd?.({ id: crypto.randomUUID(), kind: "area", points: draft });
      setDraft([]);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!readOnly && (
        <div className="flex items-center gap-1 flex-wrap">
          <ToolBtn
            active={tool === "length"}
            onClick={() => {
              setTool("length");
              setDraft([]);
            }}
            icon={Ruler}
            label="Length"
          />
          <ToolBtn
            active={tool === "area"}
            onClick={() => {
              setTool("area");
              setDraft([]);
            }}
            icon={Square}
            label="Area"
          />
          <ToolBtn
            active={tool === "count"}
            onClick={() => {
              setTool("count");
              setDraft([]);
            }}
            icon={Hash}
            label="Count"
          />
          <span className="mx-2 h-5 w-px bg-line-soft" />
          <ToolBtn
            active={tool === "calibrate"}
            onClick={() => {
              setTool("calibrate");
              setDraft([]);
            }}
            icon={RotateCcw}
            label={scale ? `Scale: ${scale.pixels.toFixed(0)}px=${scale.meters}m` : "Set scale"}
          />
        </div>
      )}
      <div
        ref={containerRef}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={cn(
          "relative inline-block bg-muted rounded-md overflow-hidden border border-line-soft select-none",
          !readOnly && "cursor-crosshair",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={imageAlt}
          onLoad={(e) => {
            const t = e.currentTarget;
            setImgSize({ w: t.naturalWidth, h: t.naturalHeight });
          }}
          draggable={false}
          className="block max-w-full h-auto"
        />
        {imgSize && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
            preserveAspectRatio="none"
          >
            {strokes.map((s) => (
              <StrokeRender
                key={s.id}
                stroke={s}
                scale={scale}
                onRemove={onStrokeRemove}
              />
            ))}
            {draft.length > 0 && (
              <DraftRender points={draft} kind={tool === "calibrate" ? "length" : tool} />
            )}
          </svg>
        )}
      </div>
      <DrawingFooter strokes={strokes} scale={scale} />
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium border",
        active
          ? "bg-accent text-accent-contrast border-accent"
          : "bg-surface text-ink border-line-soft hover:bg-muted",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function StrokeRender({
  stroke,
  scale,
  onRemove,
}: {
  stroke: DrawingStroke;
  scale: ScaleCalibration | null;
  onRemove?: (id: string) => void;
}) {
  const color = stroke.color ?? KIND_COLOR[stroke.kind];

  if (stroke.kind === "count") {
    const p = stroke.points[0];
    if (!p) return null;
    return (
      <g>
        <circle cx={p.x} cy={p.y} r={8} fill={color} fillOpacity={0.8} />
        {onRemove && (
          <RemoveBtn x={p.x + 12} y={p.y - 12} onRemove={() => onRemove(stroke.id)} />
        )}
      </g>
    );
  }

  if (stroke.kind === "length") {
    const [a, b] = stroke.points;
    if (!a || !b) return null;
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    const labelTxt = formatMeasurement(px, scale, "length");
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    return (
      <g>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={3}
        />
        <text
          x={mx}
          y={my - 6}
          fill={color}
          fontSize="14"
          fontWeight="600"
          textAnchor="middle"
        >
          {labelTxt}
        </text>
        {onRemove && (
          <RemoveBtn x={mx} y={my + 14} onRemove={() => onRemove(stroke.id)} />
        )}
      </g>
    );
  }

  // area
  if (stroke.kind === "area") {
    const pts = stroke.points;
    if (pts.length < 3) return null;
    const path = pts.map((p) => `${p.x},${p.y}`).join(" ");
    const areaPx = polygonArea(pts);
    const labelTxt = formatMeasurement(areaPx, scale, "area");
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return (
      <g>
        <polygon
          points={path}
          fill={color}
          fillOpacity={0.2}
          stroke={color}
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy}
          fill={color}
          fontSize="14"
          fontWeight="600"
          textAnchor="middle"
        >
          {labelTxt}
        </text>
        {onRemove && (
          <RemoveBtn x={cx} y={cy + 18} onRemove={() => onRemove(stroke.id)} />
        )}
      </g>
    );
  }

  return null;
}

function RemoveBtn({
  x,
  y,
  onRemove,
}: {
  x: number;
  y: number;
  onRemove: () => void;
}) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ pointerEvents: "all", cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    >
      <circle r={9} fill="#a43e2f" />
      <text
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#fff"
        y={5}
      >
        ×
      </text>
    </g>
  );
}

function DraftRender({
  points,
  kind,
}: {
  points: DrawingPoint[];
  kind: StrokeKind;
}) {
  const color = KIND_COLOR[kind];
  if (kind === "count") {
    const p = points[0];
    if (!p) return null;
    return (
      <circle cx={p.x} cy={p.y} r={6} fill={color} fillOpacity={0.5} />
    );
  }
  if (points.length === 0) return null;
  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  return (
    <g>
      <path d={path} stroke={color} strokeWidth={2} fill="none" strokeDasharray="6 4" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={color} />
      ))}
    </g>
  );
}

function DrawingFooter({
  strokes,
  scale,
}: {
  strokes: DrawingStroke[];
  scale: ScaleCalibration | null;
}) {
  const counts = {
    length: strokes.filter((s) => s.kind === "length").length,
    area: strokes.filter((s) => s.kind === "area").length,
    count: strokes.filter((s) => s.kind === "count").length,
  };
  const totalLengthPx = strokes
    .filter((s) => s.kind === "length")
    .reduce((sum, s) => {
      const [a, b] = s.points;
      return a && b ? sum + Math.hypot(b.x - a.x, b.y - a.y) : sum;
    }, 0);
  const totalAreaPx = strokes
    .filter((s) => s.kind === "area")
    .reduce((sum, s) => sum + polygonArea(s.points), 0);

  return (
    <div className="text-xs text-ink-tertiary tabular-nums flex gap-4">
      <span>{counts.length} length · {formatMeasurement(totalLengthPx, scale, "length")}</span>
      <span>{counts.area} area · {formatMeasurement(totalAreaPx, scale, "area")}</span>
      <span>{counts.count} count</span>
      {!scale && (
        <span className="text-warning">
          ⚠ scale not set — measurements shown in pixels
        </span>
      )}
    </div>
  );
}

function polygonArea(pts: DrawingPoint[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a && b) sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function formatMeasurement(
  pxValue: number,
  scale: ScaleCalibration | null,
  kind: "length" | "area",
): string {
  if (!scale) {
    return kind === "length"
      ? `${pxValue.toFixed(0)} px`
      : `${pxValue.toFixed(0)} px²`;
  }
  const ppm = scale.pixels / scale.meters;
  if (kind === "length") {
    const m = pxValue / ppm;
    return `${m.toFixed(2)} m`;
  }
  const m2 = pxValue / (ppm * ppm);
  return `${m2.toFixed(2)} m²`;
}

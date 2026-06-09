"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  upsertVillaRateOverrideAction,
  deleteVillaRateOverrideAction,
} from "@/features/dynamic-pricing/actions";

export interface RateCurveCell {
  date: string;
  available: boolean;
  /** Effective nightly rate (major units) after rules + any override. */
  finalRate: number;
  /** Manual override (major units) if pinned, else null. */
  override: number | null;
}

export interface RateCurveProps {
  villaId: string;
  currency: string;
  baseRate: number;
  cells: RateCurveCell[];
}

const W = 920,
  H = 280,
  padL = 50,
  padR = 14,
  padT = 18,
  padB = 32;

function fmtMoney(v: number, currency: string): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${currency} ${(v / 1000).toFixed(0)}k`;
  return `${currency} ${Math.round(v)}`;
}

function dLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function RateCurve({ villaId, currency, baseRate, cells }: RateCurveProps) {
  const router = useRouter();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [drag, setDrag] = React.useState<{ i: number; date: string } | null>(null);
  const [dragValue, setDragValue] = React.useState<number | null>(null);
  const movedRef = React.useRef(false);
  const [pending, start] = React.useTransition();

  const n = cells.length;
  const prices = cells.map((c) => c.finalRate);
  const vals = [...prices.filter((p) => p > 0), ...(baseRate > 0 ? [baseRate] : [])];
  const maxP = vals.length ? Math.max(...vals) * 1.12 : 100;
  const minP = vals.length ? Math.min(...vals) * 0.88 : 0;
  const span = Math.max(1, maxP - minP);

  const xAt = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const yAt = (p: number) => padT + (1 - (p - minP) / span) * (H - padT - padB);
  const valueAtClientY = (clientY: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return minP;
    const yView = ((clientY - rect.top) / rect.height) * H;
    const raw = minP + (1 - (yView - padT) / (H - padT - padB)) * span;
    return Math.max(minP, Math.min(maxP, raw));
  };

  // Effective price per night (live-updates the dragged point).
  const effective = (i: number) =>
    drag && drag.i === i && dragValue !== null ? dragValue : prices[i] || baseRate;

  const activePath = cells
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)},${yAt(effective(i)).toFixed(1)}`)
    .join(" ");
  const areaPath =
    n > 0
      ? `${activePath} L ${xAt(n - 1).toFixed(1)},${(H - padB).toFixed(1)} L ${xAt(0).toFixed(1)},${(H - padB).toFixed(1)} Z`
      : "";
  const baseY = yAt(baseRate);
  const yTicks = [0, 1, 2, 3].map((k) => minP + (span * k) / 3);
  const xTickIdx = n > 0 ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1] : [];

  function onPointerDownPoint(e: React.PointerEvent, i: number, date: string) {
    if (pending) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    movedRef.current = false;
    setDrag({ i, date });
    setDragValue(prices[i] || baseRate);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    movedRef.current = true;
    setDragValue(Math.round(valueAtClientY(e.clientY)));
  }
  function commit() {
    const d = drag;
    const value = dragValue;
    setDrag(null);
    setDragValue(null);
    // A plain click (no drag) or a drag back to the same rate must NOT write an
    // override — only a real change persists.
    if (!d || value === null || !movedRef.current) return;
    const originalMinor = Math.round((prices[d.i] || baseRate) * 100);
    const minor = Math.round(value * 100);
    if (minor <= 0 || minor === originalMinor) return;
    start(async () => {
      await upsertVillaRateOverrideAction(villaId, d.date, minor);
      router.refresh();
    });
  }
  function clearOverride(date: string) {
    if (pending) return;
    start(async () => {
      await deleteVillaRateOverrideAction(villaId, date);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto py-2">
      <div className="flex items-center justify-end px-1 pb-1.5 h-4 font-mono text-[10.5px] text-ink-4">
        {pending && <span className="text-terra">saving…</span>}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[680px] h-[280px] touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={commit}
        onPointerCancel={commit}
      >
        {yTicks.map((p, k) => (
          <g key={k}>
            <line x1={padL} y1={yAt(p)} x2={W - padR} y2={yAt(p)} stroke="var(--line-soft)" strokeWidth="1" />
            <text x={padL - 8} y={yAt(p) + 3} textAnchor="end" fontFamily="var(--mono-font)" fontSize="10" fill="var(--ink-4)">
              {fmtMoney(p, currency)}
            </text>
          </g>
        ))}
        {xTickIdx.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            fontFamily="var(--mono-font)"
            fontSize="9"
            fill="var(--ink-4)"
          >
            {dLabel(cells[i].date)}
          </text>
        ))}
        {areaPath && <path d={areaPath} fill="var(--terra)" fillOpacity="0.06" />}
        {baseRate > 0 && (
          <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 4" />
        )}
        <path d={activePath} fill="none" stroke="var(--terra)" strokeWidth="2.5" strokeLinejoin="round" />

        {/* stop-sell markers (top), non-draggable */}
        {cells.map((c, i) =>
          !c.available ? <circle key={`ss-${i}`} cx={xAt(i)} cy={padT + 4} r="3" fill="var(--danger)" /> : null,
        )}

        {/* draggable points + override pins */}
        {cells.map((c, i) => {
          if (!c.available) return null;
          const cx = xAt(i);
          const cy = yAt(effective(i));
          const isOverride = c.override !== null;
          const isDragging = drag?.i === i;
          return (
            <g key={`pt-${i}`}>
              {/* fat invisible hit target for easy grabbing */}
              <circle
                cx={cx}
                cy={cy}
                r="10"
                fill="transparent"
                className={pending ? "cursor-wait" : "cursor-ns-resize"}
                onPointerDown={(e) => onPointerDownPoint(e, i, c.date)}
              />
              <circle
                cx={cx}
                cy={cy}
                r={isOverride || isDragging ? 4.5 : 3}
                fill={isOverride ? "var(--terra)" : "var(--paper)"}
                stroke="var(--terra)"
                strokeWidth="1.75"
                pointerEvents="none"
              />
              {isDragging && dragValue !== null && (
                <text x={cx} y={cy - 10} textAnchor="middle" fontFamily="var(--mono-font)" fontSize="10" fill="var(--terra)" pointerEvents="none">
                  {fmtMoney(dragValue, currency)}
                </text>
              )}
              {isOverride && !isDragging && (
                <text
                  x={cx}
                  y={cy - 9}
                  textAnchor="middle"
                  fontFamily="var(--mono-font)"
                  fontSize="11"
                  fill="var(--ink-3)"
                  className="cursor-pointer"
                  onClick={() => clearOverride(c.date)}
                >
                  ✕
                </text>
              )}
            </g>
          );
        })}

        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--terra)" strokeWidth="1" />
        <text x={padL + 4} y={H - padB - 6} fontFamily="var(--mono-font)" fontSize="9" fill="var(--terra)">
          today
        </text>
      </svg>
    </div>
  );
}

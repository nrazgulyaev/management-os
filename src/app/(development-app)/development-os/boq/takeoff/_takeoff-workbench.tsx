"use client";

/**
 * Estimator takeoff workbench (Functional-Depth Audit §7, the сметчик
 * headline ask). Mounts the existing-but-orphaned DrawingViewer takeoff
 * primitive (Bluebeam/CostX pattern: scale-calibrate a plan, then draw
 * area polygons / length polylines / counts) and turns measured quantities
 * into costed BOQ lines: quantity × unit rate = line cost.
 *
 * v1 is the calculator: load a plan image, calibrate scale, measure, price.
 * Persisting a takeoff line into boq_items (tagged source=drawing) + an
 * org rate library are the next slices — this delivers the draw→measure→
 * cost loop the role centers on, which was entirely absent.
 */

import * as React from "react";
import {
  DrawingViewer,
  type DrawingStroke,
  type DrawingPoint,
  type ScaleCalibration,
} from "@/components/ui/primitives";

/** Shoelace polygon area in pixels². */
function polygonAreaPx(pts: DrawingPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

/** Polyline length in pixels. */
function polylineLengthPx(pts: DrawingPoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}

/** Convert a stroke to a real-world quantity using the scale, or null. */
function quantityFor(stroke: DrawingStroke, scale: ScaleCalibration | null): number | null {
  if (stroke.kind === "count") return stroke.points.length;
  if (!scale || scale.pixels <= 0) return null;
  const mpp = scale.meters / scale.pixels; // meters per pixel
  if (stroke.kind === "area") return polygonAreaPx(stroke.points) * mpp * mpp;
  if (stroke.kind === "length") return polylineLengthPx(stroke.points) * mpp;
  return null;
}

const UNIT: Record<DrawingStroke["kind"], string> = {
  area: "m²",
  length: "m",
  count: "ea",
};

interface RateEntry {
  label: string;
  rate: number; // unit rate in major currency units (estimator-entered)
}

export function TakeoffWorkbench() {
  const [imageUrl, setImageUrl] = React.useState<string>("");
  const [strokes, setStrokes] = React.useState<DrawingStroke[]>([]);
  const [scale, setScale] = React.useState<ScaleCalibration | null>(null);
  const [rates, setRates] = React.useState<Record<string, RateEntry>>({});
  const [currency, setCurrency] = React.useState("IDR");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
    setStrokes([]);
    setScale(null);
    setRates({});
  }

  function setRate(id: string, patch: Partial<RateEntry>) {
    setRates((r) => ({
      ...r,
      [id]: { label: r[id]?.label ?? "", rate: r[id]?.rate ?? 0, ...patch },
    }));
  }

  const rows = strokes.map((s) => {
    const qty = quantityFor(s, scale);
    const entry = rates[s.id];
    const rate = entry?.rate ?? 0;
    const cost = qty != null ? qty * rate : null;
    return { stroke: s, qty, rate, cost, label: entry?.label ?? "" };
  });
  const total = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0);

  const money = (n: number) =>
    `${currency} ${Math.round(n).toLocaleString("en-US")}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3">
        <label className="text-sm font-medium text-ink">
          Plan image
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            className="ml-2 text-xs"
          />
        </label>
        <span className="text-xs text-ink-tertiary">or paste a URL:</span>
        <input
          type="url"
          value={imageUrl.startsWith("blob:") ? "" : imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…/floor-plan.png"
          className="flex-1 min-w-[180px] text-xs px-2 py-1 rounded border border-line-soft bg-surface"
        />
        <label className="text-xs text-ink-secondary">
          Currency
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 4))}
            className="ml-1 w-16 text-xs px-2 py-1 rounded border border-line-soft bg-surface font-mono"
          />
        </label>
      </div>

      {!imageUrl ? (
        <div className="rounded-lg border border-dashed border-line-soft bg-muted/20 px-6 py-12 text-center text-sm text-ink-tertiary">
          Load a floor-plan or elevation image to start measuring. Calibrate the
          scale first (pick two points a known distance apart), then draw area /
          length / count takeoffs.
        </div>
      ) : (
        <DrawingViewer
          imageUrl={imageUrl}
          strokes={strokes}
          scale={scale}
          onScaleSet={setScale}
          onStrokeAdd={(s) => setStrokes((prev) => [...prev, s])}
          onStrokeRemove={(id) =>
            setStrokes((prev) => prev.filter((s) => s.id !== id))
          }
        />
      )}

      {/* Takeoff → cost table */}
      {strokes.length > 0 && (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between">
            <span className="text-sm font-medium text-ink">
              Takeoff — {strokes.length} measurement{strokes.length === 1 ? "" : "s"}
            </span>
            {!scale && (
              <span className="text-[11px] text-warning">
                Calibrate the scale to compute areas & lengths.
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2 font-normal">Item</th>
                <th className="px-2 py-2 font-normal">Type</th>
                <th className="px-2 py-2 font-normal text-right">Quantity</th>
                <th className="px-2 py-2 font-normal text-right">Unit rate</th>
                <th className="px-4 py-2 font-normal text-right">Line cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stroke.id} className="border-b border-line-soft">
                  <td className="px-4 py-2">
                    <input
                      value={r.label}
                      onChange={(e) => setRate(r.stroke.id, { label: e.target.value })}
                      placeholder="e.g. Floor screed"
                      className="w-full text-xs px-2 py-1 rounded border border-line-soft bg-surface"
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-secondary uppercase">
                    {r.stroke.kind}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-xs">
                    {r.qty != null
                      ? `${r.qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${UNIT[r.stroke.kind]}`
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={r.rate || ""}
                      onChange={(e) =>
                        setRate(r.stroke.id, { rate: Number(e.target.value) || 0 })
                      }
                      placeholder="0"
                      className="w-28 text-xs px-2 py-1 rounded border border-line-soft bg-surface font-mono text-right"
                    />
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-xs text-ink">
                    {r.cost != null ? money(r.cost) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong">
                <td colSpan={4} className="px-4 py-2.5 text-right text-sm font-medium text-ink">
                  Total takeoff
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sm font-semibold text-accent">
                  {money(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

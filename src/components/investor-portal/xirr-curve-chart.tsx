import * as React from "react";

/**
 * INVESTOR PORTAL — XIRR / IRR curve chart (presentational SVG).
 *
 * Pixel-matches the `irrCurve()` builder in the Investor Portal mock
 * (`Investor Portal.html`): a quarterly XIRR curve drawn as an amber
 * area + solid line for realised quarters, continued by a dashed
 * amber-deep projection line, with a marker at the hand-off point and
 * faint horizontal gridlines.
 *
 * This component NEVER computes IRR — it renders the points handed to
 * it. Callers derive `actual` (realised) and `projected` (forward)
 * point series from the canonical XIRR / forecast pure-fns so the curve
 * stays a single source of truth with the Dev OS Investors cabinet.
 *
 * Geometry-only inline styles (chart height + bar/line coordinates) are
 * permitted by the design contract for dynamic chart rendering; all
 * colours come from the engineering-palette tokens via `currentColor`
 * / token utility classes on wrapper elements, with SVG strokes bound
 * to the `--amber` / `--amber-deep` / `--line-soft` design tokens.
 */

export interface XirrCurvePoint {
  /** Axis label (e.g. "Q1 26"). Rendered under the baseline. */
  label: string;
  /** IRR value in percent (e.g. 18.4 for 18.4%). */
  valuePct: number;
}

export interface XirrCurveChartProps {
  /** Realised quarters — solid amber line + filled area. */
  actual: XirrCurvePoint[];
  /** Forward projection — dashed amber-deep line. Begins at the last
   *  actual point (the caller prepends it, or this component bridges). */
  projected?: XirrCurvePoint[];
  /** Render at the taller height used on the Forecasts page. */
  tall?: boolean;
  /** Axis ceiling in percent. Defaults to a padded max of the data. */
  maxPct?: number;
}

const VIEW_W = 560;

export function XirrCurveChart({
  actual,
  projected = [],
  tall = false,
  maxPct,
}: XirrCurveChartProps) {
  const h = tall ? 200 : 140;
  const all = [...actual, ...projected];
  if (all.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[13px] text-ink-tertiary">
        Not enough history to plot an XIRR curve yet.
      </div>
    );
  }

  const dataMax = Math.max(...all.map((p) => p.valuePct), 1);
  const ceil = maxPct ?? Math.ceil((dataMax * 1.35) / 2) * 2;
  // x index spans actual then projection sharing the join point.
  const n = Math.max(1, actual.length + projected.length - 1);
  const x = (i: number) => (i / n) * VIEW_W;
  const y = (v: number) => h - (v / ceil) * (h - 16) - 6;

  const actualPath = actual
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.valuePct).toFixed(1)}`)
    .join(" ");

  // Projection begins at the last actual point so the dashed line
  // continues the solid one without a gap.
  const projStartIndex = Math.max(0, actual.length - 1);
  const projPoints: XirrCurvePoint[] =
    actual.length > 0 && projected.length > 0
      ? [actual[actual.length - 1], ...projected]
      : projected;
  const projPath = projPoints
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(projStartIndex + i).toFixed(1)} ${y(p.valuePct).toFixed(1)}`,
    )
    .join(" ");

  const areaPath =
    actual.length > 0
      ? `${actualPath} L${x(actual.length - 1).toFixed(1)} ${h} L0 ${h} Z`
      : "";

  const gridLines = [0, ceil / 3, (ceil / 3) * 2, ceil];
  const lastActual = actual[actual.length - 1];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${h + 8}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: h + 8 }}
        role="img"
        aria-label="XIRR curve by quarter"
      >
        <defs>
          <linearGradient id="xirr-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--amber)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--amber)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((v) => (
          <line
            key={v}
            x1="0"
            y1={y(v)}
            x2={VIEW_W}
            y2={y(v)}
            stroke="var(--line-soft)"
          />
        ))}
        {areaPath && <path d={areaPath} fill="url(#xirr-area)" />}
        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="var(--amber)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {projPath && projPoints.length > 1 && (
          <path
            d={projPath}
            fill="none"
            stroke="var(--amber-deep)"
            strokeWidth="2.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        )}
        {lastActual && (
          <circle
            cx={x(actual.length - 1)}
            cy={y(lastActual.valuePct)}
            r="4"
            fill="var(--amber)"
            stroke="#fff"
            strokeWidth="2"
          />
        )}
      </svg>
      <figcaption className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-ink-tertiary">
        {all.map((p, i) => (
          <span key={`${p.label}-${i}`} className="tabular-nums">
            {p.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

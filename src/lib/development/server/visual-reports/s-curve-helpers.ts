/**
 * Stage 5.C — S-Curve helpers (planned vs actual cumulative progress).
 *
 * Pure helpers — no I/O.
 */

import { computeAxisRange, escapeSvg, scaleXValue } from "./chart-data-helpers";

export interface SCurvePoint {
  date: Date;
  /** Cumulative progress 0–100. */
  pctComplete: number;
}

export function buildSCurvePoints(
  raw: Array<{ date: Date; deltaPct: number }>,
): SCurvePoint[] {
  let cum = 0;
  const sorted = [...raw].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  return sorted.map((r) => {
    cum = Math.min(100, Math.max(0, cum + r.deltaPct));
    return { date: r.date, pctComplete: cum };
  });
}

/**
 * Linearly interpolate planned progress between two anchor points
 * (project start at 0% and project end at 100%). Returns equally-spaced
 * sample points across the range.
 */
export function interpolatePlannedSCurve(
  start: Date,
  end: Date,
  samples = 30,
): SCurvePoint[] {
  if (samples < 2) return [{ date: start, pctComplete: 0 }];
  const span = end.getTime() - start.getTime();
  const out: SCurvePoint[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    out.push({
      date: new Date(start.getTime() + t * span),
      pctComplete: t * 100,
    });
  }
  return out;
}

export interface SCurveSvgOptions {
  width?: number;
  height?: number;
  plannedColor?: string;
  actualColor?: string;
}

export function renderSCurveSvg(
  planned: SCurvePoint[],
  actual: SCurvePoint[],
  opts: SCurveSvgOptions = {},
): string {
  const width = opts.width ?? 800;
  const height = opts.height ?? 360;
  const padL = 50;
  const padR = 20;
  const padT = 30;
  const padB = 40;
  const plannedColor = opts.plannedColor ?? "#94a3b8";
  const actualColor = opts.actualColor ?? "#2563eb";

  const all = [...planned, ...actual];
  if (all.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }

  const xMin = Math.min(...all.map((p) => p.date.getTime()));
  const xMax = Math.max(...all.map((p) => p.date.getTime()));
  const yRange = computeAxisRange([0, 100], 5);
  const usableH = height - padT - padB;
  const yScale = (v: number) =>
    padT + (1 - (v - yRange.min) / (yRange.max - yRange.min || 1)) * usableH;
  const xScale = (t: number) =>
    scaleXValue(t, xMin, xMax, width, padL, padR);

  const toPath = (pts: SCurvePoint[]) => {
    if (pts.length === 0) return "";
    return pts
      .map((p, i) => {
        const x = xScale(p.date.getTime());
        const y = yScale(p.pctComplete);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="S-curve progress">`,
  );
  for (const t of yRange.ticks) {
    const y = yScale(t);
    parts.push(
      `<line x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${t.toFixed(0)}%</text>`,
    );
  }
  parts.push(
    `<path d="${toPath(planned)}" fill="none" stroke="${plannedColor}" stroke-width="2" stroke-dasharray="6 4" />`,
  );
  parts.push(
    `<path d="${toPath(actual)}" fill="none" stroke="${actualColor}" stroke-width="2.5" />`,
  );
  parts.push(
    `<text x="${width - padR}" y="${padT - 8}" text-anchor="end" font-size="11" fill="${actualColor}">Actual</text>`,
  );
  parts.push(
    `<text x="${width - padR - 60}" y="${padT - 8}" text-anchor="end" font-size="11" fill="${plannedColor}">Planned</text>`,
  );
  parts.push("</svg>");
  return parts.join("");
}

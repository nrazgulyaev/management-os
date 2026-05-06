/**
 * Stage 5.C — Cost heatmap helpers.
 *
 * Pure helpers — no I/O.
 *
 * Grid: rows × cols (e.g., assets × cost categories). Color intensity
 * driven by overage from per-cell budget.
 */

import { escapeSvg, formatAxisLabel } from "./chart-data-helpers";

export interface HeatmapCell {
  rowKey: string;
  colKey: string;
  /** Budget for this cell (minor). */
  budgetMinor: number;
  /** Actual spend for this cell (minor). */
  actualMinor: number;
}

export interface HeatmapCellComputed extends HeatmapCell {
  /** % overage. >0 = over, <0 = under. */
  overagePct: number;
  /** Color picked from overage. */
  fill: string;
}

export function computeOveragePct(cell: HeatmapCell): number {
  if (cell.budgetMinor <= 0) return cell.actualMinor > 0 ? 100 : 0;
  return ((cell.actualMinor - cell.budgetMinor) / cell.budgetMinor) * 100;
}

/** Map overage% to a 5-step diverging palette (under=blue, over=red). */
export function colorForOverage(pct: number): string {
  if (pct <= -25) return "#1d4ed8";   // strong under
  if (pct <= -10) return "#60a5fa";   // mild under
  if (pct < 10) return "#f1f5f9";     // on budget
  if (pct < 25) return "#fbbf24";     // mild over
  if (pct < 50) return "#f97316";     // moderate over
  return "#dc2626";                    // critical over
}

export function computeHeatmapCells(
  cells: HeatmapCell[],
): HeatmapCellComputed[] {
  return cells.map((c) => {
    const overagePct = computeOveragePct(c);
    return { ...c, overagePct, fill: colorForOverage(overagePct) };
  });
}

export interface HeatmapSvgOptions {
  width?: number;
  height?: number;
  cellSize?: number;
}

export function renderHeatmapSvg(
  cells: HeatmapCell[],
  opts: HeatmapSvgOptions = {},
): string {
  const cellSize = opts.cellSize ?? 36;
  const padL = 120;
  const padT = 100;
  const padR = 20;
  const padB = 20;

  const computed = computeHeatmapCells(cells);
  if (computed.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200"><text x="200" y="100" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }
  const rows = Array.from(new Set(computed.map((c) => c.rowKey)));
  const cols = Array.from(new Set(computed.map((c) => c.colKey)));
  const width = opts.width ?? padL + cols.length * cellSize + padR;
  const height = opts.height ?? padT + rows.length * cellSize + padB;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Cost heatmap">`,
  );

  // Column labels (rotated).
  cols.forEach((c, i) => {
    const x = padL + i * cellSize + cellSize / 2;
    parts.push(
      `<text x="${x}" y="${padT - 8}" text-anchor="start" font-size="10" fill="#475569" transform="rotate(-45 ${x} ${padT - 8})">${escapeSvg(c)}</text>`,
    );
  });

  // Row labels.
  rows.forEach((r, i) => {
    const y = padT + i * cellSize + cellSize / 2 + 4;
    parts.push(
      `<text x="${padL - 6}" y="${y}" text-anchor="end" font-size="11" fill="#475569">${escapeSvg(r)}</text>`,
    );
  });

  // Cells.
  for (const c of computed) {
    const ri = rows.indexOf(c.rowKey);
    const ci = cols.indexOf(c.colKey);
    const x = padL + ci * cellSize;
    const y = padT + ri * cellSize;
    parts.push(
      `<rect x="${x}" y="${y}" width="${cellSize - 2}" height="${cellSize - 2}" fill="${c.fill}" stroke="#fff" />`,
    );
    if (Math.abs(c.overagePct) >= 10) {
      parts.push(
        `<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 3}" text-anchor="middle" font-size="9" fill="#0f172a">${c.overagePct.toFixed(0)}%</text>`,
      );
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

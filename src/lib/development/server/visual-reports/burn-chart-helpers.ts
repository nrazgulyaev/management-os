/**
 * Stage 5.C — Budget burn chart helpers.
 *
 * Pure helpers — no I/O.
 *
 * Renders cumulative committed (orange) + cumulative actual (red) bars
 * against a horizontal total-budget reference line.
 */

import {
  computeAxisRange,
  escapeSvg,
  formatAxisLabel,
} from "./chart-data-helpers";

export interface BurnPeriodPoint {
  label: string;
  cumulativeCommittedMinor: number;
  cumulativeActualMinor: number;
}

export function buildBurnPoints(
  raw: Array<{
    label: string;
    committedDeltaMinor: number;
    actualDeltaMinor: number;
  }>,
): BurnPeriodPoint[] {
  let committed = 0;
  let actual = 0;
  return raw.map((r) => {
    committed += r.committedDeltaMinor;
    actual += r.actualDeltaMinor;
    return {
      label: r.label,
      cumulativeCommittedMinor: committed,
      cumulativeActualMinor: actual,
    };
  });
}

export interface BurnChartSvgOptions {
  width?: number;
  height?: number;
  budgetMinor: number;
  committedColor?: string;
  actualColor?: string;
  budgetLineColor?: string;
}

export function renderBurnChartSvg(
  points: BurnPeriodPoint[],
  opts: BurnChartSvgOptions,
): string {
  const width = opts.width ?? 800;
  const height = opts.height ?? 360;
  const padL = 60;
  const padR = 20;
  const padT = 30;
  const padB = 50;
  const committedColor = opts.committedColor ?? "#f59e0b";
  const actualColor = opts.actualColor ?? "#dc2626";
  const budgetColor = opts.budgetLineColor ?? "#0ea5e9";

  if (points.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }

  const allValues = points
    .flatMap((p) => [p.cumulativeCommittedMinor, p.cumulativeActualMinor])
    .concat([opts.budgetMinor]);
  const yRange = computeAxisRange(allValues, 5);
  const usableH = height - padT - padB;
  const yScale = (v: number) =>
    padT + (1 - (v - yRange.min) / (yRange.max - yRange.min || 1)) * usableH;
  const usableW = width - padL - padR;
  const groupW = usableW / points.length;
  const barW = (groupW * 0.7) / 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Budget burn chart">`,
  );
  for (const t of yRange.ticks) {
    const y = yScale(t);
    parts.push(
      `<line x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${formatAxisLabel(t)}</text>`,
    );
  }
  // Budget reference line.
  const yBudget = yScale(opts.budgetMinor);
  parts.push(
    `<line x1="${padL}" x2="${width - padR}" y1="${yBudget}" y2="${yBudget}" stroke="${budgetColor}" stroke-width="2" stroke-dasharray="6 4" />`,
  );
  parts.push(
    `<text x="${width - padR}" y="${yBudget - 4}" text-anchor="end" font-size="11" fill="${budgetColor}">Budget ${formatAxisLabel(opts.budgetMinor)}</text>`,
  );

  points.forEach((p, i) => {
    const xCenter = padL + groupW * (i + 0.5);
    const xCommit = xCenter - barW - 1;
    const xActual = xCenter + 1;
    const yCommitTop = yScale(p.cumulativeCommittedMinor);
    const yActualTop = yScale(p.cumulativeActualMinor);
    const yZero = yScale(0);
    parts.push(
      `<rect x="${xCommit}" y="${yCommitTop}" width="${barW}" height="${Math.max(1, yZero - yCommitTop)}" fill="${committedColor}" rx="1" />`,
    );
    parts.push(
      `<rect x="${xActual}" y="${yActualTop}" width="${barW}" height="${Math.max(1, yZero - yActualTop)}" fill="${actualColor}" rx="1" />`,
    );
    parts.push(
      `<text x="${xCenter}" y="${height - padB + 14}" text-anchor="middle" font-size="11" fill="#475569">${escapeSvg(p.label)}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

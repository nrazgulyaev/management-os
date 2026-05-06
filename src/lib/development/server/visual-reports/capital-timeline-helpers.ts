/**
 * Stage 5.C — Investor capital timeline helpers.
 *
 * Pure helpers — no I/O.
 *
 * Stacked monthly bars: contributions (green) / drawdowns (orange) /
 * distributions (purple), one bar per month.
 */

import {
  computeAxisRange,
  escapeSvg,
  formatAxisLabel,
} from "./chart-data-helpers";

export interface CapitalMonthRow {
  monthLabel: string;
  contributionsMinor: number;
  drawdownsMinor: number;
  distributionsMinor: number;
}

export function totalsByMonth(rows: CapitalMonthRow[]): {
  totalContributions: number;
  totalDrawdowns: number;
  totalDistributions: number;
} {
  return rows.reduce(
    (acc, r) => ({
      totalContributions: acc.totalContributions + r.contributionsMinor,
      totalDrawdowns: acc.totalDrawdowns + r.drawdownsMinor,
      totalDistributions: acc.totalDistributions + r.distributionsMinor,
    }),
    { totalContributions: 0, totalDrawdowns: 0, totalDistributions: 0 },
  );
}

export function renderCapitalTimelineSvg(
  rows: CapitalMonthRow[],
  opts: { width?: number; height?: number } = {},
): string {
  const width = opts.width ?? 800;
  const height = opts.height ?? 360;
  const padL = 60;
  const padR = 20;
  const padT = 30;
  const padB = 50;

  if (rows.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }
  const allValues = rows.flatMap((r) => [
    r.contributionsMinor + r.drawdownsMinor + r.distributionsMinor,
    0,
  ]);
  const yRange = computeAxisRange(allValues, 5);
  const usableH = height - padT - padB;
  const yScale = (v: number) =>
    padT + (1 - (v - yRange.min) / (yRange.max - yRange.min || 1)) * usableH;
  const usableW = width - padL - padR;
  const groupW = usableW / rows.length;
  const barW = groupW * 0.7;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Investor capital timeline">`,
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
  rows.forEach((r, i) => {
    const x0 = padL + groupW * (i + 0.15);
    const yZero = yScale(0);
    let runTop = yZero;
    const segs = [
      { v: r.contributionsMinor, color: "#16a34a" },
      { v: r.drawdownsMinor, color: "#f59e0b" },
      { v: r.distributionsMinor, color: "#7c3aed" },
    ];
    for (const seg of segs) {
      if (seg.v <= 0) continue;
      const top = yScale(yRange.min + (runTop - padT) / usableH * (yRange.max - yRange.min) - 0); // not used
      // Compute height in minor → pixel space.
      const h =
        ((seg.v) / (yRange.max - yRange.min || 1)) * usableH;
      runTop -= h;
      parts.push(
        `<rect x="${x0}" y="${runTop}" width="${barW}" height="${Math.max(1, h)}" fill="${seg.color}" />`,
      );
    }
    parts.push(
      `<text x="${x0 + barW / 2}" y="${height - padB + 14}" text-anchor="middle" font-size="11" fill="#475569">${escapeSvg(r.monthLabel)}</text>`,
    );
  });
  // Legend
  const legend = [
    { color: "#16a34a", label: "Contributions" },
    { color: "#f59e0b", label: "Drawdowns" },
    { color: "#7c3aed", label: "Distributions" },
  ];
  legend.forEach((l, i) => {
    const x = padL + i * 110;
    parts.push(
      `<rect x="${x}" y="6" width="10" height="10" fill="${l.color}" />`,
    );
    parts.push(
      `<text x="${x + 14}" y="15" font-size="10" fill="#475569">${escapeSvg(l.label)}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

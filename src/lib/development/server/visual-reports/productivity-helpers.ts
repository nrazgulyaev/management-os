/**
 * Stage 5.C — Workforce productivity (per-role utilization over time).
 *
 * Pure helpers — no I/O.
 *
 * Renders a stacked area chart: x = month, stacks = roles.
 */

import {
  computeAxisRange,
  escapeSvg,
  formatAxisLabel,
} from "./chart-data-helpers";

export interface ProductivityRow {
  monthLabel: string;
  /** role → utilized hours that month. */
  utilized: Record<string, number>;
  totalCapacityHours: number;
}

export function computeProductivitySeries(rows: ProductivityRow[]): {
  roles: string[];
  monthsTotalUtilized: number[];
  monthsIdle: number[];
} {
  const roleSet = new Set<string>();
  for (const r of rows) for (const role of Object.keys(r.utilized)) roleSet.add(role);
  const roles = Array.from(roleSet);
  const monthsTotalUtilized = rows.map((r) =>
    roles.reduce((acc, role) => acc + (r.utilized[role] ?? 0), 0),
  );
  const monthsIdle = rows.map((r, i) =>
    Math.max(0, r.totalCapacityHours - monthsTotalUtilized[i]),
  );
  return { roles, monthsTotalUtilized, monthsIdle };
}

export function renderProductivitySvg(
  rows: ProductivityRow[],
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

  const { roles, monthsTotalUtilized, monthsIdle } = computeProductivitySeries(rows);
  const max = Math.max(
    ...rows.map((r, i) => Math.max(r.totalCapacityHours, monthsTotalUtilized[i])),
  );
  const yRange = computeAxisRange([0, max], 5);
  const usableH = height - padT - padB;
  const usableW = width - padL - padR;
  const groupW = usableW / rows.length;
  const barW = groupW * 0.7;
  const yScale = (v: number) =>
    padT + (1 - (v - yRange.min) / (yRange.max - yRange.min || 1)) * usableH;

  const palette = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ec4899", "#0891b2"];

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Workforce productivity">`,
  );
  for (const t of yRange.ticks) {
    const y = yScale(t);
    parts.push(
      `<line x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${formatAxisLabel(t * 100)}h</text>`,
    );
  }
  rows.forEach((r, i) => {
    const x0 = padL + groupW * (i + 0.15);
    let runBottom = yScale(0);
    roles.forEach((role, ri) => {
      const v = r.utilized[role] ?? 0;
      if (v <= 0) return;
      const h =
        ((v) / (yRange.max - yRange.min || 1)) * usableH;
      runBottom -= h;
      parts.push(
        `<rect x="${x0}" y="${runBottom}" width="${barW}" height="${Math.max(1, h)}" fill="${palette[ri % palette.length]}" />`,
      );
    });
    // idle on top in light gray
    const idleH = ((monthsIdle[i]) / (yRange.max - yRange.min || 1)) * usableH;
    runBottom -= idleH;
    parts.push(
      `<rect x="${x0}" y="${runBottom}" width="${barW}" height="${Math.max(1, idleH)}" fill="#e2e8f0" stroke-dasharray="2 2" />`,
    );
    parts.push(
      `<text x="${x0 + barW / 2}" y="${height - padB + 14}" text-anchor="middle" font-size="11" fill="#475569">${escapeSvg(r.monthLabel)}</text>`,
    );
  });
  // legend
  roles.forEach((role, ri) => {
    const x = padL + ri * 90;
    parts.push(
      `<rect x="${x}" y="6" width="10" height="10" fill="${palette[ri % palette.length]}" />`,
    );
    parts.push(
      `<text x="${x + 14}" y="15" font-size="10" fill="#475569">${escapeSvg(role)}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

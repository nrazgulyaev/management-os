/**
 * Stage 5.C — Sales funnel helpers.
 *
 * Pure helpers — no I/O.
 */

import { escapeSvg } from "./chart-data-helpers";

export interface FunnelStage {
  label: string;
  count: number;
}

export interface FunnelStageComputed extends FunnelStage {
  /** Conversion from previous stage (0-100). NaN if prev=0. */
  conversionFromPrevPct: number;
  /** Width fraction (0-1) relative to widest stage. */
  widthFraction: number;
}

export function computeFunnelStages(
  stages: FunnelStage[],
): FunnelStageComputed[] {
  if (stages.length === 0) return [];
  const top = stages[0].count || 1;
  return stages.map((s, i) => {
    const prev = i === 0 ? null : stages[i - 1].count;
    const conv =
      prev == null
        ? 100
        : prev > 0
          ? (s.count / prev) * 100
          : 0;
    return {
      ...s,
      conversionFromPrevPct: conv,
      widthFraction: top > 0 ? s.count / top : 0,
    };
  });
}

export interface FunnelSvgOptions {
  width?: number;
  height?: number;
  fill?: string;
}

export function renderFunnelSvg(
  stages: FunnelStage[],
  opts: FunnelSvgOptions = {},
): string {
  const width = opts.width ?? 600;
  const height = opts.height ?? 360;
  const fill = opts.fill ?? "#2563eb";

  const computed = computeFunnelStages(stages);
  if (computed.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }
  const padT = 20;
  const padB = 20;
  const usableH = height - padT - padB;
  const stageH = usableH / computed.length;
  const cx = width / 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Sales funnel">`,
  );
  computed.forEach((s, i) => {
    const w = Math.max(40, s.widthFraction * (width * 0.6));
    const y = padT + i * stageH;
    parts.push(
      `<rect x="${cx - w / 2}" y="${y + 4}" width="${w}" height="${stageH - 8}" fill="${fill}" opacity="${0.4 + 0.6 * s.widthFraction}" rx="4" />`,
    );
    parts.push(
      `<text x="${cx}" y="${y + stageH / 2}" text-anchor="middle" font-size="12" fill="#fff">${escapeSvg(s.label)} (${s.count})</text>`,
    );
    if (i > 0) {
      parts.push(
        `<text x="${cx + w / 2 + 8}" y="${y + stageH / 2}" font-size="10" fill="#64748b">${s.conversionFromPrevPct.toFixed(0)}%</text>`,
      );
    }
  });
  parts.push("</svg>");
  return parts.join("");
}

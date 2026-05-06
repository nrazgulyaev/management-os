/**
 * Stage 5.C — Cashflow waterfall chart helpers.
 *
 * Pure helpers — no I/O.
 *
 * Bars: starting cash → +inflows → -outflows → ending cash.
 */

import { computeAxisRange, escapeSvg, formatAxisLabel } from "./chart-data-helpers";

export interface WaterfallBar {
  label: string;
  amountMinor: number;
  /** "starting" / "ending" anchor; "in" adds; "out" subtracts. */
  kind: "starting" | "in" | "out" | "ending";
}

export interface WaterfallStep {
  label: string;
  /** Cumulative cash AFTER this step. */
  cumulativeMinor: number;
  /** Bottom of the bar (for stacked rendering). */
  baseMinor: number;
  /** Height of the bar. */
  amountMinor: number;
  kind: WaterfallBar["kind"];
}

export function computeWaterfallSteps(
  bars: WaterfallBar[],
): WaterfallStep[] {
  let running = 0;
  const out: WaterfallStep[] = [];
  for (const b of bars) {
    if (b.kind === "starting" || b.kind === "ending") {
      out.push({
        label: b.label,
        baseMinor: 0,
        cumulativeMinor: b.amountMinor,
        amountMinor: b.amountMinor,
        kind: b.kind,
      });
      running = b.amountMinor;
    } else if (b.kind === "in") {
      out.push({
        label: b.label,
        baseMinor: running,
        cumulativeMinor: running + b.amountMinor,
        amountMinor: b.amountMinor,
        kind: "in",
      });
      running += b.amountMinor;
    } else if (b.kind === "out") {
      out.push({
        label: b.label,
        baseMinor: running - b.amountMinor,
        cumulativeMinor: running - b.amountMinor,
        amountMinor: b.amountMinor,
        kind: "out",
      });
      running -= b.amountMinor;
    }
  }
  return out;
}

export interface WaterfallSvgOptions {
  width?: number;
  height?: number;
  inColor?: string;
  outColor?: string;
  anchorColor?: string;
}

export function renderWaterfallSvg(
  bars: WaterfallBar[],
  opts: WaterfallSvgOptions = {},
): string {
  const width = opts.width ?? 800;
  const height = opts.height ?? 360;
  const padL = 60;
  const padR = 20;
  const padT = 30;
  const padB = 60;
  const inColor = opts.inColor ?? "#16a34a";
  const outColor = opts.outColor ?? "#dc2626";
  const anchorColor = opts.anchorColor ?? "#475569";

  const steps = computeWaterfallSteps(bars);
  if (steps.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }

  // Y range over the whole displayed value space.
  const yValues: number[] = [];
  for (const s of steps) {
    yValues.push(s.cumulativeMinor);
    yValues.push(s.baseMinor);
  }
  const yRange = computeAxisRange(yValues, 5);
  const usableH = height - padT - padB;
  const yScale = (v: number) =>
    padT + (1 - (v - yRange.min) / (yRange.max - yRange.min || 1)) * usableH;

  const usableW = width - padL - padR;
  const barWidth = (usableW / steps.length) * 0.7;
  const xFor = (i: number) =>
    padL + (i / steps.length) * usableW + (usableW / steps.length - barWidth) / 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Cashflow waterfall">`,
  );

  // Y gridlines + axis ticks.
  for (const t of yRange.ticks) {
    const y = yScale(t);
    parts.push(
      `<line x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${formatAxisLabel(t)}</text>`,
    );
  }

  // Bars.
  steps.forEach((s, i) => {
    const x = xFor(i);
    let y: number, h: number;
    if (s.kind === "out") {
      const top = yScale(s.baseMinor + s.amountMinor);
      const bot = yScale(s.baseMinor);
      y = Math.min(top, bot);
      h = Math.abs(bot - top);
    } else if (s.kind === "in") {
      const top = yScale(s.baseMinor + s.amountMinor);
      const bot = yScale(s.baseMinor);
      y = Math.min(top, bot);
      h = Math.abs(bot - top);
    } else {
      // anchors stack from zero
      const top = yScale(Math.max(0, s.cumulativeMinor));
      const bot = yScale(Math.min(0, s.cumulativeMinor));
      y = Math.min(top, bot);
      h = Math.abs(bot - top);
    }
    const fill =
      s.kind === "in" ? inColor : s.kind === "out" ? outColor : anchorColor;
    parts.push(
      `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(1, h)}" fill="${fill}" rx="2" />`,
    );
    parts.push(
      `<text x="${x + barWidth / 2}" y="${height - padB + 14}" text-anchor="middle" font-size="11" fill="#475569">${escapeSvg(s.label)}</text>`,
    );
    parts.push(
      `<text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#0f172a">${formatAxisLabel(s.amountMinor)}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("");
}

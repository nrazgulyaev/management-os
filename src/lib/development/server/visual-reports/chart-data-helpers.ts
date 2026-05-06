/**
 * Stage 5.C — Generic chart data primitives.
 *
 * Pure helpers shared across multiple chart types. No I/O,
 * no `import "server-only"`. Runtime testable.
 */

export interface AxisRange {
  min: number;
  max: number;
  /** Suggested tick count. */
  ticks: number[];
}

/**
 * Compute a "nice" linear axis range that fully contains the data and
 * picks round-number ticks. Always inclusive of zero.
 */
export function computeAxisRange(
  values: number[],
  desiredTickCount = 5,
): AxisRange {
  if (values.length === 0) {
    return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  const dataMin = Math.min(0, ...values);
  const dataMax = Math.max(0, ...values, 1);
  const span = dataMax - dataMin;
  if (span === 0) {
    return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  const rawStep = span / desiredTickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  let step: number;
  if (normalized < 1.5) step = 1 * magnitude;
  else if (normalized < 3) step = 2 * magnitude;
  else if (normalized < 7) step = 5 * magnitude;
  else step = 10 * magnitude;
  const min = Math.floor(dataMin / step) * step;
  const max = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
  return { min, max, ticks };
}

/** Map a data value to an SVG y-coordinate (top-down origin). */
export function scaleY(
  value: number,
  range: AxisRange,
  chartHeight: number,
  paddingTop = 20,
  paddingBottom = 20,
): number {
  const usable = chartHeight - paddingTop - paddingBottom;
  const span = range.max - range.min;
  if (span === 0) return paddingTop + usable / 2;
  return paddingTop + (1 - (value - range.min) / span) * usable;
}

/** Map an index to an x-coordinate spaced equally across width. */
export function scaleXIndex(
  index: number,
  total: number,
  chartWidth: number,
  paddingLeft = 40,
  paddingRight = 20,
): number {
  if (total <= 1) return paddingLeft;
  const usable = chartWidth - paddingLeft - paddingRight;
  return paddingLeft + (index / (total - 1)) * usable;
}

/** Convert a value-aligned X (e.g., a Date.getTime()) to chart X. */
export function scaleXValue(
  value: number,
  domainMin: number,
  domainMax: number,
  chartWidth: number,
  paddingLeft = 40,
  paddingRight = 20,
): number {
  const usable = chartWidth - paddingLeft - paddingRight;
  const span = domainMax - domainMin;
  if (span === 0) return paddingLeft;
  return paddingLeft + ((value - domainMin) / span) * usable;
}

/** Format a minor amount as a short axis label. */
export function formatAxisLabel(amountMinor: number): string {
  const major = amountMinor / 100;
  if (Math.abs(major) >= 1e9) return `${(major / 1e9).toFixed(1)}B`;
  if (Math.abs(major) >= 1e6) return `${(major / 1e6).toFixed(1)}M`;
  if (Math.abs(major) >= 1e3) return `${(major / 1e3).toFixed(0)}k`;
  return `${major.toFixed(0)}`;
}

/** XML-escape a string for safe inclusion in inline SVG. */
export function escapeSvg(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

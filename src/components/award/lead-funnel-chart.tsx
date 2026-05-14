/**
 * Mega-Sprint Phase 2 — LeadFunnelChart primitive.
 *
 * Pure SVG funnel: trapezoidal stages stacked vertically, each shaded
 * with a tone token. Each stage carries a label, an absolute count,
 * and an optional conversion-% to the next stage (rendered as a chip
 * between segments). Used by Sales Manager (D6) and re-used by
 * Marketing Staff (D7) for the campaign-attribution funnel.
 *
 * Server component — no client state, no Recharts dependency.
 *
 * Stages render from top (widest, lifecycle = lead) down to bottom
 * (narrowest, lifecycle = contract). Widths interpolate linearly
 * from `topWidthPct` to `bottomWidthPct` so the funnel preserves a
 * consistent silhouette regardless of stage counts.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type FunnelStageTone =
  | "emerald"
  | "gold"
  | "sage"
  | "terracotta"
  | "ink";

const STAGE_FILL: Record<FunnelStageTone, string> = {
  emerald: "var(--data-emerald)",
  gold: "var(--data-gold)",
  sage: "var(--data-sage)",
  terracotta: "var(--data-terracotta)",
  ink: "var(--ink)",
};

export interface FunnelStage {
  /** Stage label (e.g. "Leads", "Qualified"). */
  label: string;
  /** Absolute count for this stage. */
  count: number;
  /**
   * Optional pre-computed conversion-% TO this stage from the previous
   * one (e.g. "32%"). When omitted, the chart computes it from
   * `count / previousCount` and rounds to 1 decimal.
   */
  conversionPct?: string;
  /** Optional tone override; defaults to a deterministic stage palette. */
  tone?: FunnelStageTone;
}

export interface LeadFunnelChartProps {
  stages: FunnelStage[];
  /** Pixel height for the funnel area. Defaults to 280. */
  height?: number;
  /** Widest segment width as a % of viewport width. Defaults to 92. */
  topWidthPct?: number;
  /** Narrowest segment width as a % of viewport width. Defaults to 38. */
  bottomWidthPct?: number;
  /** Optional heading rendered above the funnel. */
  heading?: React.ReactNode;
  /** Optional accessory rendered top-right of the header. */
  accessory?: React.ReactNode;
  /** Empty-state copy when stages are empty. */
  emptyMessage?: string;
  className?: string;
}

const DEFAULT_PALETTE: FunnelStageTone[] = [
  "sage",
  "emerald",
  "gold",
  "terracotta",
  "ink",
];

export function LeadFunnelChart({
  stages,
  height = 280,
  topWidthPct = 92,
  bottomWidthPct = 38,
  heading,
  accessory,
  emptyMessage,
  className,
}: LeadFunnelChartProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden",
        className,
      )}
      data-stage10="lead-funnel-chart"
    >
      {(heading || accessory) && (
        <header className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
          {heading ? (
            typeof heading === "string" ? (
              <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
                {heading}
              </h3>
            ) : (
              heading
            )
          ) : (
            <span />
          )}
          {accessory && <div className="shrink-0">{accessory}</div>}
        </header>
      )}
      {stages.length === 0 ? (
        <p className="px-6 py-10 text-sm text-ink-tertiary text-center">
          {emptyMessage ?? "No pipeline data yet."}
        </p>
      ) : (
        <FunnelBody
          stages={stages}
          height={height}
          topWidthPct={topWidthPct}
          bottomWidthPct={bottomWidthPct}
        />
      )}
    </section>
  );
}

function FunnelBody({
  stages,
  height,
  topWidthPct,
  bottomWidthPct,
}: {
  stages: FunnelStage[];
  height: number;
  topWidthPct: number;
  bottomWidthPct: number;
}) {
  const viewW = 600;
  const padX = 24;
  const padY = 16;
  const gap = 8;
  const innerH = height - padY * 2;
  const segH = (innerH - gap * (stages.length - 1)) / stages.length;

  function widthAt(idx: number, total: number): number {
    if (total <= 1) return (topWidthPct / 100) * viewW;
    const t = idx / (total - 1);
    const pct = topWidthPct - (topWidthPct - bottomWidthPct) * t;
    return (pct / 100) * viewW;
  }

  const segments = stages.map((stage, i) => {
    const wTop = widthAt(i, stages.length);
    const wBottom = widthAt(i + 1, stages.length);
    const yTop = padY + i * (segH + gap);
    const yBottom = yTop + segH;
    const cx = viewW / 2;
    const topLeft = cx - wTop / 2;
    const topRight = cx + wTop / 2;
    const bottomLeft = cx - wBottom / 2;
    const bottomRight = cx + wBottom / 2;
    const path = `M ${topLeft} ${yTop} L ${topRight} ${yTop} L ${bottomRight} ${yBottom} L ${bottomLeft} ${yBottom} Z`;
    const tone = stage.tone ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
    const prev = i > 0 ? stages[i - 1] : null;
    const conversion =
      i === 0
        ? null
        : (stage.conversionPct ??
          (prev && prev.count > 0
            ? `${Math.round((stage.count / prev.count) * 1000) / 10}%`
            : "—"));
    return {
      key: `${stage.label}-${i}`,
      label: stage.label,
      count: stage.count,
      conversion,
      path,
      yMid: (yTop + yBottom) / 2,
      yTop,
      fill: STAGE_FILL[tone],
    };
  });

  return (
    <div className="px-3 md:px-4 py-4 md:py-5" style={{ height }}>
      <svg
        viewBox={`0 0 ${viewW} ${height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Lead funnel"
      >
        {segments.map((s, i) => (
          <g key={s.key}>
            <path d={s.path} fill={s.fill} opacity={0.92} />
            <text
              x={viewW / 2}
              y={s.yMid - 4}
              textAnchor="middle"
              fontSize={13}
              fontWeight={500}
              fill="var(--ink-inverse)"
            >
              {s.label}
            </text>
            <text
              x={viewW / 2}
              y={s.yMid + 14}
              textAnchor="middle"
              fontSize={16}
              fontFamily="var(--font-mono)"
              fill="var(--ink-inverse)"
              opacity={0.92}
            >
              {s.count.toLocaleString()}
            </text>
            {i > 0 && s.conversion && (
              <g>
                <rect
                  x={viewW - padX - 76}
                  y={s.yTop - 12}
                  width={68}
                  height={22}
                  rx={11}
                  ry={11}
                  fill="var(--surface)"
                  stroke="var(--line-soft)"
                />
                <text
                  x={viewW - padX - 42}
                  y={s.yTop + 3}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  fill="var(--ink)"
                >
                  {s.conversion}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

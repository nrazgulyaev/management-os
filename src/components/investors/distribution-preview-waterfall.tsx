"use client";

/**
 * Phase 2.4 dev-03 — DistributionPreviewWaterfall.
 *
 * Live preview inside the distribution flow. Composes the
 * WaterfallChart primitive with the canonical
 * runWaterfall() output — no client-side delta math (Critical UX
 * rule 1).
 */

import * as React from "react";
import { WaterfallChart } from "./waterfall-chart";
import type { WaterfallResult } from "@/features/investors/waterfall-calculator";

export interface DistributionPreviewWaterfallProps {
  result: WaterfallResult;
  /** "IDR billions", "IDR M", etc. */
  unit: string;
  className?: string;
}

export function DistributionPreviewWaterfall({ result, unit, className }: DistributionPreviewWaterfallProps) {
  return (
    <div className={`dist-preview${className ? ` ${className}` : ""}`}>
      <WaterfallChart bars={result.bars} unit={unit} />
      <ul className="dp-kpis">
        {result.kpis.map((k, i) => (
          <li key={i} className="dp-kpi">
            <span className="dp-kpi-label mono">{k.label}</span>
            <span className="dp-kpi-value mono">{k.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

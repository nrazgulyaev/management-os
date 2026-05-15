/**
 * Sprint 4 — Award primitives barrel.
 *
 * Five new primitives layered on top of the Sprint-1 chart/composition
 * set (`src/components/ui/primitives/`). Distinct folder because these
 * deliberately reach for a "Reference 1 / Reference 2" award-style
 * silhouette (massive Fraunces type, hero AI input, hatched bars,
 * mixed-tone KPI rows, status-pill team lists) — and we want them
 * easy to find when composing a polished cabinet apex.
 */

export { HeroGreetingAI } from "./hero-greeting-ai";
export type { HeroGreetingAIProps } from "./hero-greeting-ai";
export { HeroAskInput } from "./hero-greeting-ai-input";
export type {
  HeroAskAction,
  HeroAskResult,
} from "./hero-greeting-ai-input";

export { HalfDonutGauge } from "./half-donut-gauge";
export type {
  HalfDonutGaugeProps,
  HalfDonutTone,
  HalfDonutLegendItem,
} from "./half-donut-gauge";

export { HatchedBarChart } from "./hatched-bar-chart";
export type {
  HatchedBarChartProps,
  HatchedBarDatum,
  HatchedBarTone,
} from "./hatched-bar-chart";

export { KpiRowMixed } from "./kpi-row-mixed";
export type { KpiRowMixedProps, KpiItem, KpiHeroTone } from "./kpi-row-mixed";

export { TeamRowList } from "./team-row-list";
export type {
  TeamRowListProps,
  TeamRowItem,
  TeamRowStatus,
} from "./team-row-list";

// Phase 1 — Site Supervisor + Security + Housekeeping primitives.
export { PatrolTimeline } from "./patrol-timeline";
export type {
  PatrolTimelineProps,
  PatrolEvent,
  PatrolEventStatus,
} from "./patrol-timeline";

export { PhotoEvidenceGrid } from "./photo-evidence-grid";
export type {
  PhotoEvidenceGridProps,
  PhotoEvidenceItem,
  PhotoEvidenceStatus,
} from "./photo-evidence-grid";

// Phase 2 — Sales Manager + Marketing primitives.
export { LeadFunnelChart } from "./lead-funnel-chart";
export type {
  LeadFunnelChartProps,
  FunnelStage,
  FunnelStageTone,
} from "./lead-funnel-chart";

// Phase 12 — Investor Portal primitives.
export { InvestorHeroGreetingAI } from "./investor-hero-greeting-ai";
export type { InvestorHeroGreetingAIProps } from "./investor-hero-greeting-ai";

export { DistributionWaterfall } from "./distribution-waterfall";
export type {
  DistributionWaterfallProps,
  WaterfallStage,
  WaterfallStageTone,
} from "./distribution-waterfall";

// Sprint MD-4 Phase 3 — investor-portal-friendly re-export of the
// ink-deep AreaChartCard. The 10.J.2 guardrail bans importing the
// `@/components/ui/primitives` barrel from inside the investor
// portal; re-exporting through the award barrel keeps the chart
// reachable without contaminating the stone-theme contract.
export { AreaChartCard } from "@/components/ui/primitives/area-chart-card";
export type {
  AreaChartCardProps,
  AreaChartPoint,
  AreaChartTone,
} from "@/components/ui/primitives/area-chart-card";

// Phase 8 — Front Office + Concierge primitives.
export { RoomStatusBoard } from "./room-status-board";
export type {
  RoomStatusBoardProps,
  RoomStatusRow,
  RoomDayStatus,
} from "./room-status-board";

export { GuestArrivalsList } from "./guest-arrivals-list";
export type {
  GuestArrivalsListProps,
  GuestArrivalItem,
  GuestArrivalReadiness,
} from "./guest-arrivals-list";

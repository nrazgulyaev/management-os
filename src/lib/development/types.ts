/**
 * Development OS — domain types.
 *
 * These shapes are written with future Drizzle tables in mind. IDs are strings
 * (will become uuid columns), enums are string-literal unions, and money is
 * tracked in BIGINT-minor units mirroring the existing finance ledger.
 *
 * Reuse-first: where the existing schema already covers a concept (project,
 * villa as unit, owner, document), the Development OS will extend the same
 * row rather than fork it. Net-new types live here only when no existing
 * entity fits.
 */

export type ProjectId = string;
export type ModuleId = string;
export type AgentId = string;
export type StageId = string;
export type Currency = "USD" | "IDR" | "EUR";

/** Lifecycle stage where a project currently sits. */
export type DevelopmentStageKey =
  | "land"
  | "design"
  | "permits"
  | "budget"
  | "construction"
  | "procurement"
  | "sales"
  | "investor_reporting"
  | "handover"
  | "management";

export type ProjectPhase =
  | "pre_acquisition"
  | "acquisition"
  | "design"
  | "permitting"
  | "pre_construction"
  | "under_construction"
  | "fit_out"
  | "handover"
  | "managed"
  | "archived";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Trend = "up" | "down" | "flat";
export type MetricStatus = "ok" | "watch" | "alert";
export type ModuleStatus = "live" | "next" | "roadmap";
export type AgentStatus = "live" | "next" | "roadmap";

export interface DevelopmentProject {
  id: ProjectId;
  /** Mirrors the existing `projects.slug` column. */
  slug: string;
  name: string;
  /** "Ungasan, Bali" — display string. Real schema may split city/region later. */
  location: string;
  phase: ProjectPhase;
  /** ISO date — when development work began on site. */
  startDate: string;
  /** ISO date — current planned handover to Management OS. Nullable. */
  expectedHandover: string | null;
  /** BIGINT minor of `currency`. */
  totalBudgetMinor: bigint;
  /** BIGINT minor of `currency`. */
  budgetUsedMinor: bigint;
  currency: Currency;
  units: number;
  unitsSold: number;
  /** 0–100. Weighted by cost-loaded schedule. */
  constructionProgressPct: number;
  aiRiskScore: RiskLevel;
  /** One-line forward look. Nullable when no milestone is queued. */
  nextMilestone: string | null;
  /** Hero image / gradient token reference. */
  heroToken: string;
}

export interface DevelopmentModule {
  id: ModuleId;
  /** URL slug under /dashboard/development/. */
  slug: string;
  title: string;
  description: string;
  /** lucide-react icon name — resolved at render to keep this file serializable. */
  iconKey: string;
  status: ModuleStatus;
  /** Optional: short label rendered as a pill ("Q3", "next"). */
  badge?: string;
}

export interface DevelopmentMetric {
  id: string;
  label: string;
  value: string;
  unit?: string;
  /** Period-over-period delta as a percent. Null when no baseline exists. */
  changePct: number | null;
  trend: Trend;
  status: MetricStatus;
  /** Optional secondary line under the metric. */
  hint?: string;
}

export interface AIAgent {
  id: AgentId;
  name: string;
  /** Single-paragraph capability statement. */
  description: string;
  status: AgentStatus;
  /** Bullet list of capabilities. */
  capabilities: string[];
  iconKey: string;
}

export interface ProjectHealth {
  projectId: ProjectId;
  /** Days behind/ahead of baseline. Negative = ahead. */
  scheduleDriftDays: number;
  /** Forecast budget overrun as percent of total. Negative = under. */
  budgetVariancePct: number;
  /** Sales velocity vs plan (1.0 = on plan, >1 ahead, <1 behind). */
  salesVelocityIndex: number;
  risks: ProjectRisk[];
}

export interface ProjectRisk {
  id: string;
  level: RiskLevel;
  category: "schedule" | "budget" | "sales" | "permits" | "supply" | "weather" | "quality";
  summary: string;
  /** ISO date — when the risk first appeared. */
  identifiedAt: string;
}

export interface LifecycleStage {
  id: StageId;
  key: DevelopmentStageKey;
  name: string;
  description: string;
  /** 1-indexed display order. */
  order: number;
  iconKey: string;
}

/** Mock AI insight rendered in the executive panel. Mirrors what an AI
 *  Executive Analyst run would emit. */
export interface AIInsight {
  id: string;
  agentId: AgentId;
  /** ISO timestamp. */
  generatedAt: string;
  headline: string;
  body: string;
  recommendedAction: string | null;
  confidence: "low" | "medium" | "high";
  relatedProjectIds: ProjectId[];
}

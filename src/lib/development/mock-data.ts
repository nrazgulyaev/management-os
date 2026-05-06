import type {
  AIAgent,
  AIInsight,
  DevelopmentMetric,
  DevelopmentProject,
  ProjectHealth,
} from "./types";

export const mockDevelopmentProjects: DevelopmentProject[] = [
  {
    id: "dev-eternal-villas",
    slug: "eternal-villas",
    name: "Eternal Villas",
    location: "Ungasan, Bali",
    phase: "under_construction",
    startDate: "2025-03-12",
    expectedHandover: "2026-09-30",
    totalBudgetMinor: 482_000_00n,
    budgetUsedMinor: 308_480_00n,
    currency: "USD",
    units: 8,
    unitsSold: 6,
    constructionProgressPct: 64,
    aiRiskScore: "medium",
    nextMilestone: "MEP rough-in sign-off · 12 days",
    heroToken:
      "linear-gradient(180deg, rgba(14,59,46,0.1) 0%, rgba(14,59,46,0.45) 100%)",
  },
  {
    id: "dev-enso-villas",
    slug: "enso-villas",
    name: "Enso Villas",
    location: "Pererenan, Bali",
    phase: "under_construction",
    startDate: "2025-09-01",
    expectedHandover: "2027-04-30",
    totalBudgetMinor: 612_000_00n,
    budgetUsedMinor: 134_640_00n,
    currency: "USD",
    units: 9,
    unitsSold: 2,
    constructionProgressPct: 22,
    aiRiskScore: "low",
    nextMilestone: "Foundation pour villa 04 · 6 days",
    heroToken:
      "linear-gradient(180deg, rgba(176,138,62,0.16) 0%, rgba(42,45,43,0.5) 100%)",
  },
  {
    id: "dev-ahau-gardens",
    slug: "ahau-gardens",
    name: "Ahau Gardens",
    location: "Ubud, Bali",
    phase: "permitting",
    startDate: "2026-01-15",
    expectedHandover: "2027-12-15",
    totalBudgetMinor: 728_000_00n,
    budgetUsedMinor: 18_200_00n,
    currency: "USD",
    units: 12,
    unitsSold: 0,
    constructionProgressPct: 0,
    aiRiskScore: "high",
    nextMilestone: "PBG resubmission · 28 days",
    heroToken:
      "linear-gradient(180deg, rgba(110,138,122,0.18) 0%, rgba(15,17,16,0.55) 100%)",
  },
];

export const mockProjectHealth: ProjectHealth[] = [
  {
    projectId: "dev-eternal-villas",
    scheduleDriftDays: 11,
    budgetVariancePct: 2.4,
    salesVelocityIndex: 1.05,
    risks: [
      {
        id: "risk-eternal-1",
        level: "medium",
        category: "supply",
        summary: "MEP fixtures shipment delayed 9 days at Surabaya port.",
        identifiedAt: "2026-04-22",
      },
      {
        id: "risk-eternal-2",
        level: "medium",
        category: "sales",
        summary: "Buyer 6 milestone payment due in 6 days, no confirmation yet.",
        identifiedAt: "2026-04-25",
      },
    ],
  },
  {
    projectId: "dev-enso-villas",
    scheduleDriftDays: -8,
    budgetVariancePct: -1.1,
    salesVelocityIndex: 0.9,
    risks: [
      {
        id: "risk-enso-1",
        level: "low",
        category: "weather",
        summary: "Monsoon window opens week 19 — concrete plan should preempt.",
        identifiedAt: "2026-04-18",
      },
    ],
  },
  {
    projectId: "dev-ahau-gardens",
    scheduleDriftDays: 28,
    budgetVariancePct: 0,
    salesVelocityIndex: 0,
    risks: [
      {
        id: "risk-ahau-1",
        level: "high",
        category: "permits",
        summary: "PBG rejected on setback definition — redesign of north edge.",
        identifiedAt: "2026-04-09",
      },
    ],
  },
];

export const mockTopMetrics: DevelopmentMetric[] = [
  {
    id: "kpi-active-projects",
    label: "Active projects",
    value: "3",
    changePct: 0,
    trend: "flat",
    status: "ok",
    hint: "2 building · 1 permitting",
  },
  {
    id: "kpi-total-budget",
    label: "Development budget",
    value: "$1.82M",
    unit: "USD",
    changePct: 4.2,
    trend: "up",
    status: "ok",
    hint: "Across all active projects",
  },
  {
    id: "kpi-cash-gap",
    label: "Cash gap · 90 days",
    value: "$214k",
    unit: "USD",
    changePct: 11.8,
    trend: "up",
    status: "watch",
    hint: "Vs. forecast inflows",
  },
  {
    id: "kpi-progress",
    label: "Construction progress",
    value: "31",
    unit: "% weighted",
    changePct: 3.1,
    trend: "up",
    status: "ok",
    hint: "Cost-loaded average",
  },
  {
    id: "kpi-units-sold",
    label: "Units sold",
    value: "8 / 29",
    changePct: 14.3,
    trend: "up",
    status: "ok",
    hint: "1 reservation last 7 days",
  },
  {
    id: "kpi-investor-capital",
    label: "Investor capital deployed",
    value: "$1.46M",
    unit: "USD",
    changePct: 6.7,
    trend: "up",
    status: "ok",
    hint: "80% of committed",
  },
  {
    id: "kpi-buyer-collections",
    label: "Buyer collections · MTD",
    value: "$182k",
    unit: "USD",
    changePct: -8.4,
    trend: "down",
    status: "watch",
    hint: "1 milestone slipped",
  },
  {
    id: "kpi-ai-risk",
    label: "AI risk score",
    value: "Medium",
    changePct: null,
    trend: "flat",
    status: "watch",
    hint: "Driven by Ahau permits",
  },
];

export const mockAIAgents: AIAgent[] = [
  {
    id: "agent-executive-analyst",
    name: "AI Executive Analyst",
    description:
      "Weekly read on where money is, where construction is, where risk is — and the two or three decisions that need a human this week.",
    status: "live",
    iconKey: "Sparkles",
    capabilities: [
      "Ingests budget, schedule, sales, and site reports",
      "Surfaces top three risks with recommended actions",
      "Drafts a Monday briefing in your tone of voice",
    ],
  },
  {
    id: "agent-sales-assistant",
    name: "AI Sales Assistant",
    description:
      "Always-on first responder for inbound from Instagram, Meta Ads, the landing page, and WhatsApp. Qualifies, books calls, never sleeps.",
    status: "live",
    iconKey: "MessageSquareHeart",
    capabilities: [
      "Replies to leads in under 60 seconds",
      "Qualifies on budget, timeline, intent",
      "Books discovery calls into the sales calendar",
    ],
  },
  {
    id: "agent-construction-analyst",
    name: "AI Construction Analyst",
    description:
      "Reads daily site reports and progress photos, flags drift against the master schedule before it becomes a slip.",
    status: "roadmap",
    iconKey: "HardHat",
    capabilities: [
      "Daily progress vs baseline",
      "Photo-based snag detection",
      "Manpower productivity trend",
    ],
  },
  {
    id: "agent-qs-analyst",
    name: "AI QS / Cost Analyst",
    description:
      "Compares vendor quotes against benchmark, flags variation orders, predicts cost-at-completion.",
    status: "roadmap",
    iconKey: "Calculator",
    capabilities: [
      "Quote vs benchmark spreads",
      "Variation order classification",
      "Cost-at-completion forecast",
    ],
  },
  {
    id: "agent-investor-relations",
    name: "AI Investor Relations Assistant",
    description:
      "Drafts capital-call letters, distribution notices, and investor Q&A responses grounded in real ledger data.",
    status: "roadmap",
    iconKey: "Briefcase",
    capabilities: [
      "Capital call drafting",
      "Distribution notices",
      "Investor Q&A grounded in ledger",
    ],
  },
  {
    id: "agent-photo-analyst",
    name: "AI Photo Analyst",
    description:
      "Classifies site photos, tags trades, builds a visual timeline per villa, surfaces anomalies for QA.",
    status: "roadmap",
    iconKey: "Camera",
    capabilities: [
      "Trade and area classification",
      "Visual timeline per villa",
      "Anomaly flags for QA",
    ],
  },
];

export const mockExecutiveInsight: AIInsight = {
  id: "insight-2026-04-30-1",
  agentId: "agent-executive-analyst",
  generatedAt: "2026-04-30T07:12:00.000Z",
  headline:
    "Eternal Villas is 11 days behind baseline. Three forces are converging this week.",
  body:
    "Main risks: MEP procurement delay (Surabaya port, 9 days), buyer payment milestone due in 6 days with no confirmation, and finishing productivity tracking 14% below plan. Cash gap remains within tolerance but the buyer milestone is on the critical path for the next contractor draw.",
  recommendedAction:
    "Reallocate finishing crew from Enso Villas (8% ahead of schedule) for two weeks, and trigger the standard 72-hour buyer follow-up sequence today.",
  confidence: "high",
  relatedProjectIds: ["dev-eternal-villas", "dev-enso-villas"],
};

export interface MockChartSeries {
  id: string;
  label: string;
  description: string;
  /** Series for placeholder bar/area visualizations. */
  series: { label: string; values: number[]; tone: "accent" | "gold" | "stone" | "sage" }[];
  /** Axis labels — months, projects, stages. */
  axis: string[];
}

export const mockSnapshotPanels: MockChartSeries[] = [
  {
    id: "panel-cashflow",
    label: "Monthly cashflow",
    description: "Plan vs forecast · next 12 months · USD",
    axis: ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
    series: [
      { label: "Plan", values: [180, 220, 240, 260, 285, 310, 290, 270, 240, 220, 200, 180], tone: "accent" },
      { label: "Forecast", values: [165, 205, 235, 245, 270, 295, 280, 275, 250, 230, 215, 195], tone: "gold" },
    ],
  },
  {
    id: "panel-budget",
    label: "Budget vs actual",
    description: "By cost category · all active projects · USD",
    axis: ["Land", "Design", "Civil", "MEP", "Finish", "FF&E", "Soft"],
    series: [
      { label: "Plan", values: [320, 92, 410, 188, 264, 142, 96], tone: "stone" },
      { label: "Actual", values: [320, 88, 422, 178, 248, 96, 88], tone: "accent" },
    ],
  },
  {
    id: "panel-progress",
    label: "Construction progress",
    description: "Cost-loaded · per project",
    axis: ["Eternal", "Enso", "Ahau"],
    series: [
      { label: "Progress %", values: [64, 22, 0], tone: "accent" },
    ],
  },
  {
    id: "panel-funnel",
    label: "Sales funnel",
    description: "Leads → reservations → contracts → handovers",
    axis: ["Leads", "Qualified", "Reservations", "Contracts", "Handovers"],
    series: [
      { label: "This quarter", values: [184, 62, 14, 8, 0], tone: "sage" },
    ],
  },
];

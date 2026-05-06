import type { LifecycleStage } from "./types";

export const DEVELOPMENT_PUBLIC_PATH = "/development";
export const DEVELOPMENT_APP_PATH = "/development-os";

export const lifecycleStages: LifecycleStage[] = [
  {
    id: "stage-land",
    key: "land",
    name: "Land",
    description: "Sourcing, due diligence, leasehold, zonation.",
    order: 1,
    iconKey: "MapPinned",
  },
  {
    id: "stage-design",
    key: "design",
    name: "Design",
    description: "Concept, schematic, technical drawings, 3D.",
    order: 2,
    iconKey: "Compass",
  },
  {
    id: "stage-permits",
    key: "permits",
    name: "Permits",
    description: "PBG, SLF, environmental, utility approvals.",
    order: 3,
    iconKey: "FileCheck2",
  },
  {
    id: "stage-budget",
    key: "budget",
    name: "Budget",
    description: "BoQ, cost estimate, contingency, cash plan.",
    order: 4,
    iconKey: "Calculator",
  },
  {
    id: "stage-construction",
    key: "construction",
    name: "Construction",
    description: "Earthworks → structure → finishing → MEP.",
    order: 5,
    iconKey: "HardHat",
  },
  {
    id: "stage-procurement",
    key: "procurement",
    name: "Procurement",
    description: "RFQs, vendors, POs, warehouse, deliveries.",
    order: 6,
    iconKey: "Truck",
  },
  {
    id: "stage-sales",
    key: "sales",
    name: "Sales",
    description: "Leads, reservations, contracts, payment milestones.",
    order: 7,
    iconKey: "HandCoins",
  },
  {
    id: "stage-investor-reporting",
    key: "investor_reporting",
    name: "Investor reporting",
    description: "Capital calls, drawdowns, distributions, IRR.",
    order: 8,
    iconKey: "LineChart",
  },
  {
    id: "stage-handover",
    key: "handover",
    name: "Handover",
    description: "Snag list, owner pack, keys, warranty start.",
    order: 9,
    iconKey: "KeyRound",
  },
  {
    id: "stage-management",
    key: "management",
    name: "Management",
    description: "Bridge into Management OS for ongoing operations.",
    order: 10,
    iconKey: "Building2",
  },
];

/** Sentinel marking modules slated for the next implementation wave. */
export const DEV_OS_NEXT_MODULES = [
  "projects",
  "finance",
  "sales",
  "investors",
  "site-reports",
] as const;

/** Modules acknowledged on the roadmap but intentionally not built yet. */
export const DEV_OS_ROADMAP_MODULES = [
  "quantity-surveying",
  "procurement",
  "warehouse",
  "qa-qc",
  "schedule",
  "reports",
  "settings",
] as const;

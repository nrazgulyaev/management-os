import type { NavGroup } from "@/config/navigation";
import {
  Activity,
  Bell,
  Bot,
  BookOpen,
  Brain,
  Building2,
  Briefcase,
  Calculator,
  CalendarRange,
  Calendar,
  ClipboardList,
  Cloud,
  Code,
  Download,
  Globe,
  Coins,
  Compass,
  FileBarChart,
  FileScan,
  FileText,
  Gauge,
  HandCoins,
  HardHat,
  Home,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Layers,
  Library,
  LineChart,
  ListTree,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  Percent,
  Phone,
  Radar,
  Receipt,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  Truck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DEVELOPMENT_APP_PATH } from "./constants";
import type { DevelopmentModule } from "./types";

/**
 * Module manifest for the Development OS workspace.
 *
 * `iconKey` is a string so this file stays serializable; the dashboard grid
 * resolves it to a lucide-react component at render time via `iconRegistry`
 * in components/development/icon-registry.ts.
 */
export const developmentModules: DevelopmentModule[] = [
  {
    id: "mod-projects",
    slug: "projects",
    title: "Projects",
    description:
      "Land, design, permits, and construction status across every active development.",
    iconKey: "Building2",
    status: "next",
  },
  {
    id: "mod-finance",
    slug: "finance",
    title: "Finance & transactions",
    description:
      "Capital calls, drawdowns, vendor payments, and 12-month cash plan.",
    iconKey: "Wallet",
    status: "next",
  },
  {
    id: "mod-sales",
    slug: "sales",
    title: "Sales & buyers",
    description:
      "Lead pipeline, reservations, contracts, and buyer payment milestones.",
    iconKey: "HandCoins",
    status: "next",
  },
  {
    id: "mod-investors",
    slug: "investors",
    title: "Investors",
    description:
      "Commitments, drawdowns, distributions, and per-investor IRR with audit trail.",
    iconKey: "Briefcase",
    status: "next",
  },
  {
    id: "mod-site-reports",
    slug: "site-reports",
    title: "Site reports",
    description:
      "Daily progress, photo logs, weather, manpower, snag lists from the field.",
    iconKey: "ClipboardList",
    status: "next",
  },
  {
    id: "mod-quantity-surveying",
    slug: "quantity-surveying",
    title: "Quantity surveying",
    description: "BoQ, cost estimation, variation orders, valuation runs.",
    iconKey: "Calculator",
    status: "roadmap",
  },
  {
    id: "mod-procurement",
    slug: "procurement",
    title: "Procurement",
    description: "RFQs, vendor scoring, purchase orders, deliveries.",
    iconKey: "ShoppingCart",
    status: "roadmap",
  },
  {
    id: "mod-warehouse",
    slug: "warehouse",
    title: "Warehouse",
    description: "Site stock, material draws, leftover reconciliation.",
    iconKey: "Package",
    status: "roadmap",
  },
  {
    id: "mod-qa-qc",
    slug: "qa-qc",
    title: "QA / QC",
    description: "Inspection checklists, snags, rework, sign-offs.",
    iconKey: "ShieldCheck",
    status: "roadmap",
  },
  {
    id: "mod-schedule",
    slug: "schedule",
    title: "Schedule",
    description: "Master schedule, critical path, baseline vs actual.",
    iconKey: "CalendarRange",
    status: "roadmap",
  },
  {
    id: "mod-reports",
    slug: "reports",
    title: "Reports",
    description: "Investor packs, monthly executive, board-ready exports.",
    iconKey: "FileText",
    status: "roadmap",
  },
  {
    id: "mod-settings",
    slug: "settings",
    title: "Settings",
    description: "Roles, scopes, AI prompts, integrations.",
    iconKey: "Settings",
    status: "roadmap",
  },
];

export function getModulesByStatus(status: DevelopmentModule["status"]) {
  return developmentModules.filter((m) => m.status === status);
}

/**
 * Sidebar navigation for the Development OS workspace.
 *
 * Mirrors the shape of `dashboardNav` in src/config/navigation.ts so the
 * sidebar component can render the two interchangeably.
 */
export const developmentAppNav: NavGroup[] = [
  {
    items: [
      {
        href: DEVELOPMENT_APP_PATH,
        label: "Command center",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Cabinets",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/my-cabinet`,
        label: "My cabinet",
        icon: Home,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/site-supervisor`,
        label: "Site supervisor",
        icon: HardHat,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/project-manager`,
        label: "Project manager",
        icon: ClipboardList,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/cfo-accountant`,
        label: "CFO / Accountant",
        icon: Wallet,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/qs`,
        label: "QS / Cost analyst",
        icon: Calculator,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/procurement-manager`,
        label: "Procurement manager",
        icon: Package,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/warehouse-manager`,
        label: "Warehouse manager",
        icon: Store,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/marketing-staff`,
        label: "Marketing staff",
        icon: Megaphone,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cabinets/sales-manager`,
        label: "Sales manager",
        icon: Briefcase,
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/marketing/dashboard`,
        label: "Marketing dashboard",
        icon: Megaphone,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/marketing/lead-sources`,
        label: "Lead sources",
        icon: Compass,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/marketing/campaigns`,
        label: "Campaigns",
        icon: Megaphone,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/marketing/content`,
        label: "Content pipeline",
        icon: FileText,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/marketing/conversations`,
        label: "Conversations",
        icon: MessageSquare,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/marketing/manager-performance`,
        label: "Manager performance",
        icon: Gauge,
      },
    ],
  },
  {
    label: "AI Agents",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents`,
        label: "Hub",
        icon: Bot,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/inbox`,
        label: "Inbox",
        icon: Inbox,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/qs-cost-analyst`,
        label: "QS Cost Analyst",
        icon: Calculator,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/procurement-analyst`,
        label: "Procurement Analyst",
        icon: ShoppingCart,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/tax-assistant`,
        label: "Tax Assistant",
        icon: Receipt,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/marketing-assistant`,
        label: "Marketing Assistant",
        icon: Megaphone,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/executive-business`,
        label: "Executive Business",
        icon: TrendingUp,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/daily-digest`,
        label: "Daily Digest",
        icon: Calendar,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/weekly-plan`,
        label: "Weekly Plan",
        icon: CalendarRange,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/ai-agents/memory`,
        label: "Project Memory",
        icon: Brain,
      },
    ],
  },
  {
    label: "Executive",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/dashboard`,
        label: "Executive dashboard",
        icon: Activity,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/reports`,
        label: "Visual reports",
        icon: FileBarChart,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/risk-radar`,
        label: "Risk radar",
        icon: Radar,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/digests`,
        label: "Executive digests",
        icon: FileText,
      },
    ],
  },
  {
    label: "Build & sell",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/projects`,
        label: "Projects",
        icon: Building2,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/assets`,
        label: "Assets",
        icon: Layers,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/asset-types`,
        label: "Asset types",
        icon: Tags,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/site-reports`,
        label: "Site reports",
        icon: ClipboardList,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/sales`,
        label: "Sales & buyers",
        icon: HandCoins,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/reservations`,
        label: "Reservations",
        icon: KeyRound,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/contracts`,
        label: "Contracts",
        icon: FileText,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/invoices`,
        label: "Invoices",
        icon: Wallet,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/discounts`,
        label: "Discounts",
        icon: Percent,
      },
    ],
  },
  {
    label: "Capital",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/finance`,
        label: "Finance",
        icon: Wallet,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/finance/invoices`,
        label: "Invoices",
        icon: FileText,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/finance/tax-types`,
        label: "Tax types",
        icon: Percent,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/finance/tax-reports`,
        label: "Tax reports",
        icon: FileText,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/finance/shared-costs`,
        label: "Shared costs",
        icon: Wallet,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/finance/document-extractions`,
        label: "Document extractions",
        icon: FileScan,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/investors`,
        label: "Investors",
        icon: Briefcase,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/commitments`,
        label: "Commitments",
        icon: HandCoins,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/distributions`,
        label: "Distributions",
        icon: HandCoins,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/revenue-streams`,
        label: "Revenue streams",
        icon: Coins,
      },
    ],
  },
  {
    label: "Strategic",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/project-cycle`,
        label: "Project cycle intelligence",
        icon: Compass,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/profitability`,
        label: "Unit profitability",
        icon: Gauge,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/cashflow-forecast`,
        label: "Cashflow forecast",
        icon: LineChart,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/vendors`,
        label: "Vendors",
        icon: HardHat,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/materials`,
        label: "Materials",
        icon: Package,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/materials/deliveries`,
        label: "Deliveries",
        icon: Truck,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/safety`,
        label: "Safety incidents",
        icon: ShieldAlert,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/procurement/purchase-requests`,
        label: "Purchase requests",
        icon: ShoppingCart,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/procurement/quotations`,
        label: "Quotations",
        icon: HandCoins,
      },
    ],
  },
  {
    label: "Communications",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/whatsapp`,
        label: "WhatsApp messages",
        icon: MessageSquare,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/whatsapp/templates`,
        label: "WhatsApp templates",
        icon: FileText,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/whatsapp/phone-numbers`,
        label: "Phone numbers",
        icon: Phone,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/notifications`,
        label: "Notification rules",
        icon: Bell,
      },
    ],
  },
  {
    label: "Roadmap",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/quantity-surveying`,
        label: "Quantity surveying",
        icon: Calculator,
        badge: "soon",
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/inventory/items`,
        label: "Warehouse",
        icon: Package,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/qa-qc`,
        label: "QA / QC",
        icon: ShieldCheck,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/schedule`,
        label: "Schedule",
        icon: CalendarRange,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/schedule/calendars`,
        label: "Calendars",
        icon: Calendar,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/schedule/resources`,
        label: "Resources",
        icon: HardHat,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/productivity`,
        label: "Productivity",
        icon: Gauge,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/reports`,
        label: "Reports",
        icon: FileText,
        badge: "soon",
      },
    ],
  },
  {
    label: "Knowledge base",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/drawings`,
        label: "Drawings",
        icon: Layers,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/coordination`,
        label: "Coordination",
        icon: MapPin,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/boq`,
        label: "BOQ",
        icon: ListTree,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/boq/takeoff`,
        label: "Takeoff workbench",
        icon: Calculator,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/specifications`,
        label: "Specifications",
        icon: Library,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/method-statements`,
        label: "Method statements",
        icon: BookOpen,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/quality-standards`,
        label: "Quality standards",
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/settings`,
        label: "General settings",
        icon: Settings,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/ai-usage`,
        label: "AI usage",
        icon: Sparkles,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/notifications`,
        label: "Notifications",
        icon: Bell,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/approval-thresholds`,
        label: "Approval thresholds",
        icon: ShieldCheck,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/whatsapp`,
        label: "WhatsApp setup",
        icon: MessageSquare,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/api-keys`,
        label: "API keys",
        icon: KeyRound,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/webhooks`,
        label: "Webhooks",
        icon: Cloud,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/settings/data-export`,
        label: "Data export",
        icon: Download,
      },
    ],
  },
  {
    label: "Platform",
    items: [
      {
        href: `${DEVELOPMENT_APP_PATH}/platform/organizations`,
        label: "Organizations",
        icon: Building2,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/platform/usage`,
        label: "Usage metrics",
        icon: Gauge,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/platform/api-docs`,
        label: "API docs",
        icon: Code,
      },
      {
        href: `${DEVELOPMENT_APP_PATH}/platform/branding`,
        label: "Branding",
        icon: Globe,
      },
    ],
  },
];

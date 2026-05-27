/**
 * Sprint _handoff/ Task 5 — Development OS sidebar nav.
 *
 * Hybrid synthesis (operator-locked Option C):
 *   - Group labels + ordering: prototype `_handoff/_shared/dev-shell.html`
 *     (COMMAND CENTER / CABINETS / AI AGENTS / EXECUTIVE / BUILD · SELL /
 *     CAPITAL / STRATEGIC / OPERATIONS / MARKETING / SCHEDULE · KNOWLEDGE /
 *     COMMUNICATIONS · SETTINGS)
 *   - Items: every link points at a real Next.js route under
 *     `src/app/(development-app)/development-os/*`. Prototype routes
 *     that don't exist as concrete pages (warehouse.html standalone,
 *     `cfo.html#shared`-style anchors that target nonexistent fragments)
 *     are dropped; the existing `src/lib/development/navigation.ts`
 *     tree contributes additions the prototype omits (asset types,
 *     discounts, document extractions, marketing manager performance,
 *     etc.).
 *
 * Icons are STRING KEYS into the shared
 * `src/components/dashboard/icons.tsx` ICONS registry (HF-12 pattern —
 * no lucide forwardRef refs cross the RSC boundary).
 *
 * Dropped from prototype (no matching route):
 *   warehouse.html standalone (functionality lives in PROC cabinets),
 *   `strategic.html` separate (rolled into project-cycle/cashflow),
 *   `communications.html` separate WhatsApp page (lives under
 *   marketing/conversations), `knowledge.html` standalone (rolled
 *   into a future Drawings cabinet — Task 6).
 * Kept from existing dev nav not in prototype:
 *   asset types, discounts, document extractions, finance invoices,
 *   marketing/manager-performance + marketing/conversations,
 *   risk-radar, reports.
 */

import type { IconKey } from "@/components/dashboard/icons";
import type { DashboardNavGroup, DashboardNavItem } from "./management";

export type { DashboardNavGroup, DashboardNavItem };

const DEV = "/development-os";

/**
 * Phase 2.1 PR 1 — primary mobile tabs (Dev OS).
 *
 * See `MGMT_PRIMARY_MOBILE_TABS` in `./management.ts` for rationale.
 * Five-slot tabbar; 5th slot is always "More".
 */
export const DEV_PRIMARY_MOBILE_TABS = [
  "/development-os",
  "/development-os/projects",
  "/development-os/boq",
  "/development-os/ai-agents",
] as const;

export const DEV_DASHBOARD_NAV: DashboardNavGroup[] = [
  {
    title: "COMMAND CENTER",
    icon: "home" as IconKey,
    items: [{ href: `${DEV}`, label: "Overview" }],
  },
  {
    title: "CABINETS",
    icon: "briefcase" as IconKey,
    items: [
      { href: `${DEV}/cabinets/my-cabinet`, label: "My cabinet" },
      { href: `${DEV}/cabinets/project-manager`, label: "Project manager" },
      { href: `${DEV}/cabinets/cfo-accountant`, label: "CFO / Accountant" },
      { href: `${DEV}/cabinets/qs`, label: "QS / Cost analyst" },
      { href: `${DEV}/cabinets/procurement-manager`, label: "Procurement manager" },
      { href: `${DEV}/cabinets/warehouse-manager`, label: "Warehouse manager" },
      { href: `${DEV}/cabinets/site-supervisor`, label: "Site supervisor" },
      { href: `${DEV}/cabinets/marketing-staff`, label: "Marketing staff" },
      { href: `${DEV}/cabinets/sales-manager`, label: "Sales manager" },
    ],
  },
  {
    title: "AI AGENTS",
    icon: "sparkles" as IconKey,
    items: [
      { href: `${DEV}/ai-agents`, label: "Hub" },
      { href: `${DEV}/ai-agents/inbox`, label: "Inbox" },
      { href: `${DEV}/ai-agents/qs-cost-analyst`, label: "QS Cost Analyst" },
      { href: `${DEV}/ai-agents/procurement-analyst`, label: "Procurement Analyst" },
      { href: `${DEV}/ai-agents/tax-assistant`, label: "Tax Assistant" },
      { href: `${DEV}/ai-agents/daily-digest`, label: "Daily Digest" },
      { href: `${DEV}/ai-agents/weekly-plan`, label: "Weekly Plan" },
      { href: `${DEV}/ai-agents/marketing-assistant`, label: "Marketing Assistant" },
      { href: `${DEV}/ai-agents/executive-business`, label: "Executive Business" },
      { href: `${DEV}/ai-agents/memory`, label: "Project Memory" },
    ],
  },
  {
    title: "EXECUTIVE",
    icon: "chart" as IconKey,
    items: [
      { href: `${DEV}/dashboard`, label: "Executive dashboard" },
      { href: `${DEV}/reports`, label: "Visual reports" },
      { href: `${DEV}/risk-radar`, label: "Risk radar" },
      { href: `${DEV}/digests`, label: "Daily digests" },
    ],
  },
  {
    title: "BUILD · SELL",
    icon: "hammer" as IconKey,
    items: [
      { href: `${DEV}/projects`, label: "Projects" },
      { href: `${DEV}/assets`, label: "Assets" },
      { href: `${DEV}/asset-types`, label: "Asset types" },
      { href: `${DEV}/site-reports`, label: "Site reports" },
      { href: `${DEV}/sales`, label: "Sales & buyers" },
      { href: `${DEV}/reservations`, label: "Reservations" },
      { href: `${DEV}/contracts`, label: "Contracts" },
      { href: `${DEV}/invoices`, label: "Invoices" },
      { href: `${DEV}/discounts`, label: "Discounts" },
    ],
  },
  {
    title: "CAPITAL",
    icon: "receipt" as IconKey,
    items: [
      { href: `${DEV}/finance`, label: "Finance" },
      { href: `${DEV}/finance/invoices`, label: "Invoices" },
      { href: `${DEV}/finance/tax-types`, label: "Tax types" },
      { href: `${DEV}/finance/tax-reports`, label: "Tax reports" },
      { href: `${DEV}/finance/shared-costs`, label: "Shared costs" },
      { href: `${DEV}/finance/document-extractions`, label: "Document extractions" },
      { href: `${DEV}/investors`, label: "Investors" },
      { href: `${DEV}/commitments`, label: "Commitments" },
      { href: `${DEV}/distributions`, label: "Distributions" },
      { href: `${DEV}/revenue-streams`, label: "Revenue streams" },
    ],
  },
  {
    title: "STRATEGIC",
    icon: "radar" as IconKey,
    items: [
      { href: `${DEV}/project-cycle`, label: "Project cycle intel." },
    ],
  },
  {
    title: "OPERATIONS",
    icon: "truck" as IconKey,
    items: [
      { href: `${DEV}/vendors`, label: "Vendors" },
      { href: `${DEV}/materials`, label: "Materials" },
      // deliveries + safety-incidents pages dropped in this commit —
      // prototype lists them but the routes don't exist yet. They'll
      // reappear when those cabinet pages ship.
    ],
  },
  {
    title: "MARKETING",
    icon: "msg" as IconKey,
    items: [
      { href: `${DEV}/marketing/dashboard`, label: "Marketing dash" },
      { href: `${DEV}/marketing/lead-sources`, label: "Lead sources" },
      { href: `${DEV}/marketing/campaigns`, label: "Campaigns" },
      { href: `${DEV}/marketing/content`, label: "Content pipeline" },
      { href: `${DEV}/marketing/conversations`, label: "Conversations" },
      { href: `${DEV}/marketing/manager-performance`, label: "Manager performance" },
    ],
  },
  {
    title: "SCHEDULE · KNOWLEDGE",
    icon: "cal" as IconKey,
    items: [
      { href: `${DEV}/schedule`, label: "Schedule" },
      { href: `${DEV}/cabinets/qs#boq`, label: "BOQ" },
    ],
  },
  {
    title: "COMMUNICATIONS · SETTINGS",
    icon: "cog" as IconKey,
    items: [
      { href: `${DEV}/settings`, label: "Settings" },
      { href: `${DEV}/platform`, label: "Platform" },
    ],
  },
];

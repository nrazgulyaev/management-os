/**
 * Sprint _handoff/ Task 5 — Management OS sidebar nav.
 *
 * Hybrid synthesis (operator-locked Option C):
 *   - Group labels + ordering: prototype `_handoff/_shared/mgmt-shell.html`
 *     (WORKSPACE / PORTFOLIO / BOOKINGS / GUEST STAYS / OWNER STAYS /
 *     FRONT OFFICE / OPERATIONS / INVENTORY · PROCUREMENT / UTILITIES &
 *     MAINTENANCE / FINANCE / REVENUE / INTELLIGENCE / INTEGRATIONS /
 *     SECURITY · SYSTEM)
 *   - Items: every link points at a real Next.js route that exists in
 *     `src/app/(dashboard)/*`. Where the prototype lists routes that
 *     don't exist (`villas.html`, `shares.html`, `availability.html`'s
 *     `#readiness`, `system.html`, etc.) the items are dropped silently;
 *     where the existing nav has critical surfaces the prototype omits
 *     (Transactions, Bank accounts, Cost categories, Projects, Villas,
 *     Procurement vendors) we keep them.
 *
 * Icons are STRING KEYS into `src/components/dashboard/icons.tsx`'s
 * `ICONS` registry, NOT lucide component references — this is the
 * HF-12 pattern (component refs can't serialize as RSC → client
 * props). Sidebar.tsx looks the key up and emits inline SVG.
 *
 * Closure delta vs prototype + delta vs the previous `src/config/
 * navigation.ts dashboardNav`:
 *
 *  Dropped from prototype (no matching route in src/app/(dashboard)/):
 *    villas.html, shares.html, villa-guides nav row (rolled into
 *    Guest stays · Villa guides existing tree), `gs-overview` (rolled
 *    into Guest stays Overview), `os-overview/policies/finance`'s
 *    `#requests` anchor (subpages exist), `availability.html`,
 *    `front-office.html`'s `#in-house`, `system.html`,
 *    `notifications.html` separated anchors.
 *  Kept from existing dashboardNav not in prototype:
 *    Owner intelligence (live cabinet shipped Stage 10.6), Dynamic
 *    pricing (live), Direct bookings (live), Service fulfilment,
 *    Payments providers/webhooks, Inventory locations/categories/
 *    counts, Procurement requests/orders, Documents.
 */

import type { IconKey } from "@/components/dashboard/icons";

export interface DashboardNavItem {
  href: string;
  label: string;
  badge?: string;
}

export interface DashboardNavGroup {
  /** Uppercase title for the sidebar group divider (prototype style:
   *  `JetBrains Mono` 9.5px / 0.18em tracking). */
  title: string;
  /** Optional icon-key alongside the title. Most groups in the
   *  prototype carry an icon-glyph in the group header — kept here
   *  so the sidebar can render `{icon} TITLE`. */
  icon?: IconKey;
  items: DashboardNavItem[];
}

/**
 * Phase 2.1 PR 1 — primary mobile tabs.
 *
 * 4 hrefs that occupy the first 4 slots of the mobile tabbar
 * (template 01). The 5th slot is always "More" → opens a Radix
 * bottom sheet listing every other nav item. Order matches the
 * tabbar's left-to-right grid.
 *
 * String-only on purpose (HF-12 pattern) — labels + icons live in
 * `src/components/dashboard/mobile-tabbar.tsx`, which can hold
 * React refs without serialization concerns.
 */
export const MGMT_PRIMARY_MOBILE_TABS = [
  "/dashboard",
  "/dashboard/bookings",
  "/dashboard/guests",
  "/dashboard/finance",
] as const;

export const MGMT_DASHBOARD_NAV: DashboardNavGroup[] = [
  {
    title: "WORKSPACE",
    icon: "home",
    items: [{ href: "/dashboard", label: "Overview" }],
  },
  {
    title: "PORTFOLIO",
    icon: "port",
    items: [
      { href: "/dashboard/projects", label: "Projects" },
      { href: "/dashboard/villas", label: "Villas" },
      { href: "/dashboard/owners", label: "Owners" },
      { href: "/dashboard/shares", label: "Ownership shares" },
    ],
  },
  {
    title: "BOOKINGS",
    icon: "cal",
    items: [
      { href: "/dashboard/bookings", label: "Bookings" },
      { href: "/dashboard/bookings/calendar", label: "Calendar" },
      { href: "/dashboard/bookings/sync", label: "Sync" },
      { href: "/dashboard/bookings/rates", label: "Rate plans" },
      { href: "/dashboard/channels", label: "Channels" },
      { href: "/dashboard/guests", label: "Guests" },
    ],
  },
  {
    title: "GUEST STAYS",
    icon: "guest",
    items: [
      { href: "/dashboard/guest-stays", label: "Overview" },
      { href: "/dashboard/guest-stays/tokens", label: "Tokens" },
      { href: "/dashboard/villa-guides", label: "Villa guides" },
      { href: "/dashboard/guest-services", label: "Services" },
      { href: "/dashboard/guest-services/orders", label: "Service orders" },
      { href: "/dashboard/concierge", label: "Concierge" },
      { href: "/dashboard/guest-stays/security", label: "Security events" },
    ],
  },
  {
    title: "OWNER STAYS",
    icon: "bed",
    items: [
      { href: "/dashboard/owner-stays", label: "Overview" },
      { href: "/dashboard/owner-stays/requests", label: "Requests" },
      { href: "/dashboard/owner-stays/policies", label: "Policies" },
      { href: "/dashboard/owner-stays/finance-bridge", label: "Finance bridge" },
    ],
  },
  {
    title: "FRONT OFFICE",
    icon: "home",
    items: [
      { href: "/dashboard/front-office", label: "Today" },
      { href: "/dashboard/front-office/arrivals", label: "Arrivals" },
      { href: "/dashboard/front-office/departures", label: "Departures" },
      { href: "/dashboard/front-office/in-house", label: "In-house" },
      { href: "/dashboard/availability", label: "Availability" },
      { href: "/dashboard/readiness", label: "Readiness" },
    ],
  },
  {
    title: "OPERATIONS",
    icon: "wrench",
    items: [
      { href: "/dashboard/operations", label: "Command center" },
      { href: "/dashboard/operations/tasks", label: "Tasks" },
      { href: "/dashboard/operations/housekeeping", label: "Housekeeping" },
      { href: "/dashboard/operations/maintenance", label: "Maintenance" },
      { href: "/dashboard/operations/preventive", label: "Preventive" },
      { href: "/dashboard/operations/service-requests", label: "Service requests" },
    ],
  },
  {
    title: "INVENTORY · PROCUREMENT",
    icon: "pkg",
    items: [
      { href: "/dashboard/inventory", label: "Stock command" },
      { href: "/dashboard/inventory/items", label: "Items" },
      { href: "/dashboard/inventory/movements", label: "Movements" },
      { href: "/dashboard/inventory/suppliers", label: "Suppliers" },
      { href: "/dashboard/procurement/requests", label: "Purchase requests" },
      { href: "/dashboard/procurement/orders", label: "Purchase orders" },
    ],
  },
  {
    title: "UTILITIES & MAINTENANCE",
    icon: "bolt",
    items: [
      { href: "/dashboard/maintenance-intelligence", label: "Maintenance intel." },
      { href: "/dashboard/maintenance-intelligence/templates", label: "Templates" },
      { href: "/dashboard/maintenance-intelligence/risks", label: "Risk feed" },
      { href: "/dashboard/utilities", label: "Utilities" },
      { href: "/dashboard/utilities/accounts", label: "Accounts" },
      { href: "/dashboard/utilities/readings", label: "Readings" },
    ],
  },
  {
    title: "FINANCE",
    icon: "receipt",
    items: [
      { href: "/dashboard/finance", label: "Finance" },
      { href: "/dashboard/finance/transparency", label: "Statement transparency" },
      { href: "/dashboard/finance/material-usage", label: "Material usage bridge" },
      { href: "/dashboard/payments", label: "Payments" },
      { href: "/dashboard/payments/webhooks", label: "Webhooks" },
    ],
  },
  {
    title: "REVENUE",
    icon: "chart",
    items: [
      { href: "/dashboard/owner-intelligence", label: "Owner intelligence" },
      { href: "/dashboard/pricing", label: "Dynamic pricing" },
      { href: "/dashboard/direct-bookings", label: "Direct bookings" },
      { href: "/dashboard/guest-journey", label: "Guest journey" },
      { href: "/dashboard/service-fulfilment", label: "Service fulfilment" },
    ],
  },
  {
    title: "INTELLIGENCE",
    icon: "sparkles",
    items: [
      { href: "/dashboard/ai", label: "AI assistants", badge: "8" },
      { href: "/dashboard/documents", label: "Documents" },
    ],
  },
  {
    title: "INTEGRATIONS",
    icon: "link",
    items: [
      { href: "/dashboard/integrations", label: "Calendar feeds" },
      { href: "/dashboard/integrations/conflicts", label: "Conflicts" },
      { href: "/dashboard/integrations/automation", label: "Automation rules" },
    ],
  },
  {
    title: "SECURITY · SYSTEM",
    icon: "shield",
    items: [
      { href: "/dashboard/security", label: "Security" },
      { href: "/dashboard/security/auth", label: "Authentication" },
      { href: "/dashboard/jobs", label: "Background jobs" },
      { href: "/dashboard/system/health", label: "System health" },
      { href: "/dashboard/notifications", label: "Notifications" },
      { href: "/dashboard/audit", label: "Audit log" },
      { href: "/dashboard/settings", label: "Settings" },
    ],
  },
];

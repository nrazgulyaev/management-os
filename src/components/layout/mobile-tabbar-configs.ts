/**
 * Arconique OS redesign — MobileTabbar configurations.
 *
 * Pure-data nav-item arrays for the two shells. Server-safe by
 * construction — no lucide-react imports, no component refs, no
 * functions; the icon field is a string key that `MobileTabbar`'s
 * client-side `ICON_REGISTRY` resolves at render time.
 *
 * HF-12 fix — the original config imported lucide forwardRef
 * components directly into `icon: Home` etc. and that array crossed
 * the RSC boundary inside the server-rendered shell → `Cannot
 * serialize a forwardRef`. Production digest 1715506935.
 *
 * 5–6 icons per the handoff (COMPONENTS.md §12): Home / Bookings /
 * Ops / Concierge / Copilot for Mgmt; Command / Projects /
 * Procurement / Finance / Agents for Dev.
 */

import type { MobileTabbarItem } from "@/components/ui/primitives/mobile-tabbar";

export const MGMT_TABBAR_ITEMS: MobileTabbarItem[] = [
  { href: "/dashboard", icon: "home", label: "Overview" },
  { href: "/dashboard/bookings", icon: "calendar-days", label: "Bookings" },
  { href: "/dashboard/operations", icon: "kanban-square", label: "Operations" },
  { href: "/dashboard/concierge", icon: "users", label: "Concierge" },
  { href: "/dashboard/ai", icon: "sparkles", label: "Copilot" },
];

export const DEV_TABBAR_ITEMS: MobileTabbarItem[] = [
  { href: "/development-os", icon: "layout-dashboard", label: "Command" },
  { href: "/development-os/projects", icon: "hammer", label: "Projects" },
  { href: "/development-os/procurement", icon: "package-open", label: "Procurement" },
  { href: "/development-os/finance", icon: "banknote", label: "Finance" },
  { href: "/development-os/ai-agents", icon: "sparkles", label: "Agents" },
];

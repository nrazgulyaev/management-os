/**
 * Arconique OS redesign — MobileTabbar configurations.
 *
 * Static, server-safe nav-item arrays for the two shells. Lives
 * outside any "use client" file so server-rendered shells can import
 * them without dragging Mobile-tabbar's client hooks across the
 * RSC boundary. Each shell imports the matching `MGMT_TABBAR_ITEMS`
 * / `DEV_TABBAR_ITEMS` and passes them to `<MobileTabbar items>`.
 *
 * 5–6 icons per the handoff (COMPONENTS.md §12): Home / Bookings /
 * Ops / Copilot for Mgmt; Command / Projects / Procure / Agents for
 * Dev. We round each list up to a clean 5 destinations.
 */

import {
  Banknote,
  CalendarDays,
  Hammer,
  Home,
  KanbanSquare,
  LayoutDashboard,
  PackageOpen,
  Sparkles,
  Users,
} from "lucide-react";
import type { MobileTabbarItem } from "@/components/ui/primitives/mobile-tabbar";

export const MGMT_TABBAR_ITEMS: MobileTabbarItem[] = [
  { href: "/dashboard", icon: Home, label: "Overview" },
  { href: "/dashboard/bookings", icon: CalendarDays, label: "Bookings" },
  { href: "/dashboard/operations", icon: KanbanSquare, label: "Operations" },
  { href: "/dashboard/concierge", icon: Users, label: "Concierge" },
  { href: "/dashboard/ai", icon: Sparkles, label: "Copilot" },
];

export const DEV_TABBAR_ITEMS: MobileTabbarItem[] = [
  { href: "/development-os", icon: LayoutDashboard, label: "Command" },
  { href: "/development-os/projects", icon: Hammer, label: "Projects" },
  { href: "/development-os/procurement", icon: PackageOpen, label: "Procurement" },
  { href: "/development-os/finance", icon: Banknote, label: "Finance" },
  { href: "/development-os/ai-agents", icon: Sparkles, label: "Agents" },
];

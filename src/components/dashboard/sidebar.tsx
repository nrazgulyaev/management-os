import * as React from "react";
import Link from "next/link";
import {
  MGMT_DASHBOARD_NAV,
  type DashboardNavGroup,
  type DashboardNavItem,
} from "@/config/dashboard-nav";
import { getCabinetAccess } from "@/features/keystone/access";
import { cabinetForNavHref } from "@/features/keystone/matrix";
import { DashboardIcon } from "./icons";
import { ActiveSidebarLink } from "./active-sidebar-link";

/**
 * Sprint _handoff/ Task 5 — Management OS sidebar.
 *
 * Server component. Renders the brand block, workspace tile, and
 * the nav tree (14 groups, ~70 items) per the
 * `_handoff/_shared/mgmt-shell.html` prototype. Each leaf row is an
 * `<ActiveSidebarLink>` — a tiny client island that reads
 * `usePathname()` for the active state — so the bulk stays
 * server-rendered.
 *
 * Class names map to `[data-product="management"] .sidebar` /
 * `.sb-group` / `.sb-item` in `src/app/globals.css`. The layout
 * wrapper sets `<html data-product="management">` (via the
 * middleware-stamped `x-product` header), so this component is
 * intentionally palette-agnostic.
 *
 * The mobile breakpoint (≤ 900px) hides this sidebar via globals.css
 * — HF-12 `MobileTabbar` takes over on small screens.
 */

interface SidebarProps {
  workspaceLabel?: string;
  workspaceSubtitle?: string;
}

export async function DashboardSidebar({
  workspaceLabel = "Arconique workspace",
  workspaceSubtitle,
}: SidebarProps = {}) {
  // Block 08 — the override-aware "who-sees-what" matrix now actually
  // filters the nav. A role that an admin un-ticked for a cabinet no
  // longer sees that nav row. Demo mode / super-admin see everything.
  // A resolve failure must never blank the whole sidebar, so we fall
  // back to showing every group/item.
  let canSee: (cabinetKey: string) => boolean = () => true;
  try {
    const access = await getCabinetAccess();
    canSee = access.canSee;
  } catch {
    canSee = () => true;
  }

  const visibleGroups = MGMT_DASHBOARD_NAV.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      const cabinet = cabinetForNavHref(item.href);
      return cabinet === null || canSee(cabinet);
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="sidebar">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5"
      >
        <span className="text-[var(--forest,var(--ink))]">
          <DashboardIcon name="logo" width={22} height={22} />
        </span>
        <span className="font-display text-[20px] text-ink">Arconique</span>
        <span className="badge text-[9px] px-1.5 py-px">MGMT</span>
      </Link>

      <div className="pt-1 px-[18px] pb-3">
        <div className="px-3 py-2.5 bg-[var(--cream-deep,var(--bg-2))] rounded-[10px]">
          <div className="label text-[9.5px]">Workspace</div>
          <div className="font-display text-[16px] mt-0.5">{workspaceLabel}</div>
          {workspaceSubtitle && (
            <div className="text-[11px] text-ink-3 mt-0.5">
              {workspaceSubtitle}
            </div>
          )}
        </div>
      </div>

      {visibleGroups.map((g) => (
        <DashboardSidebarGroup key={g.title} group={g} />
      ))}
    </aside>
  );
}

function DashboardSidebarGroup({ group }: { group: DashboardNavGroup }) {
  return (
    <div className="sb-group">
      <div className="sb-group-title">
        {group.icon && (
          <DashboardIcon name={group.icon} width={12} height={12} />
        )}
        {group.title}
      </div>
      {group.items.map((item) => (
        <DashboardSidebarItem key={item.href} item={item} />
      ))}
    </div>
  );
}

function DashboardSidebarItem({ item }: { item: DashboardNavItem }) {
  return (
    <ActiveSidebarLink
      href={item.href}
      exactOnly={item.href === "/dashboard"}
    >
      {item.label}
      {item.badge && <span className="sb-badge">{item.badge}</span>}
    </ActiveSidebarLink>
  );
}

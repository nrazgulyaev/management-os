import * as React from "react";
import Link from "next/link";
import {
  MGMT_DASHBOARD_NAV,
  type DashboardNavGroup,
  type DashboardNavItem,
} from "@/config/dashboard-nav";
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

export function DashboardSidebar({
  workspaceLabel = "Arconique workspace",
  workspaceSubtitle,
}: SidebarProps = {}) {
  return (
    <aside className="sidebar">
      <Link
        href="/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px 18px 14px",
        }}
      >
        <span style={{ color: "var(--forest, var(--ink))" }}>
          <DashboardIcon name="logo" width={22} height={22} />
        </span>
        <span
          style={{
            fontFamily: "var(--font-newsreader), serif",
            fontSize: 20,
            color: "var(--ink)",
          }}
        >
          Arconique
        </span>
        <span className="badge" style={{ fontSize: 9, padding: "1px 6px" }}>
          MGMT
        </span>
      </Link>

      <div style={{ padding: "4px 18px 12px" }}>
        <div
          style={{
            padding: "10px 12px",
            background: "var(--cream-deep, var(--bg-2))",
            borderRadius: 10,
          }}
        >
          <div className="label" style={{ fontSize: 9.5 }}>
            Workspace
          </div>
          <div
            style={{
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 16,
              marginTop: 2,
            }}
          >
            {workspaceLabel}
          </div>
          {workspaceSubtitle && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              {workspaceSubtitle}
            </div>
          )}
        </div>
      </div>

      {MGMT_DASHBOARD_NAV.map((g) => (
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

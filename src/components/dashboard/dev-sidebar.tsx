import * as React from "react";
import Link from "next/link";
import {
  DEV_DASHBOARD_NAV,
  type DashboardNavGroup,
  type DashboardNavItem,
} from "@/config/development-nav";
import { DashboardIcon } from "./icons";
import { ActiveSidebarLink } from "./active-sidebar-link";

/**
 * Sprint _handoff/ Task 5 — Development OS sidebar.
 *
 * Mirror of Mgmt's `DashboardSidebar` (same shape, same client island
 * for the active-link state) but driven by `DEV_DASHBOARD_NAV` and
 * rendering the dev-shell prototype's brand + workspace block. Class
 * names map to `[data-product="development"]` rules in globals.css so
 * the amber/concrete palette resolves automatically when the layout
 * sets `data-product="development"` on its wrapper.
 *
 * Lives under `components/dashboard/` rather than `components/development/`
 * because the implementation is intentionally cross-product — the only
 * differences between Mgmt and Dev sidebars are the nav config (which
 * we import per surface) and the brand mark variant.
 */

interface DevSidebarProps {
  workspaceLabel?: string;
  workspaceSubtitle?: string;
}

export function DevelopmentSidebar({
  workspaceLabel = "Arconique workspace",
  workspaceSubtitle,
}: DevSidebarProps = {}) {
  return (
    <aside className="sidebar">
      <Link
        href="/development-os"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px 18px 14px",
        }}
      >
        <span style={{ color: "var(--amber, var(--ink))" }}>
          <DashboardIcon name="logoMark" width={22} height={22} />
        </span>
        <span
          style={{
            fontFamily: "var(--font-space), sans-serif",
            fontSize: 18,
            color: "var(--ink)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          ARCONIQUE
        </span>
        <span
          className="badge"
          style={{ fontSize: 9, padding: "1px 6px" }}
        >
          DEV.OS
        </span>
      </Link>

      <div style={{ padding: "4px 18px 12px" }}>
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-2, var(--cream-deep))",
            borderRadius: 10,
            border: "1px solid var(--line, var(--line-2))",
          }}
        >
          <div className="label" style={{ fontSize: 9.5 }}>
            Workspace
          </div>
          <div
            style={{
              fontFamily: "var(--font-space), sans-serif",
              fontSize: 15,
              marginTop: 2,
              fontWeight: 500,
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

      {DEV_DASHBOARD_NAV.map((g) => (
        <DevSidebarGroup key={g.title} group={g} />
      ))}
    </aside>
  );
}

function DevSidebarGroup({ group }: { group: DashboardNavGroup }) {
  return (
    <div className="sb-group">
      <div className="sb-group-title">
        {group.icon && (
          <DashboardIcon name={group.icon} width={12} height={12} />
        )}
        {group.title}
      </div>
      {group.items.map((item) => (
        <DevSidebarItem key={item.href} item={item} />
      ))}
    </div>
  );
}

function DevSidebarItem({ item }: { item: DashboardNavItem }) {
  return (
    <ActiveSidebarLink
      href={item.href}
      exactOnly={item.href === "/development-os"}
    >
      {item.label}
      {item.badge && <span className="sb-badge">{item.badge}</span>}
    </ActiveSidebarLink>
  );
}

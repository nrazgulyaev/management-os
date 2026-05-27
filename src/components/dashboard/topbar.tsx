"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardIcon } from "./icons";

/**
 * Sprint _handoff/ Task 5 — Management OS topbar.
 *
 * Client component because it derives breadcrumbs from
 * `usePathname()`. The server-rendered DashboardShell still controls
 * the data: `unreadCount`, `userName`, `userRole`, etc. arrive as
 * plain string props (no functions, no forwardRefs — clean across
 * the RSC boundary).
 *
 * Layout matches the `_handoff/_shared/mgmt-shell.html` prototype:
 * breadcrumb trail → search pill (320px) → action button slot → bell
 * → user chip. Honors the constraint that the existing helpers
 * (`countUnreadForCurrentUser`, `getCurrentUserContext`) keep
 * sourcing the data — this component is just presentation.
 */

interface TopbarProps {
  unreadCount?: number;
  userName?: string;
  userRole?: string;
  userInitials?: string;
  /**
   * DAILY-DIGEST-SPRINT-1 P4.5 — where the bell click navigates.
   * Mgmt OS keeps the historical `/dashboard/notifications/inbox`
   * (the operational notifications surface). Dev OS overrides with
   * `/development-os/agent-digests` (the digest surface — Dev OS
   * has no parallel operational inbox today).
   */
  inboxHref?: string;
  /** Optional slot in the action area — keeps WorkspaceSwitcher / AI
   *  hub buttons reachable without baking them into this file. */
  actions?: React.ReactNode;
  /** Override the auto-derived breadcrumb chain — useful for pages
   *  whose URL doesn't capture the navigation context (e.g. modals). */
  breadcrumbs?: string[];
}

export function DashboardTopbar({
  unreadCount = 0,
  userName = "Workspace",
  userRole = "Operator",
  userInitials = "AR",
  inboxHref = "/dashboard/notifications/inbox",
  actions,
  breadcrumbs,
}: TopbarProps) {
  const pathname = usePathname() ?? "";
  const trail = breadcrumbs ?? deriveBreadcrumbs(pathname);
  return (
    <header className="topbar">
      <div className="crumb">
        {trail.map((label, i) => (
          <React.Fragment key={`${label}-${i}`}>
            {i === trail.length - 1 ? <b>{label}</b> : <span>{label}</span>}
            {i < trail.length - 1 && <span>/</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <div className="topbar-search hide-mobile">
          <span className="sx">
            <DashboardIcon name="search" width={14} height={14} />
          </span>
          <input placeholder="Search villa, booking, owner, guest…" />
          <span className="kbd absolute right-2.5 top-1.5">⌘K</span>
        </div>
        {actions}
        <Link
          href={inboxHref}
          aria-label={`Inbox · ${unreadCount} unread`}
          className="relative p-1.5 text-ink-2 inline-flex"
        >
          <DashboardIcon name="bell" width={17} height={17} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full bg-[var(--terra,var(--amber))]" />
          )}
        </Link>
        <div className="flex items-center gap-2 pl-2 border-l border-line">
          <div className="w-[30px] h-[30px] rounded-full bg-[linear-gradient(135deg,var(--gold,#BC9A5C),var(--terra,#C4583C))] flex items-center justify-center text-[var(--cream-warm,#FAF7F1)] text-[11px] font-medium">
            {userInitials}
          </div>
          <div className="flex flex-col leading-[1.1]">
            <span className="text-[13px] font-medium">{userName}</span>
            <span className="text-[10.5px] text-ink-3">{userRole}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Best-effort breadcrumb extraction from the current pathname.
 *  `/dashboard/finance/expenses` → ["Workspace", "Finance", "Expenses"].
 *  Keeps the trail short — drops UUID-looking segments and decodes
 *  hyphens to spaces with title-case. */
function deriveBreadcrumbs(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return ["Workspace"];
  const out: string[] = ["Workspace"];
  let consumedDashboard = false;
  for (const seg of segments) {
    if (!consumedDashboard) {
      if (seg === "dashboard") {
        consumedDashboard = true;
        continue;
      }
    }
    if (looksLikeId(seg)) continue;
    out.push(titleCase(seg));
  }
  return out;
}

function looksLikeId(s: string): boolean {
  return /^[0-9a-f]{8}-?[0-9a-f]{4}/.test(s) || /^\d{6,}$/.test(s);
}

function titleCase(s: string): string {
  return s
    .split("-")
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

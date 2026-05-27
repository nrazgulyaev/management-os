import * as React from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { countUnreadForCurrentUser } from "@/features/notifications/services";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { getCurrentOrgTrial } from "@/features/billing/trial-services";
import { TrialBanner } from "@/components/billing/trial-banner";
import { MobileTabbar } from "@/components/dashboard/mobile-tabbar";
import { AppSwitcher } from "./app-switcher";

/**
 * Sprint _handoff/ Task 5 — Mgmt OS dashboard shell.
 *
 * Wires the new _handoff/-style Sidebar + Topbar
 * (`src/components/dashboard/*`) around every `(dashboard)/*` page.
 * All existing server data fetching is preserved:
 *
 *   - getCurrentUserContext()        → name/role/initials in topbar
 *   - countUnreadForCurrentUser()    → bell badge
 *   - getCurrentOrgTrial()           → TrialBanner above topbar
 *
 * Cross-product navigation lives in `AppSwitcher` (Mgmt ↔ Dev),
 * mounted in the topbar's `actions` slot. Product gating is enforced
 * upstream by `enforceProductAccess("mgmt")` in the layout.
 *
 * HF-12 MobileTabbar stays mounted unchanged — desktop sidebar hides
 * at ≤ 900px (CSS in globals.css) and MobileTabbar takes over.
 *
 * The wrapper element sets `data-product="management"` so the new
 * product-scoped CSS variables + classes (`.sidebar`, `.sb-item`,
 * `.topbar`, `.kpi`, …) resolve correctly even for apex traffic that
 * hits /dashboard/* directly without going through the middleware
 * x-product header.
 */
export async function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  let unreadCount = 0;
  try {
    unreadCount = await countUnreadForCurrentUser();
  } catch {
    unreadCount = 0;
  }

  let trial: Awaited<ReturnType<typeof getCurrentOrgTrial>> = null;
  try {
    trial = await getCurrentOrgTrial();
  } catch {
    trial = null;
  }

  // Stage 10 — pull a display name + role for the topbar user chip.
  // Always safe; falls back to demo values when DB / auth isn't wired.
  let userName = "Operator";
  let userRole = "Manager";
  let userInitials = "AR";
  try {
    const ctx = await getCurrentUserContext();
    if (ctx.appUser?.fullName) {
      userName = ctx.appUser.fullName;
      userInitials = computeInitials(ctx.appUser.fullName);
    }
    if (ctx.roles.length > 0) {
      userRole = humaniseRole(ctx.roles[0]);
    }
  } catch {
    // keep fallbacks
  }

  return (
    <div
      data-product="management"
      style={{ display: "flex", minHeight: "100vh", background: "var(--cream, var(--bg))" }}
    >
      <DashboardSidebar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {trial && <TrialBanner state={trial.state} />}
        <DashboardTopbar
          unreadCount={unreadCount}
          userName={userName}
          userRole={userRole}
          userInitials={userInitials}
          actions={<AppSwitcher />}
        />
        <main
          style={{
            flex: 1,
            padding: "24px 28px 96px",
            maxWidth: 1480,
            width: "100%",
          }}
        >
          {children}
        </main>
      </div>
      {/* HF-12 — desktop sidebar hides ≤ 900px, MobileTabbar takes
          over. Phase 2.1 PR 1 swapped the floating-pill primitive for
          the template-01 bottom-bar component (5 slots + More sheet).
          Tabs + sheet read from `MGMT_PRIMARY_MOBILE_TABS` +
          `MGMT_DASHBOARD_NAV` so config stays the single source of
          truth. */}
      <MobileTabbar />
    </div>
  );
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "AR";
}

function humaniseRole(roleKey: string): string {
  return roleKey
    .split("_")
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

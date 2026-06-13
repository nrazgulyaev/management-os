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
  // PERF: the three independent reads run in parallel (one wall-clock round
  // trip instead of three serial ones). allSettled keeps each read's
  // individual fallback. They share the now-cache()'d auth lookup, so no
  // redundant Supabase round-trip either.
  const [unreadRes, trialRes, ctxRes] = await Promise.allSettled([
    countUnreadForCurrentUser(),
    getCurrentOrgTrial(),
    getCurrentUserContext(),
  ]);

  const unreadCount = unreadRes.status === "fulfilled" ? unreadRes.value : 0;
  const trial: Awaited<ReturnType<typeof getCurrentOrgTrial>> =
    trialRes.status === "fulfilled" ? trialRes.value : null;

  // Stage 10 — pull a display name + role for the topbar user chip.
  // Always safe; falls back to demo values when DB / auth isn't wired.
  let userName = "Operator";
  let userRole = "Manager";
  let userInitials = "AR";
  if (ctxRes.status === "fulfilled") {
    const ctx = ctxRes.value;
    if (ctx.appUser?.fullName) {
      userName = ctx.appUser.fullName;
      userInitials = computeInitials(ctx.appUser.fullName);
    }
    if (ctx.roles.length > 0) {
      userRole = humaniseRole(ctx.roles[0]);
    }
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

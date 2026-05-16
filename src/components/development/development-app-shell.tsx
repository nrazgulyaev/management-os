import * as React from "react";
import { DevelopmentSidebar } from "@/components/dashboard/dev-sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { OfflineIndicator } from "./pwa/offline-indicator";
import { InstallPrompt } from "./pwa/install-prompt";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { getCurrentOrgTrial } from "@/features/billing/trial-services";
import { TrialBanner } from "@/components/billing/trial-banner";
import { MobileTabbar } from "@/components/ui/primitives/mobile-tabbar";
import { DEV_TABBAR_ITEMS } from "@/components/layout/mobile-tabbar-configs";
import { AppSwitcher } from "@/components/layout/app-switcher";

/**
 * Sprint _handoff/ Task 5 — Development OS shell.
 *
 * Layered on the new _handoff/-style sidebar + topbar (shared with
 * Mgmt — same `DashboardTopbar` component, different sidebar nav
 * via `DevelopmentSidebar`). Existing helpers preserved:
 *
 *   - getCurrentUserContext()  → user chip
 *   - getCurrentOrgTrial()     → TrialBanner
 *   - OfflineIndicator + InstallPrompt → PWA niceties stay mounted
 *
 * `data-product="development"` wrapper ensures the amber/concrete
 * palette + dev-shell CSS classes resolve correctly even for direct
 * apex traffic (apex /development-os/* without an x-product header).
 *
 * HF-12 MobileTabbar unchanged.
 */
export async function DevelopmentAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  let trial: Awaited<ReturnType<typeof getCurrentOrgTrial>> = null;
  try {
    trial = await getCurrentOrgTrial();
  } catch {
    trial = null;
  }

  let userName = "Operator";
  let userRole = "Developer";
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
      data-product="development"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg, var(--cream))",
      }}
    >
      <DevelopmentSidebar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {trial && <TrialBanner state={trial.state} />}
        <DashboardTopbar
          unreadCount={0}
          userName={userName}
          userRole={userRole}
          userInitials={userInitials}
          actions={<AppSwitcher />}
        />
        <div
          style={{
            padding: "8px 28px 0",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <OfflineIndicator />
        </div>
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
      <InstallPrompt />
      <MobileTabbar items={DEV_TABBAR_ITEMS} />
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

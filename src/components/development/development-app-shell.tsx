import * as React from "react";
import { DevelopmentSidebar } from "@/components/dashboard/dev-sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { OfflineIndicator } from "./pwa/offline-indicator";
import { InstallPrompt } from "./pwa/install-prompt";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { canUseAppSwitcher } from "@/features/auth/products-access";
import { countUnreadForCurrentUser } from "@/features/notifications/services";
import { getCurrentOrgTrial } from "@/features/billing/trial-services";
import { TrialBanner } from "@/components/billing/trial-banner";
import { DevelopmentMobileTabbar } from "@/components/development/mobile-tabbar";
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

  // DAILY-DIGEST-SPRINT-1 P4.5 — Dev OS bell badge. countUnread is
  // UNION-extended (Phase 4.1) so it reflects digest unreads too.
  // Wrapped in try/catch so an auth/db blip doesn't break the shell.
  let unreadCount = 0;
  try {
    unreadCount = await countUnreadForCurrentUser();
  } catch {
    unreadCount = 0;
  }

  // Only the main admin of a dual-product (mgmt + dev) org gets the switcher.
  const canSwitch = await canUseAppSwitcher().catch(() => false);

  return (
    <div
      data-product="development"
      data-surface="development-os"
      className="flex min-h-screen bg-[var(--bg,var(--cream))]"
    >
      <DevelopmentSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {trial && <TrialBanner state={trial.state} />}
        <DashboardTopbar
          unreadCount={unreadCount}
          userName={userName}
          userRole={userRole}
          userInitials={userInitials}
          inboxHref="/development-os/agent-digests"
          actions={canSwitch ? <AppSwitcher /> : undefined}
        />
        <div className="pt-2 px-7 flex justify-end">
          <OfflineIndicator />
        </div>
        <main className="flex-1 px-7 pt-6 pb-24 max-w-[1480px] w-full">
          {children}
        </main>
      </div>
      <InstallPrompt />
      <DevelopmentMobileTabbar />
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

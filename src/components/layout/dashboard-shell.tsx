import * as React from "react";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardTopbar } from "./dashboard-topbar";
import { countUnreadForCurrentUser } from "@/features/notifications/services";
import { getProductsEnabledForCurrentUser } from "@/features/auth/products-access";

export async function DashboardShell({
  children,
  topbarTitle,
}: {
  children: React.ReactNode;
  topbarTitle?: string;
}) {
  // Best-effort unread count for the topbar bell. Falls back to 0 when DB
  // or auth isn't wired up.
  let unreadCount = 0;
  try {
    unreadCount = await countUnreadForCurrentUser();
  } catch {
    unreadCount = 0;
  }

  // Stage 10.H — fetch the org's product slugs server-side so the
  // cross-product switcher only lists what this user can reach.
  // null when no signed-in user / no DB — switcher then renders all 4
  // (legacy / demo behaviour).
  let enabledProducts: Awaited<
    ReturnType<typeof getProductsEnabledForCurrentUser>
  > = null;
  try {
    enabledProducts = await getProductsEnabledForCurrentUser();
  } catch {
    enabledProducts = null;
  }

  return (
    <div className="min-h-screen flex bg-canvas">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopbar
          title={topbarTitle}
          unreadCount={unreadCount}
          enabledProducts={enabledProducts}
        />
        <main className="flex-1 px-4 md:px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

import * as React from "react";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardTopbar } from "./dashboard-topbar";
import { countUnreadForCurrentUser } from "@/features/notifications/services";

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

  return (
    <div className="min-h-screen flex bg-canvas">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopbar title={topbarTitle} unreadCount={unreadCount} />
        <main className="flex-1 px-4 md:px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

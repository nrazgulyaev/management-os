import * as React from "react";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardTopbar } from "./dashboard-topbar";

export function DashboardShell({
  children,
  topbarTitle,
}: {
  children: React.ReactNode;
  topbarTitle?: string;
}) {
  return (
    <div className="min-h-screen flex bg-canvas">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopbar title={topbarTitle} />
        <main className="flex-1 px-4 md:px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

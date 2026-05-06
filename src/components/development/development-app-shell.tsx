import * as React from "react";
import { DevelopmentAppSidebar } from "./development-app-sidebar";
import { DevelopmentAppTopbar } from "./development-app-topbar";
import { OfflineIndicator } from "./pwa/offline-indicator";
import { InstallPrompt } from "./pwa/install-prompt";

/**
 * Workspace shell for the Development OS. Mirrors the structure of
 * `DashboardShell` (sidebar + topbar + main) but with its own navigation,
 * topbar, and workspace switcher — so the two operating systems read as
 * fully separate apps living under one roof.
 */
export function DevelopmentAppShell({
  children,
  topbarTitle,
}: {
  children: React.ReactNode;
  topbarTitle?: string;
}) {
  return (
    <div className="min-h-screen flex bg-canvas">
      <DevelopmentAppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DevelopmentAppTopbar title={topbarTitle} />
        <div className="px-4 md:px-8 pt-2 flex justify-end">
          <OfflineIndicator />
        </div>
        <main className="flex-1 px-4 md:px-8 py-6">{children}</main>
      </div>
      <InstallPrompt />
    </div>
  );
}

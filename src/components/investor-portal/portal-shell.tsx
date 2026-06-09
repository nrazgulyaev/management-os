import { Bell, ChevronDown, HelpCircle } from "lucide-react";
import type { PortalStrings } from "@/lib/investor-portal/translations";
import {
  PortalSidebarNav,
  PortalMobileTabbar,
  type PortalNavGroup,
  type PortalMobileTab,
} from "@/components/investor-portal/portal-sidebar-nav";

/**
 * Sidebar + topbar shell for every authenticated investor-portal page.
 *
 * Visual target: the Dev OS engineering investor mock (carbon rail, amber
 * accent, Space Grotesk display, IBM Plex Mono numbers). A 248px carbon
 * sidebar (grouped, icon nav + amber count badge + footer identity block)
 * sits beside a calm bg-2 topbar carrying the page title, the project
 * switcher and notification/help affordances. Pure server component — the
 * only client island is <PortalSidebarNav> for path-based active state.
 * The real sign-out / language controls remain on the profile page.
 */
export function PortalShell({
  strings,
  investorName,
  investorCode,
  pageTitle,
  children,
}: {
  strings: PortalStrings;
  investorName: string;
  investorCode: string;
  /** Topbar h1; falls back to the dashboard label. */
  pageTitle?: string;
  children: React.ReactNode;
}) {
  const navGroups: PortalNavGroup[] = [
    {
      title: "Portfolio",
      items: [
        {
          href: "/investor-portal/dashboard",
          label: strings.navDashboard,
          icon: "dashboard",
        },
        {
          href: "/investor-portal/capital-calls",
          label: "Capital calls",
          icon: "calls",
        },
        {
          href: "/investor-portal/distributions",
          label: strings.navDistributions,
          icon: "distributions",
        },
      ],
    },
    {
      title: "Participation",
      items: [
        {
          href: "/investor-portal/commitments",
          label: strings.navCommitments,
          icon: "commitments",
        },
        {
          href: "/investor-portal/forecasts",
          label: "Forecasts",
          icon: "forecasts",
        },
        {
          href: "/investor-portal/requests",
          label: "My requests",
          icon: "requests",
        },
      ],
    },
    {
      title: "Documents & account",
      items: [
        {
          href: "/investor-portal/documents",
          label: strings.navDocuments,
          icon: "documents",
        },
        {
          href: "/investor-portal/profile",
          label: strings.navProfile,
          icon: "profile",
        },
      ],
    },
  ];

  const mobileTabs: PortalMobileTab[] = [
    {
      href: "/investor-portal/dashboard",
      label: strings.navDashboard,
      icon: "dashboard",
    },
    { href: "/investor-portal/capital-calls", label: "Calls", icon: "calls" },
    {
      href: "/investor-portal/distributions",
      label: strings.navDistributions,
      icon: "distributions",
    },
    {
      href: "/investor-portal/forecasts",
      label: "Forecasts",
      icon: "forecasts",
    },
    { href: "/investor-portal/documents", label: strings.navDocuments, icon: "documents" },
  ];

  const initials = investorName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-canvas text-ink md:grid md:grid-cols-[248px_1fr]">
      {/* ── Sidebar (carbon rail) ─────────────────────────── */}
      <aside className="hidden flex-col bg-carbon py-5 text-ink-inverse md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-amber font-display text-base font-bold text-white">
            A
          </span>
          <span className="font-display text-base font-medium tracking-[-0.01em]">
            Arconique<span className="text-amber-soft"> Capital</span>
          </span>
        </div>

        <PortalSidebarNav groups={navGroups} />

        <div className="mx-3.5 mt-3.5 border-t border-ink-inverse/10 px-2.5 pt-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-steel text-[13px] font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">
                {investorName}
              </div>
              <div className="truncate font-mono text-[11px] text-ink-inverse/50">
                {investorCode}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────── */}
      <div className="flex min-w-0 flex-col">
        <header className="flex h-16 flex-none items-center gap-4 border-b border-line bg-bg-2 px-5 md:px-[30px]">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-amber font-display text-base font-bold text-white md:hidden">
            A
          </span>
          <h1 className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink md:text-[21px]">
            {pageTitle ?? strings.navDashboard}
          </h1>
          <span className="ml-auto hidden items-center gap-2.5 rounded-full border border-line-strong bg-panel px-3.5 py-2 text-[13px] font-semibold text-ink-2 sm:flex">
            <span className="h-2 w-2 rounded-full bg-amber" />
            {investorName.split(/\s+/)[0]}
            <ChevronDown className="h-[15px] w-[15px] text-ink-3" strokeWidth={2} />
          </span>
          <div className="flex items-center gap-3 sm:ml-0">
            <span className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-line-strong bg-panel text-ink-2">
              <span className="absolute right-[9px] top-2 h-[7px] w-[7px] rounded-full border-2 border-panel bg-amber" />
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="hidden h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-line-strong bg-panel text-ink-2 sm:flex">
              <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 pb-24 pt-7 md:px-[30px] md:pb-11">
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>

      <PortalMobileTabbar tabs={mobileTabs} />
    </div>
  );
}

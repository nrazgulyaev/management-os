import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { StayTabBar } from "@/components/stay/stay-tabbar";

/**
 * StayShell — the guest stay portal chrome (mockup: lightened-hospitality
 * theme). Mobile-first public surface a guest opens via a magic link.
 *
 * - data-product="guest" + data-surface="guest-stay" activate the airy
 *   hospitality token scope (sand canvas, lighter cream, terra accent,
 *   generous radii) without polluting the dashboard Layer-B palette.
 * - Sticky top app bar with the villa name + dates.
 * - Bottom tab bar (Stay · Services · Concierge · Explore · Guide) + a
 *   floating SOS button, both rendered by <StayTabBar> which tracks the
 *   active route and hides itself on the full-flow / concierge screens.
 *
 * `basePath` is `/stay/<token>` (or `/stay/demo`) — the tab bar links and
 * SOS target route under it. Generic public wrappers (e.g. the booking
 * hold flow) keep using <GuestShell>; this shell is stay-portal only.
 */
export function StayShell({
  children,
  villaName,
  dates,
  basePath,
}: {
  children: React.ReactNode;
  villaName?: string;
  dates?: string;
  basePath: string;
}) {
  return (
    <div
      data-product="guest"
      data-surface="guest-stay"
      className="min-h-screen bg-canvas text-ink"
    >
      <header className="sticky top-0 z-30 border-b border-line-soft bg-canvas/90 backdrop-blur">
        <div className="max-w-[620px] mx-auto flex items-center justify-between px-6 h-14">
          <Logo />
          {villaName && (
            <div className="flex flex-col text-right leading-tight">
              <span className="text-display text-[17px] text-ink">
                {villaName}
              </span>
              {dates && (
                <span className="text-[11px] text-ink-tertiary">{dates}</span>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="max-w-[620px] mx-auto px-6 py-7 pb-32">{children}</main>
      <StayTabBar basePath={basePath} />
    </div>
  );
}

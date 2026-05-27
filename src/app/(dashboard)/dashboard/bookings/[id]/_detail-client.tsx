"use client";

/**
 * Phase 2.1 PR 2 — Booking detail interactive shell (proof-of-life
 * for brick B2). Owns tab state on the client; the page composes
 * the static B1/B3/B4/B5/B8 around it.
 */

import * as React from "react";
import { DetailTabs, type DetailTabDef } from "@/components/dashboard/detail/detail-tabs";

export interface BookingDetailTabsProps {
  tabs: DetailTabDef[];
  panels: Record<string, React.ReactNode>;
}

export function BookingDetailTabs({ tabs, panels }: BookingDetailTabsProps) {
  const initialTab = tabs[0]?.id ?? "overview";
  const [active, setActive] = React.useState(initialTab);
  return (
    <main className="flex-1 min-w-0">
      <DetailTabs tabs={tabs} active={active} onChange={setActive} />
      {panels[active] ?? panels[initialTab]}
    </main>
  );
}

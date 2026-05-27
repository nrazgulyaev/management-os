"use client";

/**
 * Phase 2.1 PR 2 — Owner detail tab driver (B2). Mirrors the
 * Booking detail pattern but tabs default to "Activity" since
 * activity-as-main is the spec-defined assembly for Owner detail.
 */

import * as React from "react";
import { DetailTabs, type DetailTabDef } from "@/components/dashboard/detail/detail-tabs";

export interface OwnerDetailTabsProps {
  tabs: DetailTabDef[];
  panels: Record<string, React.ReactNode>;
  initialId?: string;
}

export function OwnerDetailTabs({ tabs, panels, initialId }: OwnerDetailTabsProps) {
  const fallback = tabs[0]?.id ?? "activity";
  const [active, setActive] = React.useState(initialId ?? fallback);
  return (
    <main className="flex-1 min-w-0">
      <DetailTabs tabs={tabs} active={active} onChange={setActive} />
      {panels[active] ?? panels[fallback]}
    </main>
  );
}

"use client";

/**
 * /dashboard/tasks tab driver — "My tasks" vs "Team queue". Each tab body is
 * a server-rendered <TaskFeed> passed in as a prop, so the heavy data stays
 * on the server; this island only flips which panel is visible.
 */

import * as React from "react";
import { DetailTabs, type DetailTabDef } from "@/components/dashboard/detail/detail-tabs";

export interface TasksTabsProps {
  tabs: DetailTabDef[];
  panels: Record<string, React.ReactNode>;
  initialId?: string;
}

export function TasksTabs({ tabs, panels, initialId }: TasksTabsProps) {
  const fallback = tabs[0]?.id ?? "mine";
  const [active, setActive] = React.useState(initialId ?? fallback);
  return (
    <div>
      <DetailTabs tabs={tabs} active={active} onChange={setActive} />
      <div className="pt-4">{panels[active] ?? panels[fallback]}</div>
    </div>
  );
}

"use client";

/**
 * Phase 2.1 PR 2 — DetailTabs (brick B2 · template 05).
 *
 * In-page tabs strip. Renders a count badge per tab when supplied;
 * the badge auto-hides when count is 0 (and the tab is NOT
 * disabled — per spec, empty tabs stay clickable and show an empty
 * state inside).
 */

import * as React from "react";

export interface DetailTabDef {
  id: string;
  label: string;
  /** Count badge. Pass `undefined` to hide. Pass 0 to hide. */
  count?: number;
}

export interface DetailTabsProps {
  tabs: DetailTabDef[];
  active: string;
  onChange?: (id: string) => void;
  className?: string;
}

export function DetailTabs({ tabs, active, onChange, className }: DetailTabsProps) {
  return (
    <nav className={`dp-tabs${className ? ` ${className}` : ""}`} role="tablist">
      {tabs.map((t) => {
        const on = t.id === active;
        const showCount = t.count !== undefined && t.count > 0;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            className={`dp-tab${on ? " on" : ""}`}
            onClick={() => onChange?.(t.id)}
          >
            <span>{t.label}</span>
            {showCount && <span className="count">{t.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

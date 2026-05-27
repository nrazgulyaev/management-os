"use client";

/**
 * Phase 2.1 PR 2 — FacetPanel (template 04).
 *
 * 240px collapsible side rail for refining a list at scale. Renders
 * one section per facet with checkboxes + live counts. Multi-select
 * within a group (OR), AND across groups — semantics owned by the
 * parent in its filter resolver.
 */

import * as React from "react";

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface Facet {
  key: string;
  label: string;
  options: FacetOption[];
}

export interface FacetPanelProps {
  facets: Facet[];
  selected: Record<string, string[]>;
  onChange: (selected: Record<string, string[]>) => void;
  className?: string;
}

export function FacetPanel({ facets, selected, onChange, className }: FacetPanelProps) {
  function toggle(key: string, value: string) {
    const cur = selected[key] ?? [];
    const next = cur.includes(value)
      ? cur.filter((v) => v !== value)
      : [...cur, value];
    onChange({ ...selected, [key]: next });
  }

  return (
    <aside className={`facets${className ? ` ${className}` : ""}`}>
      {facets.map((f) => (
        <div className="facet-group" key={f.key}>
          <div className="ft">{f.label}</div>
          {f.options.map((opt) => {
            const checked = (selected[f.key] ?? []).includes(opt.value);
            return (
              <label key={opt.value} className="facet-opt">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(f.key, opt.value)}
                />
                <span>{opt.label}</span>
                {opt.count !== undefined && (
                  <span className="count">{opt.count}</span>
                )}
              </label>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

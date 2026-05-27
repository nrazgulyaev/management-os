"use client";

/**
 * Phase 2.1 PR 4 — AgentCatalog (template 07).
 *
 * Header + categorical chip strip + 3-up card grid. Chips filter
 * the grid locally; clearing all chips renders every agent.
 */

import * as React from "react";
import { AgentCard, type AgentCardProps } from "./agent-card";

export interface AgentCatalogItem extends AgentCardProps {
  /** Optional category key used by the chip strip. */
  category?: string;
}

export interface AgentCategory {
  key: string;
  label: string;
  /** Optional count override; otherwise computed from items. */
  count?: number;
}

export interface AgentCatalogProps {
  agents: AgentCatalogItem[];
  categories: AgentCategory[];
  /** Default chip selection on first render. Pass "" for "All". */
  initialCategory?: string;
}

export function AgentCatalog({
  agents,
  categories,
  initialCategory = "",
}: AgentCatalogProps) {
  const [active, setActive] = React.useState(initialCategory);

  const counts = React.useMemo(() => {
    const out = new Map<string, number>();
    for (const a of agents) {
      const key = a.category ?? "uncategorized";
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  }, [agents]);

  const filtered = active
    ? agents.filter((a) => (a.category ?? "uncategorized") === active)
    : agents;

  return (
    <>
      <div className="agent-cats">
        <button
          type="button"
          className={`chip${active === "" ? " chip-active" : ""}`}
          onClick={() => setActive("")}
        >
          All agents <span style={{ marginLeft: 4, opacity: 0.6 }}>{agents.length}</span>
        </button>
        {categories.map((c) => {
          const n = c.count ?? counts.get(c.key) ?? 0;
          return (
            <button
              key={c.key}
              type="button"
              className={`chip${active === c.key ? " chip-active" : ""}`}
              onClick={() => setActive(c.key)}
            >
              {c.label} <span style={{ marginLeft: 4, opacity: 0.6 }}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="agent-grid">
        {filtered.map((a) => (
          <AgentCard key={a.code} {...a} />
        ))}
      </div>
    </>
  );
}

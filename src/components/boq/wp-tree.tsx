"use client";

/**
 * Phase 2.2 dev-03 — WpTree.
 *
 * Left-rail work-package tree. Renders a flat list with indentation
 * for sub-work-packages (WP-04 → WP-04.18). Click an entry to set
 * the parent's `selectedWp` state; "All" resets the filter.
 */

import * as React from "react";

export interface WpNode {
  code: string;
  label: string;
  /** Count of lines under this WP. */
  lineCount: number;
  /** Depth from root (0 = top-level WP). */
  depth: number;
}

export interface WpTreeProps {
  nodes: WpNode[];
  selected: string | null;
  onSelect: (code: string | null) => void;
  className?: string;
}

export function WpTree({ nodes, selected, onSelect, className }: WpTreeProps) {
  return (
    <nav className={`wp-tree${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className={`wp-node${selected === null ? " on" : ""}`}
        onClick={() => onSelect(null)}
        style={{ paddingLeft: 12 }}
      >
        <span className="lbl">All work packages</span>
        <span className="count mono">{nodes.reduce((n, x) => n + x.lineCount, 0)}</span>
      </button>
      {nodes.map((n) => (
        <button
          key={n.code}
          type="button"
          className={`wp-node${selected === n.code ? " on" : ""}`}
          onClick={() => onSelect(n.code)}
          style={{ paddingLeft: 12 + n.depth * 14 }}
        >
          <span className="code mono">{n.code}</span>
          <span className="lbl">{n.label}</span>
          <span className="count mono">{n.lineCount}</span>
        </button>
      ))}
    </nav>
  );
}

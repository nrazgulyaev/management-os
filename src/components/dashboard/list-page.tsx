import * as React from "react";

/**
 * Phase 2.1 PR 2 — ListPage shell (template 04).
 *
 * Server component. Composes the 5-zone list page anatomy:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  <header>   page-header (title, eyebrow, actions)    │
 *   ├──────────────────────────────────────────────────────┤
 *   │  <filterBar OR bulkBar> · filter chips OR bulk row   │
 *   ├──────────┬───────────────────────────────────────────┤
 *   │ optional │  <children>  (table + pager)              │
 *   │ <facets> │                                           │
 *   └──────────┴───────────────────────────────────────────┘
 *
 * Filter bar / bulk bar swap is owned by the caller — pass one OR
 * the other into `topBar` based on selection state. Side facets are
 * optional (off by default).
 */

export interface ListPageProps {
  header: React.ReactNode;
  topBar: React.ReactNode;
  facets?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ListPage({
  header,
  topBar,
  facets,
  children,
  className,
}: ListPageProps) {
  return (
    <div className={`list-page${className ? ` ${className}` : ""}`}>
      {header}
      <div className="list-page-shell">
        {facets}
        <div className="list-page-main">
          {topBar}
          {children}
        </div>
      </div>
    </div>
  );
}

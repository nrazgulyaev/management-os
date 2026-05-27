import * as React from "react";

/**
 * Phase 2.3 owner-06 — DocGroup.
 *
 * Group wrapper for /owner/documents. Renders an h3 title + an
 * optional helper line, then the rows as children.
 */

export interface DocGroupProps {
  title: string;
  helper?: string;
  children?: React.ReactNode;
  className?: string;
}

export function DocGroup({ title, helper, children, className }: DocGroupProps) {
  return (
    <section className={`doc-group${className ? ` ${className}` : ""}`}>
      <header className="dg-head">
        <h3 className="dg-title">{title}</h3>
        {helper && <p className="dg-helper">{helper}</p>}
      </header>
      <div className="dg-rows">{children}</div>
    </section>
  );
}

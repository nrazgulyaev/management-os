"use client";

import * as React from "react";
import type { ViewGroup } from "@/features/owner-statements/detail-view";

/**
 * owner-02 mobile — category accordion (tap to expand). Single-column
 * replacement for the desktop math table (FC-OWNER-STATEMENTS §2 #8 / mobile
 * spec). First bucket expanded by default, matching the mockup.
 */
export function OwnerStatementMobileBreakdown({ groups }: { groups: ViewGroup[] }) {
  const [open, setOpen] = React.useState<string | null>(groups[0]?.bucket ?? null);

  return (
    <div className="cat-accordion">
      {groups.map((g) => {
        const isOpen = open === g.bucket;
        return (
          <React.Fragment key={g.bucket}>
            <button
              type="button"
              className={`cat-row${isOpen ? " open" : ""}`}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.bucket)}
            >
              <span className={`sec-pill ${g.pill}`}>{g.label}</span>
              <span className="cat-lines">
                {g.lineCount} line{g.lineCount === 1 ? "" : "s"}
              </span>
              <span className={`cat-amount ${g.positive ? "pos" : "neg"}`}>
                {g.subtotalText}
              </span>
              <span className="cat-chevron" aria-hidden>
                {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div className="cat-detail">
                {g.lines.map((l, i) => (
                  <div className="cat-line" key={i}>
                    <span>{l.description}</span>
                    <span className="num">{l.amountText}</span>
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

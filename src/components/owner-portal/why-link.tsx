"use client";

import * as React from "react";

/**
 * Phase 2.3 owner-02 — WhyLink.
 *
 * "Why this number?" link — clicking opens a side drawer with the
 * category explainer. Renders as an inline mono link.
 */

export interface WhyLinkProps {
  categoryKey: string;
  /** Caller wires this to the WhyDrawer open state. */
  onOpen: (categoryKey: string) => void;
  className?: string;
}

export function WhyLink({ categoryKey, onOpen, className }: WhyLinkProps) {
  return (
    <button
      type="button"
      className={`why-link${className ? ` ${className}` : ""}`}
      onClick={() => onOpen(categoryKey)}
      aria-label={`Explain ${categoryKey}`}
    >
      why this number?
    </button>
  );
}

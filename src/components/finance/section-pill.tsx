import * as React from "react";

/**
 * Phase 2.2 mgmt-02 — SectionPill.
 *
 * 7 tones matching the owner-statement section taxonomy:
 *   revenue   accent
 *   fees      info
 *   taxes     warn
 *   expenses  ink
 *   shared    steel
 *   mgmt      gold
 *   reserves  dashed neutral
 */

export type StatementSection =
  | "revenue"
  | "fees"
  | "taxes"
  | "expenses"
  | "shared"
  | "mgmt"
  | "reserves";

const LABEL: Record<StatementSection, string> = {
  revenue: "Revenue",
  fees: "Fees",
  taxes: "Taxes",
  expenses: "Expenses",
  shared: "Shared",
  mgmt: "Mgmt",
  reserves: "Reserves",
};

export interface SectionPillProps {
  kind: StatementSection;
  className?: string;
}

export function SectionPill({ kind, className }: SectionPillProps) {
  return (
    <span className={`section-pill ${kind}${className ? ` ${className}` : ""}`}>
      {LABEL[kind]}
    </span>
  );
}

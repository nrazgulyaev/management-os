import * as React from "react";
import Link from "next/link";
import { ProgressBar } from "@/components/projects/progress-bar";

/**
 * Phase 2.2 dev-02 — CapitalCallCard.
 *
 * Compact list row for the capital-calls index. Shows ref, project,
 * total, % received progress bar, and a "N of M investors paid"
 * mono detail line.
 */

export type CapitalCallStatus = "drafting" | "issued" | "partial" | "received";

export interface CapitalCallCardProps {
  href: string;
  ref: string;
  projectLabel: string;
  totalUsdMinor: bigint | number;
  /** 0..total — paid to date (cents). */
  receivedUsdMinor: bigint | number;
  investorsPaid: number;
  investorsTotal: number;
  status: CapitalCallStatus;
  /** ISO date — when the call was issued. */
  issuedAt?: string;
}

const STATUS_LABEL: Record<CapitalCallStatus, string> = {
  drafting: "Draft",
  issued: "Issued",
  partial: "Partial",
  received: "Received",
};

const STATUS_CLASS: Record<CapitalCallStatus, string> = {
  drafting: "",
  issued: "tone-accent",
  partial: "tone-warn",
  received: "tone-ok",
};

function toUsd(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) / 100 : value / 100;
}

function fmt(value: bigint | number): string {
  const usd = toUsd(value);
  if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (Math.abs(usd) >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}

export function CapitalCallCard({
  href,
  ref,
  projectLabel,
  totalUsdMinor,
  receivedUsdMinor,
  investorsPaid,
  investorsTotal,
  status,
  issuedAt,
}: CapitalCallCardProps) {
  const total = toUsd(totalUsdMinor);
  const received = toUsd(receivedUsdMinor);
  const pct = total > 0 ? (received / total) * 100 : 0;
  return (
    <Link className="capital-call-card" href={href}>
      <div className="head">
        <span className="ref mono">{ref}</span>
        <span className={`status-pill ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="project">{projectLabel}</div>
      <div className="totals">
        <div className="num-kpi tone-accent">
          <span className="value">{fmt(totalUsdMinor)}</span>
          <span className="label">Total</span>
        </div>
        <div className="num-kpi">
          <span className="value">{fmt(receivedUsdMinor)}</span>
          <span className="label">Received</span>
        </div>
      </div>
      <ProgressBar
        pct={pct}
        caption="Received"
        label={`${investorsPaid} of ${investorsTotal} investors · ${Math.round(pct)}%`}
        tone={pct >= 99 ? "ok" : pct >= 50 ? "accent" : "warn"}
      />
      {issuedAt && (
        <div className="meta mono">Issued {issuedAt}</div>
      )}
    </Link>
  );
}

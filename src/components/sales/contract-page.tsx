"use client";

/**
 * Phase 2.4 dev-02 — ContractPage.
 *
 * 4-tab layout (document / payment / signatures / activity). The
 * payment tab embeds PaymentLadder. Tabs are local state — URL
 * sync is the route's concern.
 */

import * as React from "react";

export type ContractTab = "document" | "payment" | "signatures" | "activity";

export interface ContractPageProps {
  code: string;
  status: "draft" | "sent" | "countersigned" | "in_payment" | "completed" | "cancelled";
  totalLabel: string;
  documentSlot: React.ReactNode;
  paymentSlot: React.ReactNode;
  signaturesSlot: React.ReactNode;
  activitySlot: React.ReactNode;
  className?: string;
}

const TABS: { key: ContractTab; label: string }[] = [
  { key: "document", label: "Document" },
  { key: "payment", label: "Payment" },
  { key: "signatures", label: "Signatures" },
  { key: "activity", label: "Activity" },
];

export function ContractPage({
  code,
  status,
  totalLabel,
  documentSlot,
  paymentSlot,
  signaturesSlot,
  activitySlot,
  className,
}: ContractPageProps) {
  const [tab, setTab] = React.useState<ContractTab>("document");

  const body = tab === "document" ? documentSlot : tab === "payment" ? paymentSlot : tab === "signatures" ? signaturesSlot : activitySlot;

  return (
    <div className={`contract-page${className ? ` ${className}` : ""}`}>
      <header className="cp-head">
        <div>
          <div className="cp-code mono">{code}</div>
          <h1 className="cp-title">Contract · {totalLabel}</h1>
        </div>
        <span className={`cp-status cp-status-${status}`}>{status.replace("_", " ")}</span>
      </header>
      <nav className="cp-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`cp-tab${tab === t.key ? " is-on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <section className="cp-body">{body}</section>
    </div>
  );
}

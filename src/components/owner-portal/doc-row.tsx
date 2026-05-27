"use client";

import * as React from "react";

/**
 * Phase 2.3 owner-06 — DocRow.
 *
 * Single document row. Renders icon + name + sub + type pill +
 * status (signed / expired / pending). Click → opens fileUrl in a
 * new tab.
 */

export type DocKind =
  | "msa"
  | "annex"
  | "legal"
  | "tax_summary"
  | "tax_cert"
  | "statement_pdf"
  | "policy";

export type DocStatus = "signed" | "pending" | "expired" | "current";

export interface DocRowProps {
  name: string;
  sub?: string;
  kind: DocKind;
  status?: DocStatus;
  fileUrl?: string;
  /** Bundle / zip download? Renders alternate icon + "Generate" CTA when no fileUrl yet. */
  bundle?: boolean;
  onGenerate?: () => Promise<void> | void;
  className?: string;
}

const KIND_LABEL: Record<DocKind, string> = {
  msa: "MSA",
  annex: "Annex",
  legal: "Legal",
  tax_summary: "Tax",
  tax_cert: "Cert",
  statement_pdf: "Statement",
  policy: "Policy",
};

export function DocRow({ name, sub, kind, status, fileUrl, bundle, onGenerate, className }: DocRowProps) {
  const [busy, setBusy] = React.useState(false);

  async function generate() {
    if (busy) return;
    setBusy(true);
    try {
      await onGenerate?.();
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <>
      <span className={`dr-icon${bundle ? " dr-icon-bundle" : ""}`} aria-hidden>
        {bundle ? "↓" : "•"}
      </span>
      <div className="dr-main">
        <div className="dr-name">{name}</div>
        {sub && <div className="dr-sub mono">{sub}</div>}
      </div>
      <span className="dr-kind mono">{KIND_LABEL[kind]}</span>
      {status && <span className={`dr-status dr-status-${status} mono`}>{status}</span>}
    </>
  );

  if (fileUrl) {
    return (
      <a href={fileUrl} target="_blank" rel="noreferrer" className={`doc-row${className ? ` ${className}` : ""}`}>
        {body}
      </a>
    );
  }
  if (bundle) {
    return (
      <button type="button" className={`doc-row${className ? ` ${className}` : ""}`} onClick={generate} disabled={busy}>
        {body}
        <span className="dr-cta mono">{busy ? "Generating…" : "Generate"}</span>
      </button>
    );
  }
  return (
    <div className={`doc-row doc-row-static${className ? ` ${className}` : ""}`}>{body}</div>
  );
}

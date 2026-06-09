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
  /** Right-aligned date label (e.g. "14 APR 2024"). */
  when?: string;
  fileUrl?: string;
  /** Bundle / zip download? Renders alternate icon + "Generate" CTA when no fileUrl yet. */
  bundle?: boolean;
  onGenerate?: () => Promise<void> | void;
  className?: string;
}

const KIND_LABEL: Record<DocKind, string> = {
  msa: "Contract",
  annex: "Annex",
  legal: "Legal",
  tax_summary: "Summary",
  tax_cert: "Cert",
  statement_pdf: "Statement",
  policy: "Policy",
};

const STATUS_LABEL: Record<DocStatus, string> = {
  signed: "Signed",
  pending: "Pending",
  expired: "Expired",
  current: "Current",
};

/** Document glyph per kind family — keyed to the 4 cabinet groups. */
const KIND_GLYPH: Record<DocKind, string> = {
  msa: "\u{1F4C4}",
  annex: "\u{1F4C4}",
  legal: "\u{1F4C4}",
  tax_summary: "\u{1F4CA}",
  tax_cert: "\u{1F4CA}",
  statement_pdf: "\u{1F4D1}",
  policy: "\u{1F3DB}\u{FE0F}",
};

export function DocRow({ name, sub, kind, status, when, fileUrl, bundle, onGenerate, className }: DocRowProps) {
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
        {bundle ? "↓" : KIND_GLYPH[kind]}
      </span>
      <div className="dr-main">
        <div className="dr-name">{name}</div>
        {sub && <div className="dr-sub mono">{sub}</div>}
      </div>
      <span className="dr-kind mono">{KIND_LABEL[kind]}</span>
      {when ? <span className="dr-when mono">{when}</span> : <span className="dr-when" aria-hidden />}
      {status && <span className={`dr-status dr-status-${status} mono`}>{STATUS_LABEL[status]}</span>}
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

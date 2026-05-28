"use client";

/**
 * Phase 2.4 dev-03 — QuarterlyLetterComposer.
 *
 * Draft + review + send flow for the LP quarterly letter. The
 * draft body comes from the quarterly-narrator agent; staff edits
 * before approval. Send is a deliberate separate action — never
 * combined with save.
 */

import * as React from "react";

export interface QuarterlyLetterDraft {
  period: string;
  subject: string;
  bodyMd: string;
  kpis: { label: string; value: string }[];
  attachments: { id: string; label: string; url: string }[];
}

export interface QuarterlyLetterComposerProps {
  initial: QuarterlyLetterDraft;
  onSaveDraft?: (draft: QuarterlyLetterDraft) => Promise<void> | void;
  onSend?: (draft: QuarterlyLetterDraft) => Promise<void> | void;
}

export function QuarterlyLetterComposer({ initial, onSaveDraft, onSend }: QuarterlyLetterComposerProps) {
  const [draft, setDraft] = React.useState<QuarterlyLetterDraft>(initial);
  const [busy, setBusy] = React.useState<"save" | "send" | null>(null);

  React.useEffect(() => setDraft(initial), [initial]);

  async function save() {
    setBusy("save");
    try {
      await onSaveDraft?.(draft);
    } finally {
      setBusy(null);
    }
  }
  async function send() {
    setBusy("send");
    try {
      await onSend?.(draft);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="quarterly-composer">
      <header className="qc-head">
        <span className="qc-period mono">{draft.period}</span>
        <h1 className="qc-title">Quarterly LP letter</h1>
      </header>
      <div className="field">
        <label className="field-label">Subject</label>
        <input
          className="input"
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field-label">Body (markdown)</label>
        <textarea
          className="textarea"
          rows={14}
          value={draft.bodyMd}
          onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })}
        />
      </div>
      {draft.kpis.length > 0 && (
        <ul className="qc-kpis">
          {draft.kpis.map((k, i) => (
            <li key={i} className="qc-kpi">
              <span className="qc-kpi-label mono">{k.label}</span>
              <span className="qc-kpi-value mono">{k.value}</span>
            </li>
          ))}
        </ul>
      )}
      <footer className="qc-foot">
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={save}>
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={send}>
          {busy === "send" ? "Sending…" : "Send to LPs"}
        </button>
      </footer>
    </div>
  );
}

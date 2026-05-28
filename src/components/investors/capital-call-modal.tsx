"use client";

/**
 * Phase 2.4 dev-03 — CapitalCallModal.
 *
 * Destructive-style modal (default focus = Cancel) — issuing a
 * capital call commits LPs to wiring funds, so the wrong click is
 * costly. Renders the pro-rata preview from draftCapitalCall();
 * the allocations sum is asserted to equal totalIdr exactly.
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { draftCapitalCall, type CapitalCallDraft } from "@/features/investors/capital-call-issuer";

export interface CapitalCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundId: string;
  fundName: string;
  number: number;
  lps: { lpId: string; lpName: string; pctOfFund: number }[];
  onIssue?: (draft: CapitalCallDraft) => Promise<void> | void;
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

export function CapitalCallModal({ open, onOpenChange, fundId, fundName, number, lps, onIssue }: CapitalCallModalProps) {
  const [totalIdr, setTotalIdr] = React.useState(0);
  const [purpose, setPurpose] = React.useState("");
  const [noticeAt, setNoticeAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = React.useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) {
      setTotalIdr(0);
      setPurpose("");
    } else {
      const t = setTimeout(() => cancelRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const draft = draftCapitalCall({
    fundId,
    number,
    totalIdr,
    purpose,
    noticeAt,
    dueAt,
    lps: lps.map((l) => ({ lpId: l.lpId, pctOfFund: l.pctOfFund })),
  });
  const lpsByName = React.useMemo(() => Object.fromEntries(lps.map((l) => [l.lpId, l.lpName])), [lps]);
  const sumOk = draft.allocatedTotal === totalIdr;
  const valid = totalIdr > 0 && purpose.trim().length > 0 && sumOk;
  const dirty = totalIdr > 0 || purpose.length > 0;

  async function issue() {
    if (!valid) return;
    await onIssue?.(draft);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" dirty={dirty} ariaLabel="Issue capital call">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M12 3v18" />
          </svg>
        }
        glyphTone="warn"
        title={`Issue capital call #${number} on ${fundName}`}
        description="Issuing commits LPs to wire by the due date. Verify the pro-rata split before sending."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Total (IDR)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={totalIdr}
              onChange={(e) => setTotalIdr(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field-label">Purpose</label>
            <input
              className="input"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Phase 2 construction draw"
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Notice at</label>
            <input className="input" type="date" value={noticeAt} onChange={(e) => setNoticeAt(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Due at</label>
            <input className="input" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} min={noticeAt} />
          </div>
        </div>
        <div className="ccm-preview">
          <header className="ccm-prev-head">
            <span className="ccm-prev-label mono">Pro-rata allocations</span>
            <span className={`ccm-prev-sum mono${sumOk ? " is-ok" : " is-bad"}`}>
              {fmt(draft.allocatedTotal)} / {fmt(totalIdr)} IDR
            </span>
          </header>
          <ul className="ccm-prev-list">
            {draft.allocations.map((a) => (
              <li key={a.lpId} className="ccm-prev-row">
                <span>{lpsByName[a.lpId] ?? a.lpId}</span>
                <span className="mono">{fmt(a.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </ModalBody>
      <ModalFooter help="Default action is Cancel — this is irreversible from LPs' side.">
        <button ref={cancelRef} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger btn-sm" disabled={!valid} onClick={issue}>
          Issue call
        </button>
      </ModalFooter>
    </Modal>
  );
}

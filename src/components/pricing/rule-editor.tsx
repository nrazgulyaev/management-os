"use client";

/**
 * Phase 2.4 mgmt-02 — RuleEditor.
 *
 * Side panel that edits a single PricingRule. Used by
 * /dashboard/pricing/rules. Hosts the kind selector + a
 * kind-specific condition form + effect form + pinned/enabled
 * toggles.
 *
 * State is local; persistence is the caller's responsibility via
 * onSave (server action).
 */

import * as React from "react";
import type { PricingRule, PricingRuleKind, PricingRuleEffect } from "@/features/pricing/rules-evaluator";

export interface RuleEditorProps {
  rule: PricingRule | null;
  onSave?: (rule: PricingRule) => Promise<void> | void;
  onCancel?: () => void;
}

const KIND_OPTIONS: PricingRuleKind[] = ["event", "occupancy", "dow", "season", "floor", "ceiling"];
const EFFECT_KINDS: PricingRuleEffect["kind"][] = ["force", "mul", "add", "floor", "ceiling"];

function emptyRule(): PricingRule {
  return {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    villaId: null,
    priority: 100,
    kind: "event",
    condition: { kind: "always" },
    effect: { kind: "mul", value: 1.1 },
    enabled: true,
    pinned: false,
  };
}

export function RuleEditor({ rule, onSave, onCancel }: RuleEditorProps) {
  const [draft, setDraft] = React.useState<PricingRule>(rule ?? emptyRule());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setDraft(rule ?? emptyRule()), [rule]);

  async function save() {
    setBusy(true);
    try {
      await onSave?.(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rule-editor">
      <header className="re-head">
        <h3 className="re-title">{rule ? "Edit rule" : "New rule"}</h3>
      </header>
      <div className="re-body">
        <div className="field">
          <label className="field-label">Priority</label>
          <input
            className="input"
            type="number"
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label className="field-label">Kind</label>
          <select
            className="select"
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as PricingRuleKind })}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Effect kind</label>
            <select
              className="select"
              value={draft.effect.kind}
              onChange={(e) =>
                setDraft({ ...draft, effect: { ...draft.effect, kind: e.target.value as PricingRuleEffect["kind"] } })
              }
            >
              {EFFECT_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Effect value</label>
            <input
              className="input"
              type="number"
              step="any"
              value={draft.effect.value}
              onChange={(e) => setDraft({ ...draft, effect: { ...draft.effect, value: Number(e.target.value) } })}
            />
          </div>
        </div>
        <div className="field-row">
          <label className="re-toggle">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <label className="re-toggle">
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
            />
            Pinned (survives algo runs)
          </label>
        </div>
      </div>
      <footer className="re-foot">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save rule"}
        </button>
      </footer>
    </div>
  );
}

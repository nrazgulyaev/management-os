"use client";

/**
 * Wire-up — waterfall-rule lifecycle controls. createWaterfallRule /
 * updateWaterfallRuleParameters / deactivateWaterfallRule existed
 * (server-only) with no UI caller. These islands post to the co-located
 * "use server" _actions.ts adapters; all authority (requireInternalUser +
 * org-scoping) lives in the underlying actions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createWaterfallRuleAction,
  updateWaterfallRuleParametersAction,
  deactivateWaterfallRuleAction,
} from "./_actions";

type RuleType =
  | "generic_50_50"
  | "arconique_25_credit"
  | "preferred_return_then_split"
  | "waterfall_with_hurdle"
  | "capital_first_then_split"
  | "tiered_promote"
  | "custom";

const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: "generic_50_50", label: "Generic 50 / 50" },
  { value: "arconique_25_credit", label: "Arconique 25% credit" },
  { value: "preferred_return_then_split", label: "Preferred return then split" },
  { value: "waterfall_with_hurdle", label: "Waterfall with hurdle" },
  { value: "capital_first_then_split", label: "Capital first then split" },
  { value: "tiered_promote", label: "Tiered promote" },
  { value: "custom", label: "Custom" },
];

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

// ---------------------------------------------------------------------------
// New rule (modal)
// ---------------------------------------------------------------------------

export function NewWaterfallRuleButton({
  slug,
  projectId,
}: {
  slug: string;
  projectId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    start(async () => {
      const r = await createWaterfallRuleAction({
        slug,
        projectId,
        ruleLabel: str("ruleLabel"),
        ruleType: str("ruleType") as RuleType,
        ruleParametersJson: str("ruleParametersJson"),
        description: str("description") || null,
        legalReference: str("legalReference") || null,
        notes: str("notes") || null,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => { setErr(null); setOpen(true); }}>
        New rule
      </Button>
      {open && (
        <div
          className="modal-overlay flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">
              New waterfall rule (project-scoped)
            </h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Label" span2>
                  <input
                    name="ruleLabel"
                    required
                    minLength={1}
                    className={inputCls}
                    placeholder="Project default — 50/50 after capital"
                  />
                </L>
                <L label="Rule type" span2>
                  <select name="ruleType" className={inputCls} defaultValue="generic_50_50">
                    {RULE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </L>
                <L label="Parameters (JSON object)" span2>
                  <textarea
                    name="ruleParametersJson"
                    rows={4}
                    className={`${inputCls} font-mono text-xs`}
                    placeholder='{ "preferredReturnPct": 8, "promotePct": 20 }'
                  />
                </L>
                <L label="Description" span2>
                  <input name="description" className={inputCls} />
                </L>
                <L label="Legal reference">
                  <input name="legalReference" className={inputCls} placeholder="SPA §7.2" />
                </L>
                <L label="Notes">
                  <input name="notes" className={inputCls} />
                </L>
              </div>
              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-row controls — edit parameters + deactivate
// ---------------------------------------------------------------------------

export function WaterfallRuleRowControls({
  slug,
  id,
  isActive,
  ruleParameters,
}: {
  slug: string;
  id: string;
  isActive: boolean;
  ruleParameters: unknown;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  const initialJson = React.useMemo(() => {
    try {
      return JSON.stringify(ruleParameters ?? {}, null, 2);
    } catch {
      return "{}";
    }
  }, [ruleParameters]);

  function saveParams(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const ruleParametersJson = (fd.get("ruleParametersJson") ?? "").toString();
    start(async () => {
      const r = await updateWaterfallRuleParametersAction({
        slug,
        id,
        ruleParametersJson,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function deactivate() {
    if (!window.confirm("Deactivate this rule? It will be closed effective today.")) {
      return;
    }
    setErr(null);
    start(async () => {
      const r = await deactivateWaterfallRuleAction({ slug, id });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      router.refresh();
    });
  }

  const btn =
    "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
  const dangerBtn =
    "text-xs px-2 py-1 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={btn} disabled={pending} onClick={() => { setErr(null); setEditing(true); }}>
        Edit parameters
      </button>
      {isActive && (
        <button type="button" className={dangerBtn} disabled={pending} onClick={deactivate}>
          Deactivate
        </button>
      )}
      {err && <span className="text-[10px] text-danger">{err}</span>}

      {editing && (
        <div
          className="modal-overlay flex items-center justify-center p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">Edit rule parameters</h2>
            <form onSubmit={saveParams} className="space-y-3">
              <textarea
                name="ruleParametersJson"
                rows={8}
                defaultValue={initialJson}
                className={`${inputCls} font-mono text-xs`}
              />
              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save parameters"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function L({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

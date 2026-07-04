"use client";

/**
 * Wire-up sweep — cashflow forecast generate + status transition.
 * Both actions existed (server-only) with no UI caller.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateForecastAction, transitionForecastAction } from "./_actions";

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

export function GenerateForecastForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<"company_wide" | "project">("company_wide");
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => Number(fd.get(k) ?? 0);
    // The operator enters MAJOR dollars, but the projection engine +
    // storage are USD-minor (cents) — see cashflow-helpers.ts ("All amounts
    // in USD-minor"). Convert here at the operator-input boundary. NOTE: the
    // cron auto-generator already passes real cents, so the conversion must
    // live here (form), NOT in generateCashflowForecast — else the cron
    // path would double-convert.
    const money = (k: string) => Math.round(num(k) * 100);
    const projectId = scope === "project" ? (fd.get("projectId") ?? "").toString() : null;
    if (scope === "project" && !projectId) {
      setErr("Pick a project for a project-scoped forecast.");
      return;
    }
    start(async () => {
      const r = await generateForecastAction({
        forecastLabel: (fd.get("forecastLabel") ?? "").toString().trim(),
        scope,
        projectId,
        horizonMonths: num("horizonMonths") || 12,
        startMonth: (fd.get("startMonth") ?? "").toString(),
        startingCash: money("startingCash"),
        monthlyPayrollCommitment: money("monthlyPayrollCommitment"),
        monthlyFixedCosts: money("monthlyFixedCosts"),
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
        Generate forecast
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
            <h2 className="text-sm font-semibold mb-3">New cashflow forecast (draft)</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Label" span2>
                  <input name="forecastLabel" required minLength={1} className={inputCls} placeholder="H2 2026 burn" />
                </L>
                <L label="Scope">
                  <select
                    name="scope"
                    className={inputCls}
                    value={scope}
                    onChange={(e) => setScope(e.target.value as "company_wide" | "project")}
                  >
                    <option value="company_wide">Company-wide</option>
                    <option value="project">Project</option>
                  </select>
                </L>
                {scope === "project" && (
                  <L label="Project">
                    <select name="projectId" className={inputCls} defaultValue="">
                      <option value="" disabled>Select project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </L>
                )}
                <L label="Start month">
                  <input type="date" name="startMonth" required className={inputCls} />
                </L>
                <L label="Horizon (months)">
                  <input type="number" name="horizonMonths" min={1} max={60} defaultValue={12} className={inputCls} />
                </L>
                <L label="Starting cash">
                  <input type="number" name="startingCash" step="any" defaultValue={0} className={inputCls} />
                </L>
                <L label="Monthly payroll">
                  <input type="number" name="monthlyPayrollCommitment" min={0} step="any" defaultValue={0} className={inputCls} />
                </L>
                <L label="Monthly fixed costs">
                  <input type="number" name="monthlyFixedCosts" min={0} step="any" defaultValue={0} className={inputCls} />
                </L>
              </div>
              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50">
                  {pending ? "Generating…" : "Generate draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function CashflowTransition({
  forecastId,
  status,
}: {
  forecastId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function go(to: "draft" | "active" | "archived" | "superseded") {
    setErr(null);
    start(async () => {
      const r = await transitionForecastAction(forecastId, to);
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      router.refresh();
    });
  }

  const btn =
    "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "draft" && (
        <>
          <button type="button" className={btn} disabled={pending} onClick={() => go("active")}>Promote</button>
          <button type="button" className={btn} disabled={pending} onClick={() => go("archived")}>Archive</button>
        </>
      )}
      {status === "active" && (
        <>
          <button type="button" className={btn} disabled={pending} onClick={() => go("superseded")}>Supersede</button>
          <button type="button" className={btn} disabled={pending} onClick={() => go("archived")}>Archive</button>
        </>
      )}
      {(status === "archived" || status === "superseded") && (
        <button type="button" className={btn} disabled={pending} onClick={() => go("draft")}>Reactivate</button>
      )}
      {err && <span className="text-[10px] text-danger">{err}</span>}
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

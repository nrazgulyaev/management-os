"use client";

/**
 * Wire-up sweep — create campaign.
 *
 * `createCampaign` already existed (real DB insert) but had no form. This
 * is a compact modal over it. Budget is entered in major units and
 * converted to minor for storage.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { createCampaign } from "@/lib/development/server/campaigns/campaign-actions";

const OBJECTIVES = [
  "awareness",
  "consideration",
  "conversion",
  "lead_generation",
  "retention",
];

export function CampaignCreateForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const budgetMajor = Number(fd.get("budget") ?? 0);
    const channels = (fd.get("primaryChannels") ?? "")
      .toString()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    start(async () => {
      const r = await createCampaign({
        campaignCode: (fd.get("campaignCode") ?? "").toString().trim(),
        name: (fd.get("name") ?? "").toString().trim(),
        campaignObjective: (fd.get("campaignObjective") ?? "").toString(),
        campaignStart: (fd.get("campaignStart") ?? "").toString(),
        campaignEnd: (fd.get("campaignEnd") ?? "").toString(),
        totalBudgetMinor: Math.round((Number.isFinite(budgetMajor) ? budgetMajor : 0) * 100),
        currency: (fd.get("currency") ?? "IDR").toString(),
        primaryChannels: channels,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not create campaign.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40"
      >
        + New campaign
      </button>

      {open && (
        <div
          className="modal-overlay flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">New campaign</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Code">
                  <input name="campaignCode" required minLength={2} className={inputCls} placeholder="SUMMER25" />
                </L>
                <L label="Name">
                  <input name="name" required minLength={2} className={inputCls} placeholder="Summer 2025 push" />
                </L>
                <L label="Objective">
                  <select name="campaignObjective" required className={inputCls} defaultValue="awareness">
                    {OBJECTIVES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="Currency">
                  <input name="currency" defaultValue="IDR" className={inputCls} />
                </L>
                <L label="Start">
                  <input type="date" name="campaignStart" required className={inputCls} />
                </L>
                <L label="End">
                  <input type="date" name="campaignEnd" required className={inputCls} />
                </L>
                <L label="Budget (major units)">
                  <input type="number" name="budget" min={0} step="any" defaultValue={0} className={inputCls} />
                </L>
                <L label="Channels (comma-sep)">
                  <input name="primaryChannels" className={inputCls} placeholder="instagram, google" />
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
                  {pending ? "Creating…" : "Create campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-secondary">
      {label}
      {children}
    </label>
  );
}

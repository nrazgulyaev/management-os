"use client";

/**
 * Wire-up sweep — log revenue stream (modal). createRevenueStream existed
 * (server-only, throws, bigint) — wired via the _actions.ts adapter.
 * projectId is derived from the selected asset.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createRevenueStreamAction,
  type CreateRevenueStreamFormInput,
} from "./_actions";

type StreamType = CreateRevenueStreamFormInput["streamType"];

const STREAM_TYPES: StreamType[] = [
  "hotel_room_revenue",
  "restaurant_revenue",
  "spa_revenue",
  "rental_income",
  "service_fee",
  "membership_fee",
  "event_revenue",
  "other",
];

const inputCls = "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

export function LogRevenueStreamForm({
  assets,
}: {
  assets: { id: string; projectId: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [assetId, setAssetId] = React.useState("");
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) {
      setErr("Pick an asset.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const numOpt = (k: string) => {
      const v = (fd.get(k) ?? "").toString();
      return v === "" ? null : Number(v);
    };
    start(async () => {
      const r = await createRevenueStreamAction({
        assetId: asset.id,
        projectId: asset.projectId,
        streamType: (fd.get("streamType") ?? "other").toString() as StreamType,
        periodStart: (fd.get("periodStart") ?? "").toString(),
        periodEnd: (fd.get("periodEnd") ?? "").toString(),
        grossRevenueMajor: Number(fd.get("grossRevenueMajor") ?? 0),
        directCostsMajor: Number(fd.get("directCostsMajor") ?? 0),
        currency: (fd.get("currency") ?? "IDR").toString().trim() || "IDR",
        occupancyRate: numOpt("occupancyRate"),
        averageDailyRateMajor: numOpt("averageDailyRateMajor"),
        unitsSold: numOpt("unitsSold"),
        dataSource: (fd.get("dataSource") ?? "").toString().trim() || null,
        notes: (fd.get("notes") ?? "").toString().trim() || null,
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
        + Log revenue stream
      </Button>
      {open && (
        <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold mb-3">Log revenue stream</h2>
            <form onSubmit={submit} className="space-y-3">
              <L label="Asset" span2 required>
                <select required className={inputCls} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                  <option value="" disabled>Select asset…</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </L>
              <div className="grid grid-cols-2 gap-3">
                <L label="Stream type">
                  <select name="streamType" className={inputCls} defaultValue="rental_income">
                    {STREAM_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </L>
                <L label="Currency">
                  <input name="currency" defaultValue="IDR" className={inputCls} />
                </L>
                <L label="Period start" required>
                  <input type="date" name="periodStart" required className={inputCls} />
                </L>
                <L label="Period end" required>
                  <input type="date" name="periodEnd" required className={inputCls} />
                </L>
                <L label="Gross revenue (major)" required>
                  <input type="number" name="grossRevenueMajor" min={0} step="any" required className={inputCls} />
                </L>
                <L label="Direct costs (major)">
                  <input type="number" name="directCostsMajor" min={0} step="any" defaultValue={0} className={inputCls} />
                </L>
                <L label="Occupancy %">
                  <input type="number" name="occupancyRate" min={0} max={100} step="any" className={inputCls} />
                </L>
                <L label="ADR (major)">
                  <input type="number" name="averageDailyRateMajor" min={0} step="any" className={inputCls} />
                </L>
                <L label="Units sold">
                  <input type="number" name="unitsSold" min={0} step={1} className={inputCls} />
                </L>
                <L label="Data source">
                  <input name="dataSource" className={inputCls} placeholder="pms, manual…" />
                </L>
              </div>
              <L label="Notes" span2>
                <textarea name="notes" rows={2} className={inputCls} />
              </L>
              {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50">{pending ? "Saving…" : "Log revenue"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function L({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}>
      <span>{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
    </label>
  );
}

"use client";

/**
 * Operating revenue streams — the raw per-period log behind the recognition
 * aggregates above. Renders every logged stream with an edit modal + delete,
 * wired to the org-scoped updateRevenueStream / deleteRevenueStream actions
 * (recognition recomputes on the next read because net_revenue_minor is
 * GENERATED STORED). Mirrors the dev-os inline-island convention used by the
 * buyers / contracts row controls.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
import {
  updateRevenueStreamAction,
  deleteRevenueStreamAction,
  type UpdateRevenueStreamFormInput,
} from "./_actions";

type StreamType = UpdateRevenueStreamFormInput["streamType"];

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

export interface RevenueStreamRowDTO {
  id: string;
  assetLabel: string;
  projectName: string;
  streamType: string;
  periodStart: string;
  periodEnd: string;
  grossRevenueMajor: number;
  directCostsMajor: number;
  netRevenueMajor: number;
  occupancyRate: number | null;
  averageDailyRateMajor: number | null;
  unitsSold: number | null;
  currency: string;
  dataSource: string | null;
  notes: string | null;
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

function fmt(n: number, currency: string) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

export function RevenueStreamsTable({ rows }: { rows: RevenueStreamRowDTO[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No revenue streams logged yet"
        description="Use “Log revenue stream” above to record operating revenue (rental, hotel, F&B, service fees) per period."
      />
    );
  }
  return (
    <Card padding="none" overflowHidden>
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col">Type</th>
            <th scope="col">Period</th>
            <th scope="col" className="num">Gross</th>
            <th scope="col" className="num">Direct cost</th>
            <th scope="col" className="num">Net</th>
            <th scope="col" className="num">Occ.</th>
            <th scope="col" className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <RevenueStreamRow key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function RevenueStreamRow({ row }: { row: RevenueStreamRowDTO }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function onDelete() {
    if (!window.confirm("Delete this revenue stream? This cannot be undone.")) {
      return;
    }
    setErr(null);
    start(async () => {
      const res = await deleteRevenueStreamAction(row.id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <tr>
        <td>
          <span className="text-ink">{row.assetLabel}</span>
          <div className="text-[11px] text-ink-tertiary">{row.projectName}</div>
        </td>
        <td className="text-xs">{row.streamType.replace(/_/g, " ")}</td>
        <td className="text-xs whitespace-nowrap">
          {row.periodStart} → {row.periodEnd}
        </td>
        <td className="num">{fmt(row.grossRevenueMajor, row.currency)}</td>
        <td className="num">{fmt(row.directCostsMajor, row.currency)}</td>
        <td className="num font-medium">{fmt(row.netRevenueMajor, row.currency)}</td>
        <td className="num text-xs">
          {row.occupancyRate != null ? `${row.occupancyRate}%` : "—"}
        </td>
        <td className="text-right">
          <div className="inline-flex items-center gap-1.5 justify-end">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                setErr(null);
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-50"
              disabled={pending}
              onClick={onDelete}
            >
              {pending ? "…" : "Delete"}
            </button>
          </div>
          {err && (
            <div className="text-[10px] text-danger mt-1 text-right">{err}</div>
          )}
        </td>
      </tr>
      {editing && (
        <EditRow
          row={row}
          pending={pending}
          onCancel={() => setEditing(false)}
          onSubmit={(input) => {
            setErr(null);
            start(async () => {
              const res = await updateRevenueStreamAction(input);
              if (!res.ok) {
                setErr(res.error);
                return;
              }
              setEditing(false);
              router.refresh();
            });
          }}
        />
      )}
    </>
  );
}

function EditRow({
  row,
  pending,
  onCancel,
  onSubmit,
}: {
  row: RevenueStreamRowDTO;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: UpdateRevenueStreamFormInput) => void;
}) {
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const numOpt = (k: string) => {
      const v = (fd.get(k) ?? "").toString();
      return v === "" ? null : Number(v);
    };
    onSubmit({
      id: row.id,
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
  }

  return (
    <tr className="bg-muted/20">
      <td colSpan={8} className="px-3 py-3">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <L label="Stream type">
              <select name="streamType" className={inputCls} defaultValue={row.streamType}>
                {STREAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </L>
            <L label="Currency">
              <input name="currency" defaultValue={row.currency} className={inputCls} />
            </L>
            <L label="Period start" required>
              <input
                type="date"
                name="periodStart"
                required
                defaultValue={row.periodStart}
                className={inputCls}
              />
            </L>
            <L label="Period end" required>
              <input
                type="date"
                name="periodEnd"
                required
                defaultValue={row.periodEnd}
                className={inputCls}
              />
            </L>
            <L label="Gross revenue (major)" required>
              <input
                type="number"
                name="grossRevenueMajor"
                min={0}
                step="any"
                required
                defaultValue={row.grossRevenueMajor}
                className={inputCls}
              />
            </L>
            <L label="Direct costs (major)">
              <input
                type="number"
                name="directCostsMajor"
                min={0}
                step="any"
                defaultValue={row.directCostsMajor}
                className={inputCls}
              />
            </L>
            <L label="Occupancy %">
              <input
                type="number"
                name="occupancyRate"
                min={0}
                max={100}
                step="any"
                defaultValue={row.occupancyRate ?? ""}
                className={inputCls}
              />
            </L>
            <L label="ADR (major)">
              <input
                type="number"
                name="averageDailyRateMajor"
                min={0}
                step="any"
                defaultValue={row.averageDailyRateMajor ?? ""}
                className={inputCls}
              />
            </L>
            <L label="Units sold">
              <input
                type="number"
                name="unitsSold"
                min={0}
                step={1}
                defaultValue={row.unitsSold ?? ""}
                className={inputCls}
              />
            </L>
            <L label="Data source">
              <input
                name="dataSource"
                defaultValue={row.dataSource ?? ""}
                className={inputCls}
                placeholder="pms, manual…"
              />
            </L>
            <L label="Notes" span2>
              <input name="notes" defaultValue={row.notes ?? ""} className={inputCls} />
            </L>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
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
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function L({
  label,
  required,
  span2,
  children,
}: {
  label: string;
  required?: boolean;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}
    >
      <span>
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

"use client";

import type { CSSProperties } from "react";
import { useMemo, useState, useTransition } from "react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { formatMoneyMinor } from "@/lib/money";
import { enqueueAriPushAction } from "@/features/channels/manager-actions";
import type { AriGridData } from "@/features/channels/manager";

function fmtDay(iso: string): { dow: string; dn: string; weekend: boolean } {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const day = d.getUTCDay();
  return {
    dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toLowerCase(),
    dn: String(d.getUTCDate()).padStart(2, "0"),
    weekend: day === 0 || day === 6,
  };
}

/** Compact rate label from minor units (e.g. 4250000 → "425" for k display). */
function rateLabel(minor: string, currency: string): string {
  const major = Number(BigInt(minor)) / 100;
  if (major >= 1000) return `${Math.round(major / 1000)}k`;
  return formatMoneyMinor(BigInt(minor), currency).replace(/[^\d.,]/g, "");
}

export function AriPushGrid({ data }: { data: AriGridData }) {
  const [channelKey, setChannelKey] = useState(data.channelKeys[0]?.key ?? "");
  const [pending, startTransition] = useTransition();
  const [busyVilla, setBusyVilla] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ villaId: string; ok: boolean; msg: string } | null>(
    null,
  );

  const dateStart = data.dates[0];
  const dateEnd = data.dates[data.dates.length - 1];
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const headerDays = useMemo(() => data.dates.map(fmtDay), [data.dates]);

  function pushVilla(villaId: string) {
    if (!channelKey) return;
    setBusyVilla(villaId);
    const fd = new FormData();
    fd.set("villaId", villaId);
    fd.set("channelKey", channelKey);
    fd.set("dateStart", dateStart);
    fd.set("dateEnd", dateEnd);
    fd.set("eventType", "ari_full_sync");
    startTransition(async () => {
      const res = await enqueueAriPushAction(null, fd);
      setBusyVilla(null);
      setFlash({
        villaId,
        ok: res.ok,
        msg: res.ok ? "Queued → simulated-sent" : res.error ?? "Push failed",
      });
      window.setTimeout(() => setFlash(null), 4000);
    });
  }

  if (data.villas.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        No active villas to push. Add a villa to build an ARI grid.
      </p>
    );
  }

  const channelName =
    data.channelKeys.find((c) => c.key === channelKey)?.name ?? "channel";

  return (
    <div className="flex flex-col gap-3.5">
      {/* Toolbar — mirrors the mock filter-bar */}
      <div className="filter-bar mb-0">
        <label className="field-label" htmlFor="ari-channel">
          Target channel
        </label>
        <select
          id="ari-channel"
          value={channelKey}
          onChange={(e) => setChannelKey(e.target.value)}
          className="select max-w-[200px]"
        >
          {data.channelKeys.length === 0 ? (
            <option value="">No active OTA channels</option>
          ) : (
            data.channelKeys.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))
          )}
        </select>
        <span className="divider" />
        <span className="font-mono text-[11px] text-ink-3">
          {dateStart} — {dateEnd} · {data.dates.length} nights
        </span>
        <HandoffBadge tone="info">Simulated — API deferred to launch</HandoffBadge>
      </div>

      {/* ChannelGrid-styled ARI matrix */}
      <div className="overflow-x-auto">
        <div
          className="channel-grid"
          style={{ "--cols": data.dates.length } as CSSProperties}
        >
          <div className="cg-head">
            <div className="corner">villa · {channelName}</div>
            {data.dates.map((iso, i) => {
              const d = headerDays[i];
              const cls = `day${d.weekend ? " weekend" : ""}${iso === today ? " today" : ""}`;
              return (
                <div key={iso} className={cls}>
                  <div className="dow">{d.dow}</div>
                  <div className="dn">{d.dn}</div>
                </div>
              );
            })}
          </div>

          {data.villas.map((v) => (
            <div className="cg-row ch-terra" key={v.villaId}>
              <div className="label">
                <span className="ch" aria-hidden />
                <span className="truncate">{v.villaName}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm ml-auto !px-2.5 !py-1"
                  disabled={!channelKey || (pending && busyVilla === v.villaId)}
                  onClick={() => pushVilla(v.villaId)}
                >
                  {pending && busyVilla === v.villaId ? "Pushing…" : "Push"}
                </button>
              </div>
              {v.cells.map((c, i) => {
                const d = headerDays[i];
                const cls = [
                  "cg-cell",
                  d?.weekend ? "weekend" : "",
                  c.available ? "" : "booked",
                  c.lastPushStatus ? "synced" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={c.date}
                    className={cls}
                    title={
                      c.available
                        ? `Open · ${formatMoneyMinor(BigInt(c.rateMinor), c.currency)}`
                        : `Closed · ${c.bookingCode ?? "booked"}`
                    }
                  >
                    {c.available ? (
                      <span className="rate">{rateLabel(c.rateMinor, c.currency)}</span>
                    ) : (
                      <span className="rate text-[9.5px] uppercase tracking-wide">
                        {c.bookingCode ? "bk" : "—"}
                      </span>
                    )}
                    {c.lastPushStatus && <span className="indicator" aria-hidden />}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="cg-legend">
            <span className="item">
              <span className="sw sw-ink" />
              open · rate shown
            </span>
            <span className="item">
              <span className="sw sw-ok" />
              booked
            </span>
            <span className="item">
              <span className="sw sw-ok" />
              push recorded
            </span>
            <span className="ml-auto font-mono text-[10.5px] text-ink-4">
              push records the exact ARI payload — no live OTA call is made
            </span>
          </div>
        </div>
      </div>

      {flash && (
        <p className={"text-[11px] " + (flash.ok ? "text-ok" : "text-danger")}>
          {flash.msg}
        </p>
      )}
    </div>
  );
}

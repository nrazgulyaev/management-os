"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoneyMinor } from "@/lib/money";
import { enqueueAriPushAction } from "@/features/channels/manager-actions";
import type { AriGridData } from "@/features/channels/manager";

function fmtDay(iso: string): { dow: string; dm: string } {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return {
    dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    dm: d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
  };
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
      <p className="text-sm text-ink-tertiary">
        No active villas to push. Add a villa to build an ARI grid.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-ink-tertiary" htmlFor="ari-channel">
          Target channel
        </label>
        <select
          id="ari-channel"
          value={channelKey}
          onChange={(e) => setChannelKey(e.target.value)}
          className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
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
        <span className="text-xs text-ink-tertiary">
          {dateStart} → {dateEnd} · {data.dates.length} nights
        </span>
        <Badge tone="info">Simulated — API integration deferred to launch</Badge>
      </div>

      <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-canvas/50 text-[11px] uppercase tracking-widest text-ink-tertiary">
              <th className="sticky left-0 z-10 bg-canvas/50 px-3 py-2 text-left font-medium">
                Villa
              </th>
              {headerDays.map((d, i) => (
                <th key={data.dates[i]} className="px-2 py-2 text-center font-medium">
                  <div className="text-ink-secondary">{d.dow}</div>
                  <div className="text-[10px] text-ink-tertiary">{d.dm}</div>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Push</th>
            </tr>
          </thead>
          <tbody>
            {data.villas.map((v) => (
              <tr key={v.villaId} className="border-t border-line-soft">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                  <div className="font-medium text-ink">{v.villaName}</div>
                  <div className="font-mono text-[11px] text-ink-tertiary">{v.unitCode}</div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {formatMoneyMinor(BigInt(v.baseRateMinor), "USD")}/night
                  </div>
                </td>
                {v.cells.map((c) => (
                  <td key={c.date} className="px-1 py-2 text-center align-top">
                    <div
                      className={
                        "mx-auto flex h-9 w-12 flex-col items-center justify-center rounded " +
                        (c.available
                          ? "bg-success-weak/40 text-success"
                          : "bg-muted text-ink-tertiary")
                      }
                      title={
                        c.available
                          ? `Open · ${formatMoneyMinor(BigInt(c.rateMinor), c.currency)}`
                          : `Closed · ${c.bookingCode ?? "booked"}`
                      }
                    >
                      <span className="text-[10px] font-medium leading-none">
                        {c.available ? "open" : "closed"}
                      </span>
                      {c.lastPushStatus && (
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2 text-right align-top">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!channelKey || (pending && busyVilla === v.villaId)}
                    onClick={() => pushVilla(v.villaId)}
                  >
                    {pending && busyVilla === v.villaId ? "Pushing…" : "Push"}
                  </Button>
                  {flash && flash.villaId === v.villaId && (
                    <div
                      className={
                        "mt-1 text-[11px] " +
                        (flash.ok ? "text-success" : "text-danger")
                      }
                    >
                      {flash.msg}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-tertiary">
        Green = open to sell at the shown nightly rate; grey = closed by a confirmed
        booking. A dot marks nights already covered by a simulated push. Pushing records
        the exact ARI payload that would be transmitted — no live OTA call is made.
      </p>
    </div>
  );
}

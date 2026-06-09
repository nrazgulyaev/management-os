"use client";

import { useState, useTransition } from "react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { retryConnectionSyncAction } from "@/features/channels/manager-actions";
import type { ConnectionSyncHealth } from "@/features/channels/manager";

const CHANNEL_LABELS: Record<string, string> = {
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  trip_com: "Trip.com",
  agoda: "Agoda",
  expedia: "Expedia",
  vrbo: "Vrbo",
  hotels_com: "Hotels.com",
  direct: "Direct",
};

const healthTone: Record<ConnectionSyncHealth["health"], "ok" | "warn" | "danger"> = {
  ok: "ok",
  warn: "warn",
  down: "danger",
};

const healthLabel: Record<ConnectionSyncHealth["health"], string> = {
  ok: "Healthy",
  warn: "Degraded",
  down: "Failing",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export function SyncHealth({ rows }: { rows: ConnectionSyncHealth[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msgById, setMsgById] = useState<Record<string, { ok: boolean; text: string }>>({});

  function retry(connectionId: string) {
    setBusyId(connectionId);
    const fd = new FormData();
    fd.set("connectionId", connectionId);
    fd.set("syncType", "inventory_push");
    startTransition(async () => {
      const res = await retryConnectionSyncAction(null, fd);
      setBusyId(null);
      setMsgById((prev) => ({
        ...prev,
        [connectionId]: {
          ok: res.ok,
          text: res.ok ? "Retried (simulated)" : res.error ?? "Retry failed",
        },
      }));
    });
  }

  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="title">No channel connections yet</div>
        <div className="copy">
          Connect a villa to a channel to track per-connection sync health and retries
          here.
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Connection</th>
              <th>Channel</th>
              <th>Health</th>
              <th>Last inventory sync</th>
              <th>Last reservation pull</th>
              <th className="num">Retry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const msg = msgById[r.connectionId];
              return (
                <tr key={r.connectionId}>
                  <td>
                    <div className="row-title">{r.villaName ?? "—"}</div>
                    <div className="font-mono text-[11px] text-ink-4">
                      {r.unitCode ?? r.connectionId.slice(0, 8)}
                    </div>
                  </td>
                  <td className="text-ink-2">{CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                  <td>
                    <HandoffBadge tone={healthTone[r.health]}>
                      {healthLabel[r.health]}
                    </HandoffBadge>
                    {r.recentFailures > 0 && (
                      <span className="ml-2 font-mono text-[11px] text-ink-3">
                        {r.recentFailures} fail{r.recentFailures === 1 ? "" : "s"}/7d
                      </span>
                    )}
                  </td>
                  <td className="text-[12.5px] text-ink-2">
                    {fmtTime(r.lastInventorySyncAt)}
                    {r.lastInventorySyncError && (
                      <div className="text-[11px] text-danger">
                        {r.lastInventorySyncError}
                      </div>
                    )}
                  </td>
                  <td className="text-[12.5px] text-ink-2">
                    {fmtTime(r.lastReservationSyncAt)}
                    {r.lastReservationSyncError && (
                      <div className="text-[11px] text-danger">
                        {r.lastReservationSyncError}
                      </div>
                    )}
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={pending && busyId === r.connectionId}
                      onClick={() => retry(r.connectionId)}
                    >
                      {pending && busyId === r.connectionId ? "Retrying…" : "Retry sync"}
                    </button>
                    {msg && (
                      <div
                        className={
                          "mt-1 text-[11px] " + (msg.ok ? "text-ok" : "text-danger")
                        }
                      >
                        {msg.text}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

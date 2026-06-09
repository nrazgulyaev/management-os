"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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

const healthTone: Record<ConnectionSyncHealth["health"], "success" | "warning" | "danger"> =
  {
    ok: "success",
    warn: "warning",
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
      <p className="text-sm text-ink-tertiary">
        No channel connections yet. Connect a villa to a channel to track sync health here.
      </p>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Connection</TH>
          <TH>Channel</TH>
          <TH>Health</TH>
          <TH>Last inventory sync</TH>
          <TH>Last reservation pull</TH>
          <TH className="text-right">Retry</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => {
          const msg = msgById[r.connectionId];
          return (
            <TR key={r.connectionId}>
              <TD className="text-ink">
                <div className="font-medium">{r.villaName ?? "—"}</div>
                <div className="font-mono text-[11px] text-ink-tertiary">
                  {r.unitCode ?? r.connectionId.slice(0, 8)}
                </div>
              </TD>
              <TD className="text-ink-secondary">
                {CHANNEL_LABELS[r.channel] ?? r.channel}
              </TD>
              <TD>
                <Badge tone={healthTone[r.health]}>{healthLabel[r.health]}</Badge>
                {r.recentFailures > 0 && (
                  <span className="ml-2 text-[11px] text-ink-tertiary">
                    {r.recentFailures} fail{r.recentFailures === 1 ? "" : "s"}/7d
                  </span>
                )}
              </TD>
              <TD className="text-xs text-ink-secondary">
                {fmtTime(r.lastInventorySyncAt)}
                {r.lastInventorySyncError && (
                  <div className="text-[11px] text-danger">{r.lastInventorySyncError}</div>
                )}
              </TD>
              <TD className="text-xs text-ink-secondary">
                {fmtTime(r.lastReservationSyncAt)}
                {r.lastReservationSyncError && (
                  <div className="text-[11px] text-danger">{r.lastReservationSyncError}</div>
                )}
              </TD>
              <TD className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending && busyId === r.connectionId}
                  onClick={() => retry(r.connectionId)}
                >
                  {pending && busyId === r.connectionId ? "Retrying…" : "Retry sync"}
                </Button>
                {msg && (
                  <div
                    className={"mt-1 text-[11px] " + (msg.ok ? "text-success" : "text-danger")}
                  >
                    {msg.text}
                  </div>
                )}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

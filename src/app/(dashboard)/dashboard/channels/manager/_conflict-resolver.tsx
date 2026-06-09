"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoneyMinor } from "@/lib/money";
import { resolveDoubleBookingAction } from "@/features/channels/manager-actions";
import type { DoubleBookingConflict } from "@/features/channels/manager";

export function ConflictResolver({ conflicts }: { conflicts: DoubleBookingConflict[] }) {
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});

  function resolve(conflict: DoubleBookingConflict, winnerId: string, loserId: string) {
    setBusyKey(conflict.conflictKey);
    const fd = new FormData();
    fd.set("winnerBookingId", winnerId);
    fd.set("loserBookingId", loserId);
    startTransition(async () => {
      const res = await resolveDoubleBookingAction(null, fd);
      setBusyKey(null);
      if (res.ok) {
        setResolved((prev) => new Set(prev).add(conflict.conflictKey));
      } else {
        setErrorByKey((prev) => ({
          ...prev,
          [conflict.conflictKey]: res.error ?? "Failed to resolve.",
        }));
      }
    });
  }

  if (conflicts.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        No cross-channel double-bookings detected. Overlapping stays on the same villa
        from different channels would surface here for resolution.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {conflicts.map((c) => {
        const done = resolved.has(c.conflictKey);
        const busy = pending && busyKey === c.conflictKey;
        return (
          <article
            key={c.conflictKey}
            className={
              "rounded-md border p-4 " +
              (done
                ? "border-success/40 bg-success-weak/15"
                : "border-warning/40 bg-warning-weak/15")
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{c.villaName}</span>
                <span className="font-mono text-[11px] text-ink-tertiary">{c.unitCode}</span>
                <Badge tone={done ? "success" : "warning"}>
                  {done ? "Resolved" : "Double-booked"}
                </Badge>
              </div>
              <span className="text-xs text-ink-tertiary">
                Overlap {c.overlapStart} → {c.overlapEnd} · {c.overlapNights} night
                {c.overlapNights === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {c.bookings.map((b) => (
                <div
                  key={b.bookingId}
                  className="rounded border border-line-soft bg-surface p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink">{b.bookingCode}</span>
                    <Badge tone="neutral">{b.channelName}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-ink-secondary">
                    {b.checkIn} → {b.checkOut}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-tertiary">
                    {formatMoneyMinor(BigInt(b.grossAmountMinor), b.currency)} · {b.status}
                  </div>
                  {!done && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      disabled={busy}
                      onClick={() =>
                        resolve(
                          c,
                          b.bookingId,
                          c.bookings.find((x) => x.bookingId !== b.bookingId)!.bookingId,
                        )
                      }
                    >
                      {busy ? "Resolving…" : "Keep this — close the other"}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {errorByKey[c.conflictKey] && (
              <p className="mt-2 text-xs text-danger">{errorByKey[c.conflictKey]}</p>
            )}
            {done && (
              <p className="mt-2 text-xs text-success">
                Winner kept; the other booking was cancelled and its nights reopened.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

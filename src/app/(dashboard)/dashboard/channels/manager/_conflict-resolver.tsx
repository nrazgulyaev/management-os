"use client";

import { useState, useTransition } from "react";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="empty">
        <div className="title">No double-bookings</div>
        <div className="copy">
          Overlapping stays on the same villa from different channels would surface
          here for resolution. Conflicts never auto-resolve.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {conflicts.map((c) => {
        const done = resolved.has(c.conflictKey);
        const busy = pending && busyKey === c.conflictKey;
        return (
          <article
            key={c.conflictKey}
            className={
              "card card-pad " +
              (done ? "!border-ok/40" : "!border-warning/40")
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="font-display text-[15px] text-ink">{c.villaName}</span>
                <span className="font-mono text-[11px] text-ink-3">{c.unitCode}</span>
                <HandoffBadge tone={done ? "ok" : "warn"}>
                  {done ? "Resolved" : "Double-booked"}
                </HandoffBadge>
              </div>
              <span className="font-mono text-[11px] text-ink-3">
                overlap {c.overlapStart} → {c.overlapEnd} · {c.overlapNights} night
                {c.overlapNights === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-3.5 grid gap-2.5 md:grid-cols-2">
              {c.bookings.map((b) => (
                <label
                  key={b.bookingId}
                  className="flex flex-col gap-1 rounded-[10px] border border-line-soft bg-paper p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink">{b.bookingCode}</span>
                    <HandoffBadge>{b.channelName}</HandoffBadge>
                  </div>
                  <div className="font-mono text-[11px] text-ink-3">
                    {b.checkIn} → {b.checkOut}
                  </div>
                  <div className="font-mono text-[11px] text-ink-3">
                    {formatMoneyMinor(BigInt(b.grossAmountMinor), b.currency)} · {b.status}
                  </div>
                  {!done && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm mt-2"
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
                    </button>
                  )}
                </label>
              ))}
            </div>

            <div className="mt-3.5 rounded-[10px] bg-cream-warm px-3.5 py-3 font-mono text-[11px] leading-relaxed text-ink-3">
              Resolving keeps the chosen booking and cancels the other, reopening its
              nights. The OTA block is re-synced atomically — no silent partial state.
            </div>

            {errorByKey[c.conflictKey] && (
              <p className="mt-2 text-[11px] text-danger">{errorByKey[c.conflictKey]}</p>
            )}
            {done && (
              <p className="mt-2 text-[11px] text-ok">
                Winner kept; the other booking was cancelled and its nights reopened.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

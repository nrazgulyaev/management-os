"use client";

/**
 * Wire-up sweep — reservation lifecycle row actions.
 *
 * The mutations (`markReservationPaid`, `extendReservationExpiry`,
 * `cancelReservation`) already existed and write to the DB, but no UI
 * control reached them — the reservations table was read-only. This
 * mounts contextual per-row buttons + inline forms over the existing
 * server actions. (Convert-to-contract is wired separately with the
 * contract template/scheme picker.)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  markReservationPaid,
  extendReservationExpiry,
  cancelReservation,
} from "@/lib/development/server/reservation-actions";

type Status =
  | "pending_payment"
  | "active"
  | "expired"
  | "converted_to_contract"
  | "cancelled"
  | "refunded";

type Panel = "paid" | "extend" | "cancel";

function defaultExtendDate(expiresAt: string | null): string {
  const base = expiresAt ? new Date(expiresAt) : new Date();
  base.setDate(base.getDate() + 14);
  return base.toISOString().slice(0, 10); // yyyy-mm-dd
}

export function ReservationRowActions({
  reservationId,
  status,
  expiresAt,
}: {
  reservationId: string;
  status: Status;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Only open reservations have a lifecycle to act on.
  if (status !== "pending_payment" && status !== "active") {
    return <span className="text-xs text-ink-tertiary">—</span>;
  }

  function run(
    fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
  ) {
    setErr(null);
    start(async () => {
      const r = await fn(fd);
      if (!r.ok) {
        setErr(r.error ?? "Action failed.");
        return;
      }
      setPanel(null);
      router.refresh();
    });
  }

  function toggle(p: Panel) {
    setErr(null);
    setPanel((cur) => (cur === p ? null : p));
  }

  const btn =
    "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
  const dangerBtn =
    "text-xs px-2 py-1 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "pending_payment" && (
          <button type="button" className={btn} disabled={pending} onClick={() => toggle("paid")}>
            Mark paid
          </button>
        )}
        <button type="button" className={btn} disabled={pending} onClick={() => toggle("extend")}>
          Extend
        </button>
        <button type="button" className={dangerBtn} disabled={pending} onClick={() => toggle("cancel")}>
          Cancel
        </button>
      </div>

      {panel === "paid" && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("reservationId", reservationId);
            run(markReservationPaid, fd);
          }}
        >
          <input
            name="paymentReference"
            placeholder="Payment ref (optional)"
            className="text-xs px-2 py-1 rounded border border-line-soft bg-surface w-40"
          />
          <button type="submit" className={btn} disabled={pending}>
            {pending ? "…" : "Confirm paid"}
          </button>
        </form>
      )}

      {panel === "extend" && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const date = (fd.get("date") ?? "").toString();
            if (!date) {
              setErr("Pick a new expiry date.");
              return;
            }
            const iso = new Date(`${date}T23:59:59Z`).toISOString();
            const out = new FormData();
            out.set("reservationId", reservationId);
            out.set("newExpiryDate", iso);
            run(extendReservationExpiry, out);
          }}
        >
          <input
            type="date"
            name="date"
            defaultValue={defaultExtendDate(expiresAt)}
            className="text-xs px-2 py-1 rounded border border-line-soft bg-surface"
          />
          <button type="submit" className={btn} disabled={pending}>
            {pending ? "…" : "Extend"}
          </button>
        </form>
      )}

      {panel === "cancel" && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("reservationId", reservationId);
            run(cancelReservation, fd);
          }}
        >
          <input
            name="reason"
            required
            minLength={2}
            placeholder="Reason"
            className="text-xs px-2 py-1 rounded border border-line-soft bg-surface w-40"
          />
          <button type="submit" className={dangerBtn} disabled={pending}>
            {pending ? "…" : "Confirm cancel"}
          </button>
        </form>
      )}

      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}

"use client";

/**
 * Wire-up sweep — discount approve/reject actions.
 *
 * `approveDiscount` / `rejectDiscount` already existed (real DB writes +
 * server-side authority re-check) but no UI reached them — the
 * "awaiting approval" cards were display-only. This mounts Approve /
 * Reject over the existing actions. (`applyDiscountToContract` is wired
 * separately from the contract detail surface.)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  approveDiscount,
  rejectDiscount,
} from "@/lib/development/server/discount-actions";

export function DiscountApprovalActions({
  discountId,
  approverUserId,
}: {
  discountId: string;
  approverUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [rejecting, setRejecting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function approve() {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("discountId", discountId);
      fd.set("approverUserId", approverUserId);
      const r = await approveDiscount(fd);
      if (!r.ok) {
        setErr(r.error ?? "Approve failed.");
        return;
      }
      router.refresh();
    });
  }

  function reject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("discountId", discountId);
    fd.set("approverUserId", approverUserId);
    start(async () => {
      const r = await rejectDiscount(fd);
      if (!r.ok) {
        setErr(r.error ?? "Reject failed.");
        return;
      }
      setRejecting(false);
      router.refresh();
    });
  }

  const btn = "btn btn-dark btn-sm disabled:opacity-50";
  const dangerBtn =
    "btn btn-sm border border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {!rejecting ? (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} disabled={pending} onClick={approve}>
            {pending ? "…" : "Approve"}
          </button>
          <button
            type="button"
            className={dangerBtn}
            disabled={pending}
            onClick={() => {
              setErr(null);
              setRejecting(true);
            }}
          >
            Reject
          </button>
        </div>
      ) : (
        <form className="flex items-center gap-2" onSubmit={reject}>
          <input
            name="reason"
            required
            minLength={2}
            placeholder="Rejection reason"
            className="input text-xs flex-1 min-w-0"
          />
          <button type="submit" className={dangerBtn} disabled={pending}>
            {pending ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={() => setRejecting(false)}
          >
            Cancel
          </button>
        </form>
      )}
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}

"use client";

/**
 * Wire-up sweep — "Apply to contract" for APPROVED discounts.
 *
 * `applyDiscountToContract` already existed (real DB writes: links the
 * discount to a contract group, drops the group's total to the discounted
 * amount, writes a `discount_applied` price snapshot) but no UI reached it,
 * so an approved discount dead-ended and the price never dropped. This
 * mounts the control over the existing server action; the action itself
 * still enforces permissions, tenant org-scoping, audit logging, and the
 * `status === "approved"` guard.
 *
 * Args (FormData) consumed by the action: `discountId`, `contractGroupId`,
 * `fxRateUsdToIdr`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { applyDiscountToContract } from "@/lib/development/server/discount-actions";

export interface ContractGroupOption {
  id: string;
  label: string;
  /** Contact owning the group — used to surface the best-match group first. */
  contactId: string;
  villaId: string;
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

export function ApplyDiscountToContract({
  discountId,
  discountContactId,
  discountVillaId,
  contractGroups,
}: {
  discountId: string;
  discountContactId: string;
  discountVillaId: string;
  contractGroups: ContractGroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  // Surface the contract group that matches this discount's buyer + unit
  // first; the action re-validates, so the full list stays selectable.
  const sortedGroups = React.useMemo(() => {
    const score = (g: ContractGroupOption) =>
      (g.contactId === discountContactId ? 2 : 0) +
      (g.villaId === discountVillaId ? 1 : 0);
    return [...contractGroups].sort((a, b) => score(b) - score(a));
  }, [contractGroups, discountContactId, discountVillaId]);

  const defaultGroupId = sortedGroups[0]?.id ?? "";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const contractGroupId = (fd.get("contractGroupId") ?? "").toString();
    if (!contractGroupId) {
      setErr("Pick a contract group.");
      return;
    }
    fd.set("discountId", discountId);
    start(async () => {
      const r = await applyDiscountToContract(fd);
      if (!r.ok) {
        setErr(r.error ?? "Apply failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (contractGroups.length === 0) {
    return (
      <span className="text-[11px] text-ink-3">No contract group to apply to.</span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-dark btn-sm disabled:opacity-50"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
      >
        Apply to contract
      </button>
      {open && (
        <div
          className="modal-overlay flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-1">
              Apply discount to contract
            </h2>
            <p className="text-xs text-ink-3 mb-3">
              Links the approved discount to a contract group and drops the
              group&apos;s total to the discounted price.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                Contract group
                <select
                  name="contractGroupId"
                  className={inputCls}
                  defaultValue={defaultGroupId}
                  required
                >
                  {sortedGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                FX rate (USD → IDR)
                <input
                  type="number"
                  name="fxRateUsdToIdr"
                  min={0}
                  step="any"
                  required
                  className={inputCls}
                  placeholder="e.g. 16250"
                />
              </label>
              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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
                  {pending ? "Applying…" : "Apply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

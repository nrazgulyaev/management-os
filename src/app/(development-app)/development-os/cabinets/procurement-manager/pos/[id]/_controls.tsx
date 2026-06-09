"use client";

/**
 * PO money-lifecycle controls (client island).
 *
 * Mounts the procure-to-pay money lifecycle over the real
 * material_purchase_orders backend (the page used to be a hardcoded MOCK):
 *   - Place order (draft → ordered)
 *   - Confirm receipt (PO-level money milestone)
 *   - Pay (MANUAL — PSP deferred): records an outflow transaction against
 *     the PO and advances payment_status unpaid → partially_paid → paid.
 *
 * All three call the `"use server"` wrappers in po-money-actions.ts
 * (which permission-gate + audit-log).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  placeOrderAction,
  confirmReceiptAction,
  markPoPaidAction,
} from "@/lib/development/server/po-money-actions";

const input = "text-xs px-2 py-1 rounded border border-line-soft bg-surface";

export interface BankAccountChoice {
  id: string;
  label: string;
  currency: string;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  function run<R extends { ok: boolean; error?: string }>(
    fn: (fd: FormData) => Promise<R>,
    fd: FormData,
    onOk?: (r: R) => void,
  ) {
    setErr(null);
    start(async () => {
      const r = await fn(fd);
      if (!r.ok) {
        setErr(r.error ?? "Action failed.");
        return;
      }
      onOk?.(r);
      router.refresh();
    });
  }
  return { pending, err, run };
}

/** Place order — draft → ordered. */
export function PlaceOrderControl({
  poId,
  status,
}: {
  poId: string;
  status: string;
}) {
  const { pending, err, run } = useRun();
  if (status === "cancelled") {
    return <span className="text-xs text-ink-tertiary">PO cancelled.</span>;
  }
  if (status !== "draft") {
    return (
      <span className="text-xs text-ink-tertiary">Order already placed.</span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("id", poId);
          run(placeOrderAction, fd);
        }}
      >
        {pending ? "Placing…" : "Place order"}
      </Button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

/** Confirm receipt — PO-level money milestone. */
export function ConfirmReceiptControl({
  poId,
  status,
}: {
  poId: string;
  status: string;
}) {
  const { pending, err, run } = useRun();
  if (status === "cancelled") {
    return <span className="text-xs text-ink-tertiary">PO cancelled.</span>;
  }
  if (status === "draft") {
    return (
      <span className="text-xs text-ink-tertiary">
        Place the order first.
      </span>
    );
  }
  if (status === "fully_delivered") {
    return (
      <span className="text-xs text-ink-tertiary">Receipt confirmed.</span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("id", poId);
          run(confirmReceiptAction, fd);
        }}
      >
        {pending ? "Confirming…" : "Confirm receipt"}
      </Button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

/**
 * Mark-paid form — records a manual outflow against the PO. Defaults the
 * amount to the outstanding balance (original currency) so one click can
 * settle the PO. currency mirrors the PO's order currency (recordTransaction
 * rejects account/currency mismatches).
 */
export function MarkPoPaidControl({
  poId,
  currency,
  remainingMinor,
  bankAccounts,
  paymentStatus,
  status,
}: {
  poId: string;
  currency: string;
  /** Outstanding (total − paid) in the PO's original minor units. */
  remainingMinor: string;
  bankAccounts: BankAccountChoice[];
  paymentStatus: string;
  status: string;
}) {
  const { pending, err, run } = useRun();
  const [open, setOpen] = React.useState(false);

  const minorDivisor = currency === "USDT" ? 1_000_000 : 100;
  const remainingMajor = (Number(remainingMinor) / minorDivisor).toFixed(
    currency === "USDT" || currency === "USD" || currency === "EUR" ? 2 : 0,
  );
  const matchingAccounts = bankAccounts.filter((b) => b.currency === currency);
  const usableAccounts =
    matchingAccounts.length > 0 ? matchingAccounts : bankAccounts;

  if (status === "cancelled") {
    return (
      <span className="text-xs text-ink-tertiary">
        Cancelled — payments disabled.
      </span>
    );
  }
  if (paymentStatus === "paid") {
    return (
      <span className="text-xs text-ink-tertiary">
        Fully paid — no balance remaining.
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="text-xs text-ink-tertiary">
        Place the order before paying.
      </span>
    );
  }
  if (usableAccounts.length === 0) {
    return (
      <span className="text-xs text-ink-tertiary">
        No bank account available to record a payment.
      </span>
    );
  }

  if (!open) {
    return (
      <Button size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Record payment
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const amountMajor = Number(fd.get("amountMajor"));
        const minor = Math.round(amountMajor * minorDivisor);
        fd.set("amountMinor", String(minor));
        fd.delete("amountMajor");
        fd.set("poId", poId);
        fd.set("currency", currency);
        run(markPoPaidAction, fd, () => setOpen(false));
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
            Account
          </span>
          <select name="bankAccountId" required className={input}>
            {usableAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} · {b.currency}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
            Amount ({currency})
          </span>
          <input
            name="amountMajor"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={remainingMajor}
            className={`${input} w-28 text-right`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
            FX → USD
          </span>
          <input
            name="fxRate"
            type="text"
            defaultValue={currency === "USD" ? "1" : ""}
            placeholder="1"
            pattern="\d+(\.\d+)?"
            required
            className={`${input} w-20`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
            Date
          </span>
          <input
            name="transactionDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={input}
          />
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
          Description
        </span>
        <input
          name="description"
          required
          minLength={1}
          defaultValue="Payment against purchase order"
          className={`${input} w-full`}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "Recording…" : "Confirm payment"}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        {err && <span className="text-[10px] text-danger">{err}</span>}
      </div>
    </form>
  );
}

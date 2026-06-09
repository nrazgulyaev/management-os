"use client";

/**
 * Commitments-lifecycle controls (client island).
 *
 * Mounts the approve → pay (money) lifecycle over the orphaned
 * dev_commitments_ledger backend:
 *   - Mark paid (MANUAL — PSP deferred): records an outflow transaction
 *     linked to the commitment so its status auto-recomputes
 *     open → partially_paid → completed.
 *   - Manual status override: operator escape hatch.
 *   - Cancel commitment: reason required (min 3 chars).
 *
 * All three call the `"use server"` wrappers in
 * commitments-ledger-form-actions.ts (which permission-gate + audit-log).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  cancelCommitmentLedgerAction,
  markCommitmentPaidAction,
  updateCommitmentLedgerStatusAction,
} from "@/lib/development/server/commitments-ledger-form-actions";

const btn =
  "text-xs px-2.5 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
const primaryBtn =
  "text-xs px-2.5 py-1 rounded border border-accent/40 bg-accent/5 text-accent hover:bg-accent/10 disabled:opacity-50";
const dangerBtn =
  "text-xs px-2.5 py-1 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";
const input =
  "text-xs px-2 py-1 rounded border border-line-soft bg-surface";

export interface BankAccountChoice {
  id: string;
  label: string;
  currency: string;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  function run<R extends { ok: boolean; error?: string }>(
    fn: (fd: FormData) => Promise<R>,
    fd: FormData,
    onOk?: (r: R) => void,
  ) {
    setErr(null);
    setInfo(null);
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
  return { pending, err, info, setInfo, run };
}

/**
 * Mark-paid form — records a manual outflow against the commitment.
 * Defaults amount to the remaining balance so a single click completes
 * the PO; currency mirrors the commitment's original currency.
 */
export function MarkCommitmentPaidControl({
  commitmentId,
  projectId,
  categoryId,
  currency,
  remainingMinor,
  bankAccounts,
  status,
}: {
  commitmentId: string;
  projectId: string;
  categoryId: string;
  currency: string;
  /** Remaining (committed − paid) in the commitment's original minor units. */
  remainingMinor: string;
  bankAccounts: BankAccountChoice[];
  status: string;
}) {
  const { pending, err, info, run } = useRun();
  const [open, setOpen] = React.useState(false);

  const minorDivisor = currency === "USDT" ? 1_000_000 : 100;
  const remainingMajor = (Number(remainingMinor) / minorDivisor).toFixed(
    currency === "USDT" || currency === "USD" || currency === "EUR" ? 2 : 0,
  );
  // Prefer an account whose currency matches the commitment (recordTransaction
  // rejects currency mismatches).
  const matchingAccounts = bankAccounts.filter((b) => b.currency === currency);
  const usableAccounts =
    matchingAccounts.length > 0 ? matchingAccounts : bankAccounts;

  if (status === "completed" || status === "cancelled") {
    return (
      <span className="text-xs text-ink-tertiary">
        {status === "completed"
          ? "Fully paid — no balance remaining."
          : "Cancelled — payments disabled."}
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
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          className={primaryBtn}
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          Record payment
        </button>
        {info && <span className="text-[10px] text-success">{info}</span>}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // amount entered in MAJOR units → convert to minor for the action.
        const amountMajor = Number(fd.get("amountMajor"));
        const minor = Math.round(amountMajor * minorDivisor);
        fd.set("amountMinor", String(minor));
        fd.delete("amountMajor");
        fd.set("commitmentId", commitmentId);
        fd.set("currency", currency);
        fd.set("projectId", projectId);
        fd.set("categoryId", categoryId);
        run(markCommitmentPaidAction, fd, () => setOpen(false));
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
          defaultValue="Payment against commitment"
          className={`${input} w-full`}
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" className={primaryBtn} disabled={pending}>
          {pending ? "Recording…" : "Confirm payment"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        {err && <span className="text-[10px] text-danger">{err}</span>}
      </div>
    </form>
  );
}

/** Manual status override (operator escape hatch). */
export function CommitmentStatusOverrideControl({
  commitmentId,
  currentStatus,
}: {
  commitmentId: string;
  currentStatus: string;
}) {
  const { pending, err, run } = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("id", commitmentId);
        run(updateCommitmentLedgerStatusAction, fd);
      }}
    >
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
          Override status
        </span>
        <select name="status" defaultValue={currentStatus} className={input}>
          <option value="open">Open</option>
          <option value="partially_paid">Partially paid</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <button type="submit" className={btn} disabled={pending}>
        {pending ? "…" : "Apply"}
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </form>
  );
}

/** Cancel commitment (reason required). */
export function CancelCommitmentControl({
  commitmentId,
  status,
}: {
  commitmentId: string;
  status: string;
}) {
  const { pending, err, run } = useRun();
  const [open, setOpen] = React.useState(false);

  if (status === "cancelled") {
    return <span className="text-xs text-ink-tertiary">Already cancelled.</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        className={dangerBtn}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Cancel commitment
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("id", commitmentId);
        run(cancelCommitmentLedgerAction, fd, () => setOpen(false));
      }}
    >
      <input
        name="reason"
        required
        minLength={3}
        placeholder="Reason (min 3 chars)"
        className={`${input} w-48`}
      />
      <button type="submit" className={dangerBtn} disabled={pending}>
        {pending ? "…" : "Confirm cancel"}
      </button>
      <button
        type="button"
        className={btn}
        disabled={pending}
        onClick={() => setOpen(false)}
      >
        Keep
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </form>
  );
}

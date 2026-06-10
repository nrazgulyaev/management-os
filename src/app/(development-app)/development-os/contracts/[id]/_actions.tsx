"use client";

/**
 * Wire-up sweep — contract group lifecycle actions.
 *
 * The detail page rendered child contracts + milestones read-only.
 * `signContract`, `issueInvoiceForMilestone`, and `cancelContractGroup`
 * already existed (real DB writes + cascade logic) but no UI reached
 * them. These are thin controls over the existing actions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  signContract,
  cancelContractGroup,
} from "@/lib/development/server/contract-actions";
import { issueInvoiceForMilestone } from "@/lib/development/server/invoice-actions";

const btn = "btn btn-dark btn-sm disabled:opacity-50";
const dangerBtn =
  "btn btn-sm border border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-50";

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  function run(
    fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    after?: () => void,
  ) {
    setErr(null);
    start(async () => {
      const r = await fn(fd);
      if (!r.ok) {
        setErr(r.error ?? "Action failed.");
        return;
      }
      after?.();
      router.refresh();
    });
  }
  return { pending, err, run };
}

export function SignContractButton({ contractId }: { contractId: string }) {
  const { pending, err, run } = useRun();
  return (
    <div className="mt-1 flex flex-col items-end gap-1">
      <button
        type="button"
        className={btn}
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("contractId", contractId);
          run(signContract, fd);
        }}
      >
        {pending ? "…" : "Sign"}
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

export function IssueInvoiceButton({ milestoneId }: { milestoneId: string }) {
  const { pending, err, run } = useRun();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={btn}
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("milestoneId", milestoneId);
          run(issueInvoiceForMilestone, fd);
        }}
      >
        {pending ? "…" : "Issue invoice"}
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

export function CancelGroupButton({
  contractGroupId,
}: {
  contractGroupId: string;
}) {
  const { pending, err, run } = useRun();
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <button
        type="button"
        className={dangerBtn}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Cancel contract
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("contractGroupId", contractGroupId);
        run(cancelContractGroup, fd, () => setOpen(false));
      }}
    >
      <input
        name="reason"
        required
        minLength={2}
        placeholder="Reason"
        className="input text-xs w-40"
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

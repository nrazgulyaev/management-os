"use client";

/**
 * Wire-up sweep — milestone invoice lifecycle controls.
 *
 * The milestone invoices list rendered rows read-only. `generateInvoicePDF`,
 * `sendInvoice`, and `voidInvoice` already existed (real DB writes + PDF
 * render + email + audit, org-scoped) with no UI caller. These are thin
 * controls over the existing FormData server actions — no adapter, since
 * each already takes FormData, returns {ok,error}, and revalidates its
 * own paths. Buttons are gated by invoice status so we never post a call
 * the action would reject.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  generateInvoicePDF,
  sendInvoice,
  voidInvoice,
} from "@/lib/development/server/invoice-actions";
import type { InvoiceStatus } from "@/lib/development/types/payments";

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

const rowBtn =
  "btn btn-secondary btn-sm disabled:opacity-50 whitespace-nowrap";
const dangerBtn =
  "btn btn-sm border border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-50 whitespace-nowrap";

/**
 * Row-level lifecycle actions for one milestone invoice.
 *
 * Status gating (InvoiceStatus = draft|sent|viewed|paid|overdue|void):
 *  - Generate PDF: any status except `void` (idempotent; re-links existing doc).
 *  - Send: not `paid`, not `void` (send renders the PDF then emails; allowed
 *    while a balance is still collectable — draft/sent/viewed/overdue).
 *  - Void: not `paid`, not `void`.
 */
export function InvoiceRowControls({
  invoiceId,
  status,
  hasDocument,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  hasDocument: boolean;
}) {
  const { pending, err, run } = useRun();
  const [voiding, setVoiding] = React.useState(false);

  const canGenerate = status !== "void";
  const canSend = status !== "paid" && status !== "void";
  const canVoid = status !== "paid" && status !== "void";

  function generate() {
    const fd = new FormData();
    fd.set("invoiceId", invoiceId);
    run(generateInvoicePDF, fd);
  }

  function send() {
    const fd = new FormData();
    fd.set("invoiceId", invoiceId);
    run(sendInvoice, fd);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {voiding ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("invoiceId", invoiceId);
            run(voidInvoice, fd, () => setVoiding(false));
          }}
        >
          <input
            name="reason"
            required
            minLength={2}
            maxLength={500}
            placeholder="Reason"
            className="input text-xs w-40"
          />
          <button type="submit" className={dangerBtn} disabled={pending}>
            {pending ? "…" : "Confirm void"}
          </button>
          <button
            type="button"
            className={rowBtn}
            disabled={pending}
            onClick={() => setVoiding(false)}
          >
            Keep
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {canGenerate && (
            <button
              type="button"
              className={rowBtn}
              disabled={pending}
              onClick={generate}
            >
              {pending ? "…" : hasDocument ? "Regenerate PDF" : "Generate PDF"}
            </button>
          )}
          {canSend && (
            <button
              type="button"
              className={rowBtn}
              disabled={pending}
              onClick={send}
            >
              {pending ? "…" : status === "draft" ? "Send" : "Resend"}
            </button>
          )}
          {canVoid && (
            <button
              type="button"
              className={dangerBtn}
              disabled={pending}
              onClick={() => setVoiding(true)}
            >
              Void
            </button>
          )}
        </div>
      )}
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

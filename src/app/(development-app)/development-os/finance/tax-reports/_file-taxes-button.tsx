"use client";

/**
 * ID-TAX (0164) — the mock's "File taxes" action: files every finalized
 * (not-yet-filed) declaration of the selected period in one shot, stamping
 * one shared DJP reference. Disabled — with the reason in the tooltip —
 * while drafts with nonzero tax remain or nothing awaits filing.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { fileTaxesForPeriod } from "@/lib/development/server/tax/tax-actions";

export function FileTaxesButton({
  periodStart,
  periodEnd,
  eligibleCount,
  draftBlockers,
}: {
  periodStart: string;
  periodEnd: string;
  /** finalized/submitted, unfiled declarations in the period. */
  eligibleCount: number;
  /** unfiled drafts with nonzero tax (block the batch filing). */
  draftBlockers: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const disabled = pending || eligibleCount === 0;
  const title =
    eligibleCount === 0
      ? draftBlockers > 0
        ? `Finalize ${draftBlockers} draft declaration(s) first`
        : "Nothing awaiting filing for this period"
      : `File ${eligibleCount} declaration(s) with DJP`;

  function go() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const r = await fileTaxesForPeriod({ periodStart, periodEnd });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setMsg(`Filed ${r.filed} · ${r.djpReference}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-amber btn-sm"
        disabled={disabled}
        title={title}
        onClick={go}
      >
        {pending ? "Filing…" : "File taxes"}
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
      {msg && <span className="text-[10px] text-[var(--ink-3)]">{msg}</span>}
    </div>
  );
}

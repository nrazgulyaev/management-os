"use client";

/**
 * ID-TAX (0164) — operator-triggered regeneration of the selected period's
 * declarations from dev_transactions (same path the monthly cron walks).
 * Submitted/filed declarations are never overwritten — they come back as
 * "skipped" and the count is surfaced.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { generateTaxReportsForPeriod } from "@/lib/development/server/tax/tax-actions";

export function RefreshDeclarationsButton({
  periodStart,
  periodEnd,
}: {
  periodStart: string;
  periodEnd: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  function go() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const r = await generateTaxReportsForPeriod({ periodStart, periodEnd });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setMsg(
        `${r.generated} refreshed${r.skipped > 0 ? ` · ${r.skipped} skipped (already filed/submitted)` : ""}`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pending}
        title="Re-aggregate dev_transactions for this period (filed reports are never overwritten)"
        onClick={go}
      >
        {pending ? "Refreshing…" : "Refresh declarations"}
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
      {msg && <span className="text-[10px] text-[var(--ink-3)]">{msg}</span>}
    </div>
  );
}

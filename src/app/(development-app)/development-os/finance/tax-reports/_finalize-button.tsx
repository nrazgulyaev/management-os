"use client";

/**
 * New backend + wire-up — finalize / mark-submitted a tax period report.
 * finalizeTaxPeriodReport is a newly-authored action; the report list was
 * read-only. Blocks finalising while unclassified transactions remain.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { finalizeTaxPeriodReport } from "@/lib/development/server/tax/tax-actions";

export function FinalizeReportButton({
  id,
  status,
  unclassifiedCount,
}: {
  id: string;
  status: string;
  unclassifiedCount: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  if (status === "submitted" || status === "archived") {
    return <span className="text-xs text-ink-tertiary">—</span>;
  }

  function go(next: "finalized" | "submitted") {
    setErr(null);
    start(async () => {
      const r = await finalizeTaxPeriodReport({ id, status: next });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      router.refresh();
    });
  }

  const btn =
    "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
  const blocked = unclassifiedCount > 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {status === "draft" && (
          <button
            type="button"
            className={btn}
            disabled={pending || blocked}
            title={blocked ? "Clear unclassified transactions first" : undefined}
            onClick={() => go("finalized")}
          >
            Finalize
          </button>
        )}
        {(status === "draft" || status === "finalized" || status === "amended") && (
          <button
            type="button"
            className={btn}
            disabled={pending || blocked}
            title={blocked ? "Clear unclassified transactions first" : undefined}
            onClick={() => go("submitted")}
          >
            Mark submitted
          </button>
        )}
      </div>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

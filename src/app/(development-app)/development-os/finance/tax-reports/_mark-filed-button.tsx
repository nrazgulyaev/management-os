"use client";

/**
 * ID-TAX (0164) — mark one declaration as FILED with DJP. Renders only for
 * finalized/submitted, not-yet-filed reports (the server page decides).
 * The operator may paste the real DJP reference; left blank, the server
 * generates a DJP-<yyyymm>-<6 digits> reference (mock parity).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { markTaxPeriodReportFiled } from "@/lib/development/server/tax/tax-actions";

const btn =
  "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";

export function MarkFiledButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [ref, setRef] = React.useState("");

  function go() {
    setErr(null);
    start(async () => {
      const r = await markTaxPeriodReportFiled({
        id,
        djpReference: ref.trim() === "" ? undefined : ref.trim(),
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="DJP ref (auto)"
          className="text-xs px-2 py-1 rounded border border-line-soft bg-surface w-28"
          disabled={pending}
        />
        <button
          type="button"
          className={btn}
          disabled={pending}
          title="Stamp filed_at + DJP reference (audited)"
          onClick={go}
        >
          Mark filed
        </button>
      </div>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

"use client";

/**
 * Row-level "Void" control for the finance ledgers. Posted revenue/fee/expense/
 * tax lines flow into owner statements, so a wrong posting must be reversible —
 * this calls the org-scoped voidLedgerLineAction (posted → voided) and refreshes.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { voidLedgerLineAction } from "@/features/finance/actions";

export function VoidLineButton({
  kind,
  id,
}: {
  kind: "revenue" | "fee" | "expense" | "tax";
  id: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function onVoid() {
    if (
      !window.confirm(
        "Void this posted line? It will be excluded from owner statements. This can't be undone.",
      )
    )
      return;
    setErr(null);
    start(async () => {
      const r = await voidLedgerLineAction({ kind, id });
      if (!r.ok) {
        setErr(r.error ?? "Could not void this line.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onVoid}
        disabled={pending}
        className="text-xs text-danger hover:underline disabled:opacity-50"
      >
        {pending ? "Voiding…" : "Void"}
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </span>
  );
}

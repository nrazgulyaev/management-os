"use client";

/**
 * "Recompute" button for /development-os/profitability. Runs the
 * profitability aggregation engine (dev budget + actuals → per-asset cost
 * allocations) the same way the Sunday cron does, then refreshes the table.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recomputeProfitabilityAction } from "./_recompute-action";

export function RecomputeButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  function run() {
    setErr(null);
    setMsg(null);
    start(async () => {
      try {
        const r = await recomputeProfitabilityAction();
        setMsg(
          `${r.allocationsWritten} allocation(s) across ${r.projectsRecomputed}/${r.projectsScanned} project(s).`,
        );
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Recompute failed.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-ink-secondary">{msg}</span>}
      {err && <span className="text-xs text-danger">{err}</span>}
      <Button type="button" onClick={run} disabled={pending}>
        <RefreshCw
          className={`w-4 h-4 ${pending ? "animate-spin" : ""}`}
          strokeWidth={1.75}
        />
        {pending ? "Recomputing…" : "Recompute"}
      </Button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { runWifiMigrationAction } from "@/features/villa-guides/wifi-migrate-action";
import type { MigrationResult } from "@/features/villa-guides/wifi-crypto";

export function WifiMigrateButton({
  kmsReady = true,
}: {
  /** When false, disable the button — the action will throw with a
   *  clear KMS-not-configured error otherwise. Stage 8.A.5. */
  kmsReady?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3">
      <button
        type="button"
        disabled={isPending || !kmsReady}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const out = await runWifiMigrationAction();
            if (out.ok) setResult(out.result);
            else setError(out.error);
          });
        }}
        className="h-10 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 disabled:opacity-50 self-start"
        title={kmsReady ? undefined : "STAY_LINK_KMS_SECRET is not configured — set the env var on Vercel before running."}
      >
        {isPending ? "Migrating…" : "Run migration sweep"}
      </button>
      {result && (
        <div className="text-xs text-ink-secondary tabular-nums">
          Scanned <strong>{result.scanned}</strong> · migrated{" "}
          <strong className="text-success">{result.migrated}</strong> · skipped{" "}
          {result.skipped} · failed{" "}
          <strong className={result.failed > 0 ? "text-danger" : ""}>
            {result.failed}
          </strong>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

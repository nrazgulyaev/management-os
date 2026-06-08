"use client";

/**
 * Wire-up sweep — risk alert lifecycle.
 *
 * acknowledgeAlert / resolveAlert / markFalsePositive already existed
 * (real db.update, "use server") but the detail page was read-only.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  acknowledgeAlert,
  resolveAlert,
  markFalsePositive,
} from "@/lib/development/server/risk-radar/risk-radar-actions";

const OPEN_LIKE = ["open", "acknowledged", "investigating"];

export function AlertActions({
  alertCode,
  status,
  userId,
}: {
  alertCode: string;
  status: string;
  userId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function run(p: Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const r = await p;
      if (!r.ok) {
        setErr(r.error ?? "Action failed.");
        return;
      }
      router.refresh();
    });
  }

  const isOpenLike = OPEN_LIKE.includes(status);
  if (!isOpenLike) return null;

  const btn =
    "text-xs px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
  const dangerBtn =
    "text-xs px-3 py-1.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "open" && (
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={() => run(acknowledgeAlert({ alertCode, userId }))}
          >
            Acknowledge
          </button>
        )}
      </div>
      <form
        className="flex flex-col gap-2 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const notes =
            (new FormData(e.currentTarget).get("resolutionNotes") ?? "")
              .toString()
              .trim() || undefined;
          run(resolveAlert({ alertCode, userId, resolutionNotes: notes }));
        }}
      >
        <textarea
          name="resolutionNotes"
          rows={2}
          placeholder="Resolution notes (optional)"
          className="w-full rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
        />
        <div className="flex items-center gap-2">
          <button type="submit" className={btn} disabled={pending}>
            {pending ? "…" : "Resolve"}
          </button>
          <button
            type="button"
            className={dangerBtn}
            disabled={pending}
            onClick={(e) => {
              const form = (e.currentTarget.closest("form") as HTMLFormElement) ?? null;
              const notes = form
                ? (new FormData(form).get("resolutionNotes") ?? "")
                    .toString()
                    .trim() || undefined
                : undefined;
              run(markFalsePositive({ alertCode, userId, resolutionNotes: notes }));
            }}
          >
            Mark false positive
          </button>
        </div>
      </form>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

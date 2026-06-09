"use client";

import { useState, useTransition } from "react";
import { Play, RotateCw, PauseCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { runJobManuallyAction } from "@/features/jobs/actions";
import { forceReleaseJobLockAction } from "@/features/jobs/lock-actions";

/**
 * BLOCK-07 SYSTEM-HEALTH — the cron / job-health control panel.
 *
 * Wires the REAL job-runner primitives that already exist:
 *   - Dispatch-job        → runJobManuallyAction   (perm: jobs.run)
 *   - Replay dead-letter   → runJobManuallyAction   (re-run the same job;
 *                            the runner has no replay-in-place, so a replay
 *                            IS a fresh dispatch of the same key)
 *   - Clear a leaked lock  → forceReleaseJobLockAction (perm: job_lock.manage)
 *
 * Pause-workers is HONESTLY read-only: the runner has no worker pool to
 * pause (crons are stateless Vercel scheduled GETs), so we render a disabled
 * affordance with a clear "not exposed" reason — never a fake button.
 *
 * Buttons are only rendered when the server told us the caller holds the
 * permission (`canDispatch` / `canClearLocks`); otherwise the row is
 * read-only. The server actions re-check the permission regardless — this
 * is belt-and-suspenders, not the gate.
 */

type ActionTone = "idle" | "ok" | "error";

function useJobAction() {
  const [pending, startTransition] = useTransition();
  const [tone, setTone] = useState<ActionTone>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const dispatch = (jobKey: string) => {
    setTone("idle");
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("jobKey", jobKey);
      const res = await runJobManuallyAction(null, fd);
      if (!res.ok) {
        setTone("error");
        setMessage(res.error);
        return;
      }
      setTone("ok");
      setMessage(`${res.status ?? "ok"}${res.summary ? ` · ${res.summary}` : ""}`);
    });
  };

  const clearLock = (jobKey: string) => {
    setTone("idle");
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("jobKey", jobKey);
      const res = await forceReleaseJobLockAction(null, fd);
      if (!res.ok) {
        setTone("error");
        setMessage(res.error);
        return;
      }
      setTone("ok");
      setMessage("lock released");
    });
  };

  return { pending, tone, message, dispatch, clearLock };
}

/** Dispatch a single job by key (the "Dispatch job" / "Replay" primitive). */
export function DispatchJobButton({
  jobKey,
  label = "Dispatch",
  replay = false,
}: {
  jobKey: string;
  label?: string;
  replay?: boolean;
}) {
  const { pending, tone, message, dispatch } = useJobAction();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        size="sm"
        variant={replay ? "secondary" : "primary"}
        disabled={pending}
        onClick={() => dispatch(jobKey)}
      >
        {replay ? (
          <RotateCw className="w-3.5 h-3.5" strokeWidth={1.75} />
        ) : (
          <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
        )}
        {pending ? "Running…" : label}
      </Button>
      {message && (
        <span
          className={
            tone === "error"
              ? "text-xs text-danger truncate max-w-[280px]"
              : "text-xs text-ink-tertiary truncate max-w-[280px]"
          }
        >
          {message}
        </span>
      )}
    </div>
  );
}

/** Force-release a leaked / stale job lock by key. */
export function ClearLockButton({ jobKey }: { jobKey: string }) {
  const { pending, tone, message, clearLock } = useJobAction();
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => clearLock(jobKey)}
      >
        {pending ? "Releasing…" : "Force release"}
      </Button>
      {message && (
        <span
          className={
            tone === "error"
              ? "text-xs text-danger truncate max-w-[200px]"
              : "text-xs text-success truncate max-w-[200px]"
          }
        >
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * The honest "Pause workers" control. The runner exposes no pause primitive,
 * so this is a disabled affordance with a clear, non-fake reason. Closes the
 * "no disabled button without a reason" debt without inventing backend.
 */
export function PauseWorkersControl() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line-soft bg-muted/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled>
          <PauseCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
          Pause workers
        </Button>
        <Badge tone="outline">not exposed</Badge>
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-tertiary">
        <Info className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={1.75} />
        <span>
          There is no worker pool to pause — cron jobs fire as stateless Vercel
          scheduled GETs, not a long-lived queue worker. To stop a job from
          running, disable its definition in the Mgmt OS jobs cabinet or remove
          its schedule in <code>vercel.json</code>. A pause-all primitive would
          require a new job-runner control table (out of scope here).
        </span>
      </p>
    </div>
  );
}

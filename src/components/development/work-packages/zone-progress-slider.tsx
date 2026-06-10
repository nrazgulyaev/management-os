"use client";

/**
 * Projects Live zone console — 0–100 progress slider per work package.
 *
 * Optimistic % label while dragging; submits on pointer/touch release with
 * a debounce fallback for keyboard nudges. Persists via
 * updateWorkPackageProgress (org-scoped, clamped, audit-logged) and reverts
 * the label if the save fails.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateWorkPackageProgress } from "@/lib/development/server/work-packages/work-package-actions";

interface SliderState {
  committed: number;
  error: string | null;
}

export function ZoneProgressSlider({
  workPackageId,
  initialProgress,
  disabled = false,
}: {
  workPackageId: string;
  initialProgress: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialProgress);
  const [state, dispatch, pending] = React.useActionState(
    async (prev: SliderState, next: number): Promise<SliderState> => {
      try {
        const res = await updateWorkPackageProgress({
          workPackageId,
          progress: next,
        });
        router.refresh();
        return { committed: res.progress, error: null };
      } catch (e) {
        return {
          committed: prev.committed,
          error: e instanceof Error ? e.message : "Could not save progress.",
        };
      }
    },
    { committed: initialProgress, error: null },
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Revert the optimistic label when a save fails.
  React.useEffect(() => {
    if (state.error) setValue(state.committed);
  }, [state]);

  // Clear any pending debounce on unmount.
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function commit(next: number) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (next === state.committed) return;
    React.startTransition(() => dispatch(next));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = Number(e.target.value);
    setValue(next);
    // Debounced fallback (keyboard arrows); pointer release flushes sooner.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), 600);
  }

  return (
    <div className="zone-progress">
      <input
        className="zone-slider"
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        aria-label="Work zone progress"
        onChange={handleChange}
        onPointerUp={() => commit(value)}
        onTouchEnd={() => commit(value)}
      />
      <span className="zone-progress-label mono">
        {value}%{pending ? " · saving…" : ""}
      </span>
      {state.error && (
        <p className="zone-progress-error mono" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

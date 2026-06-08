"use client";

/**
 * Wire-up sweep — safety incident status / resolve.
 * The incidents table was read-only; setSafetyIncidentStatus +
 * resolveSafetyIncident existed but had no UI caller.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { setSafetyStatusAction, resolveSafetyAction } from "./_actions";
import {
  SAFETY_STATUS_LABEL,
  type SafetyStatus,
} from "@/lib/development/constants/safety-constants";

// "resolved" is handled by the dedicated Resolve flow (needs a note).
const SELECTABLE: SafetyStatus[] = ["open", "under_investigation", "closed"];

export function SafetyStatusControl({
  id,
  status,
}: {
  id: string;
  status: SafetyStatus;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [resolving, setResolving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const done = status === "resolved" || status === "closed";

  function onStatus(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SafetyStatus;
    if (next === status) return;
    setErr(null);
    start(async () => {
      const r = await setSafetyStatusAction(id, next);
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      router.refresh();
    });
  }

  function resolve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const notes = (new FormData(e.currentTarget).get("notes") ?? "")
      .toString()
      .trim();
    setErr(null);
    start(async () => {
      const r = await resolveSafetyAction(id, notes);
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setResolving(false);
      router.refresh();
    });
  }

  const chip =
    "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";

  return (
    <div className="flex flex-col items-start gap-1">
      {!resolving ? (
        <div className="flex items-center gap-1.5">
          <select
            value={SELECTABLE.includes(status) ? status : "closed"}
            onChange={onStatus}
            disabled={pending || done}
            className="text-xs px-2 py-1 rounded border border-line-soft bg-surface disabled:opacity-50"
            aria-label="Incident status"
          >
            {SELECTABLE.map((s) => (
              <option key={s} value={s}>
                {SAFETY_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {!done && (
            <button
              type="button"
              className={chip}
              disabled={pending}
              onClick={() => {
                setErr(null);
                setResolving(true);
              }}
            >
              Resolve
            </button>
          )}
        </div>
      ) : (
        <form className="flex items-center gap-1.5" onSubmit={resolve}>
          <input
            name="notes"
            required
            minLength={3}
            placeholder="Resolution notes"
            className="text-xs px-2 py-1 rounded border border-line-soft bg-surface w-44"
          />
          <button type="submit" className={chip} disabled={pending}>
            {pending ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            className={chip}
            disabled={pending}
            onClick={() => setResolving(false)}
          >
            Cancel
          </button>
        </form>
      )}
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}

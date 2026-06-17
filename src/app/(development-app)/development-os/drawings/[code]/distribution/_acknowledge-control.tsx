"use client";

/**
 * Wave-D close-out (dev-OS drawings, SHALLOW low §1) — per-row "Acknowledge
 * receipt" control on the drawing distribution log.
 *
 * The log rendered an "Acknowledged" column (acknowledgedAt) that nothing
 * could ever set, so the chain-of-custody loop never closed. This reveal-form
 * control posts to the already-org-scoped, audited acknowledgeDrawingDistribution
 * RPC to stamp acknowledgedAt (+ optional vendor name & method), and can clear
 * a mistaken stamp. Mirrors the WhatsApp _resolve-control reveal pattern.
 *
 * The component is a "use client" leaf; it calls the "use server" action by
 * direct import (each export is an RPC endpoint that re-validates org scope —
 * this is a UX layer, not the authority).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { acknowledgeDrawingDistribution } from "@/lib/development/server/drawings/drawing-actions";

const METHOD_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "physical_print", label: "Physical print" },
  { value: "platform_download", label: "Platform download" },
  { value: "other", label: "Other" },
] as const;

type AckMethod = (typeof METHOD_OPTIONS)[number]["value"];

export function AcknowledgeControl({
  distributionId,
  acknowledgedAt,
  acknowledgedByName,
  acknowledgmentMethod,
}: {
  distributionId: string;
  acknowledgedAt: Date | string | null;
  acknowledgedByName: string | null;
  acknowledgmentMethod: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const isAcknowledged = acknowledgedAt != null;

  const chip =
    "font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-line-soft bg-surface text-ink-secondary hover:border-line hover:text-ink disabled:opacity-50";
  const dangerChip =
    "font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  function clear() {
    setErr(null);
    start(async () => {
      try {
        await acknowledgeDrawingDistribution({ distributionId, clear: true });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setErr(
          e instanceof Error ? e.message : "Failed to clear acknowledgment.",
        );
      }
    });
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const name = String(fd.get("acknowledgedByName") ?? "").trim();
    const method = String(fd.get("acknowledgmentMethod") ?? "").trim();
    setErr(null);
    start(async () => {
      try {
        await acknowledgeDrawingDistribution({
          distributionId,
          acknowledgedByName: name || null,
          acknowledgmentMethod: (method || null) as AckMethod | null,
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to acknowledge.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1">
          <button
            type="button"
            className={chip}
            disabled={pending}
            onClick={() => {
              setErr(null);
              setEditing(true);
            }}
          >
            {isAcknowledged ? "Re-acknowledge" : "Acknowledge"}
          </button>
          {isAcknowledged && (
            <button
              type="button"
              className={dangerChip}
              disabled={pending}
              onClick={clear}
            >
              Clear
            </button>
          )}
        </div>
        {err && <span className="text-[10px] text-danger">{err}</span>}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <input
        name="acknowledgedByName"
        defaultValue={acknowledgedByName ?? ""}
        placeholder="Acknowledged by (optional)"
        className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface w-[170px]"
      />
      <select
        name="acknowledgmentMethod"
        defaultValue={(acknowledgmentMethod as AckMethod | null) ?? ""}
        className="text-[10px] px-1.5 py-0.5 rounded border border-line-soft bg-surface w-[170px]"
      >
        <option value="">Method… (optional)</option>
        {METHOD_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <button
          type="button"
          className={chip}
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
        <button type="submit" className={chip} disabled={pending}>
          Confirm receipt
        </button>
      </div>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </form>
  );
}

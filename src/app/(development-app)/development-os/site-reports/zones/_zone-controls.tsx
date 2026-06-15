"use client";

/**
 * Wire-up — create-zone form island. Posts to createSiteZoneAction (the
 * "use server" adapter), which calls the org-scoped createSiteZone action.
 * Site zones are the step-1 prerequisite for the daily site report; without
 * this surface they could never be created from the UI.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSiteZoneAction } from "../_actions";
import {
  ZONE_TYPES,
  ZONE_TYPE_LABEL,
} from "@/lib/development/constants/site-constants";

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

export function CreateZoneForm({
  projectId,
}: {
  projectId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (!projectId) {
      setErr("Pick a project first.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const displayOrderRaw = (fd.get("displayOrder") ?? "").toString().trim();
    start(async () => {
      const r = await createSiteZoneAction({
        projectId,
        zoneCode: (fd.get("zoneCode") ?? "").toString().trim(),
        zoneName: (fd.get("zoneName") ?? "").toString().trim(),
        zoneType: (fd.get("zoneType") ?? "").toString(),
        expectedStartDate: (fd.get("expectedStartDate") ?? "").toString() || null,
        expectedCompletionDate:
          (fd.get("expectedCompletionDate") ?? "").toString() || null,
        ...(displayOrderRaw ? { displayOrder: Number(displayOrderRaw) } : {}),
        notes: (fd.get("notes") ?? "").toString() || null,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        disabled={!projectId}
      >
        Create zone
      </Button>
      {open && (
        <div
          className="modal-overlay flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">New site zone</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Zone code">
                  <input
                    name="zoneCode"
                    required
                    pattern="[A-Za-z0-9_-]+"
                    title="Letters, numbers, dash or underscore only"
                    className={inputCls}
                    placeholder="A-01"
                  />
                </L>
                <L label="Zone type">
                  <select name="zoneType" required defaultValue="" className={inputCls}>
                    <option value="" disabled>
                      Select…
                    </option>
                    {ZONE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ZONE_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="Zone name" span2>
                  <input
                    name="zoneName"
                    required
                    minLength={1}
                    className={inputCls}
                    placeholder="Villa A — Foundation"
                  />
                </L>
                <L label="Expected start">
                  <input type="date" name="expectedStartDate" className={inputCls} />
                </L>
                <L label="Expected completion">
                  <input
                    type="date"
                    name="expectedCompletionDate"
                    className={inputCls}
                  />
                </L>
                <L label="Display order">
                  <input
                    type="number"
                    name="displayOrder"
                    min={0}
                    defaultValue={100}
                    className={inputCls}
                  />
                </L>
                <L label="Notes" span2>
                  <input name="notes" className={inputCls} placeholder="Optional" />
                </L>
              </div>
              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create zone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function L({
  label,
  span2,
  children,
}: {
  label: string;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}
    >
      {label}
      {children}
    </label>
  );
}

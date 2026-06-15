"use client";

/**
 * Damage report lifecycle control. Mirrors MaintenanceStatusActions: surfaces
 * the valid next transitions for a damage report and posts them to
 * resolveDamageReportAction. The "Resolve / charge" steps prompt for the
 * actual cost (minor units), which the action records alongside the status.
 * Hidden once the report reaches a terminal state (closed / archived).
 */

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveDamageReportAction } from "@/features/operations/actions";

const NEXT: Record<string, { to: string; label: string; needsCost?: boolean }[]> = {
  open: [
    { to: "under_review", label: "Start review" },
    { to: "repaired", label: "Mark repaired", needsCost: true },
    { to: "waived", label: "Waive" },
  ],
  under_review: [
    { to: "approved", label: "Approve charge" },
    { to: "repaired", label: "Mark repaired", needsCost: true },
    { to: "waived", label: "Waive" },
  ],
  approved: [
    { to: "charged", label: "Mark charged", needsCost: true },
    { to: "waived", label: "Waive" },
    { to: "repaired", label: "Mark repaired", needsCost: true },
  ],
  repaired: [
    { to: "charged", label: "Mark charged", needsCost: true },
    { to: "closed", label: "Close" },
  ],
  charged: [{ to: "closed", label: "Close" }],
  waived: [{ to: "closed", label: "Close" }],
  closed: [],
  archived: [],
};

export function DamageStatusActions({
  id,
  status,
  currency = "USD",
}: {
  id: string;
  status: string;
  currency?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transition = (to: string, needsCost?: boolean) => {
    setError(null);
    let actualCostMinor: string | undefined;
    if (needsCost) {
      const entered = window.prompt(
        `Actual cost in ${currency ?? "USD"} (major units, e.g. 125.50). Leave blank to skip.`,
        "",
      );
      // Cancel aborts the whole transition.
      if (entered === null) return;
      const trimmed = entered.trim();
      if (trimmed !== "") {
        const major = Number(trimmed.replace(/[^0-9.-]/g, ""));
        if (!Number.isFinite(major) || major < 0) {
          setError("Enter a valid non-negative amount.");
          return;
        }
        actualCostMinor = String(Math.round(major * 100));
      }
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", to);
      if (actualCostMinor !== undefined) fd.set("actualCostMinor", actualCostMinor);
      const res = await resolveDamageReportAction(null, fd);
      if (!res.ok) setError(res.error ?? "Could not update the report.");
    });
  };

  const next = NEXT[status] ?? [];
  if (next.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {next.map((n) => (
        <Button
          key={n.to}
          size="sm"
          disabled={pending}
          onClick={() => transition(n.to, n.needsCost)}
        >
          {n.label}
        </Button>
      ))}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}

"use client";

import { useTransition, useState } from "react";
import { Check, Circle, AlertTriangle, MinusCircle, Camera } from "lucide-react";
import { ChecklistStatusPill } from "./task-status-pill";
import { Button } from "@/components/ui/button";
import {
  approveChecklistAction,
  completeChecklistAction,
  updateChecklistItemAction,
} from "@/features/operations/actions";
import type { TaskChecklistRow } from "@/features/operations/services";

type ItemStatus = "pending" | "done" | "failed" | "skipped" | "not_applicable";

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Pending",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
  not_applicable: "N/A",
};

export function ChecklistRunner({
  checklist,
  canApprove = false,
  variant = "internal",
}: {
  checklist: TaskChecklistRow;
  canApprove?: boolean;
  variant?: "internal" | "field";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Group items by section preserving original order.
  const sections: { name: string; items: TaskChecklistRow["items"] }[] = [];
  for (const item of checklist.items) {
    const last = sections[sections.length - 1];
    if (last && last.name === item.section) {
      last.items.push(item);
    } else {
      sections.push({ name: item.section, items: [item] });
    }
  }

  const isLocked = checklist.status === "approved";
  const isCompleted = checklist.status === "completed";

  const requiredOutstanding = checklist.items.filter(
    (i) => i.isRequired && i.status === "pending",
  ).length;

  const update = (itemId: string, status: ItemStatus) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("itemId", itemId);
      fd.set("status", status);
      const res = await updateChecklistItemAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const complete = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("checklistId", checklist.id);
      const res = await completeChecklistAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const approve = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("checklistId", checklist.id);
      const res = await approveChecklistAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="rounded-lg border border-line-soft bg-surface">
      <header className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-line-soft">
        <div className="flex items-center gap-3">
          <span className="text-label">Checklist</span>
          <ChecklistStatusPill status={checklist.status} />
        </div>
        <div className="text-[11px] text-ink-tertiary tabular-nums">
          {checklist.items.filter((i) => i.status !== "pending").length}/
          {checklist.items.length}
        </div>
      </header>

      <div className="divide-y divide-line-soft">
        {sections.map((section) => (
          <section key={section.name} className="px-4 md:px-5 py-4 flex flex-col gap-3">
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              {section.name}
            </div>
            {section.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                disabled={isLocked || pending}
                onChange={update}
                variant={variant}
              />
            ))}
          </section>
        ))}
      </div>

      <footer className="px-4 md:px-5 py-3 border-t border-line-soft flex flex-col gap-2">
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-tertiary">
            {requiredOutstanding > 0
              ? `${requiredOutstanding} required item${requiredOutstanding === 1 ? "" : "s"} outstanding`
              : "All required items resolved."}
          </p>
          <div className="flex items-center gap-2">
            {!isCompleted && !isLocked && (
              <Button
                size="sm"
                onClick={complete}
                disabled={pending || requiredOutstanding > 0}
              >
                <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
                Submit for review
              </Button>
            )}
            {canApprove && isCompleted && (
              <Button size="sm" variant="secondary" onClick={approve} disabled={pending}>
                Approve
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function ItemRow({
  item,
  disabled,
  onChange,
  variant,
}: {
  item: TaskChecklistRow["items"][number];
  disabled: boolean;
  onChange: (id: string, status: ItemStatus) => void;
  variant: "internal" | "field";
}) {
  const Icon = item.status === "done"
    ? Check
    : item.status === "failed"
      ? AlertTriangle
      : item.status === "skipped" || item.status === "not_applicable"
        ? MinusCircle
        : Circle;

  const tone = item.status === "done"
    ? "text-success"
    : item.status === "failed"
      ? "text-danger"
      : "text-ink-tertiary";

  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} strokeWidth={1.75} />
        <div className="min-w-0">
          <div className="text-sm text-ink flex items-center gap-2 flex-wrap">
            {item.label}
            {item.isRequired && (
              <span className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                required
              </span>
            )}
            {item.photoRequired && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-ink-tertiary">
                <Camera className="w-3 h-3" strokeWidth={1.75} />
                photo
              </span>
            )}
          </div>
          {item.notes && (
            <div className="text-[11px] text-ink-tertiary mt-1">{item.notes}</div>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {(["done", "failed", "skipped", "not_applicable"] as ItemStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(item.id, s)}
            disabled={disabled || item.status === s}
            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
              item.status === s
                ? "bg-accent text-accent-contrast border-accent"
                : "border-line-soft text-ink-secondary hover:border-line-strong"
            } ${variant === "field" ? "min-w-[44px] min-h-[34px]" : ""}`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

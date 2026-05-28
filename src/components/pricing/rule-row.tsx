"use client";

/**
 * Phase 2.4 mgmt-02 — RuleRow.
 *
 * Single row in the active-rules stack. Draggable via @dnd-kit
 * for priority re-ordering. Shows kind chip + condition summary +
 * effect summary + applied/skipped pill.
 */

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PricingRule } from "@/features/pricing/rules-evaluator";

export interface RuleRowProps {
  rule: PricingRule;
  /** Did this rule fire on the currently-viewed date? */
  applied?: boolean;
  /** Optional delta label ("+5%", "−2%"). */
  deltaLabel?: string;
  onEdit?: (id: string) => void;
  onToggle?: (id: string, next: boolean) => void;
}

function summarizeCondition(rule: PricingRule): string {
  switch (rule.condition.kind) {
    case "event":
      return `${rule.condition.data.tag} · ${rule.condition.data.startDate}→${rule.condition.data.endDate}`;
    case "occupancy":
      return `Remaining < ${Math.round(rule.condition.data.lessThanPct * 100)}%`;
    case "dow":
      return rule.condition.data.daysOfWeek.map((d) => ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"][d - 1]).join("/");
    case "season":
      return `Season ${rule.condition.data.startDate}→${rule.condition.data.endDate}`;
    case "always":
      return "Always";
  }
}

function summarizeEffect(rule: PricingRule): string {
  switch (rule.effect.kind) {
    case "force":
      return `Force ${rule.effect.value}`;
    case "mul":
      return `×${rule.effect.value}`;
    case "add":
      return `${rule.effect.value >= 0 ? "+" : ""}${rule.effect.value}`;
    case "floor":
      return `Floor ${rule.effect.value}`;
    case "ceiling":
      return `Ceiling ${rule.effect.value}`;
  }
}

export function RuleRow({ rule, applied, deltaLabel, onEdit, onToggle }: RuleRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rule-row${applied ? " is-applied" : ""}${rule.enabled ? "" : " is-disabled"}${rule.pinned ? " is-pinned" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="rr-prio mono">#{rule.priority}</span>
      <span className={`rr-kind rr-kind-${rule.kind}`}>{rule.kind}</span>
      <div className="rr-cond">{summarizeCondition(rule)}</div>
      <div className="rr-effect mono">{summarizeEffect(rule)}</div>
      {deltaLabel && <span className={`rr-delta${applied ? " is-applied" : ""}`}>{deltaLabel}</span>}
      <div className="rr-actions">
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onToggle?.(rule.id, !rule.enabled)}>
          {rule.enabled ? "Disable" : "Enable"}
        </button>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onEdit?.(rule.id)}>
          Edit
        </button>
      </div>
    </div>
  );
}

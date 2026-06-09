"use client";

/**
 * CRM-SAVED-VIEWS-BULK (#169) — advanced multi-condition <CrmFilterBar>.
 *
 * Each condition is <field> <operator> <values>, ANDed together (Attio
 * semantics). Add conditions from a "+ Add filter" popover; edit / remove
 * each chip inline. Pure presentation + local popover state — the parent
 * owns the FilterCondition[] and applies it to the list.
 *
 * Tokens only (cream / stone / ink Layer-B); @/components/ui primitives for
 * controls. No raw bg-black buttons, no inline style objects.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABEL,
  operatorTakesNoValue,
  summarizeCondition,
  type FilterCondition,
  type FilterFieldDef,
  type FilterOperator,
} from "@/features/crm/saved-views/filter-types";

export interface CrmFilterBarProps {
  fields: FilterFieldDef[];
  conditions: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);
  return ref;
}

export function CrmFilterBar({ fields, conditions, onChange }: CrmFilterBarProps) {
  const fieldByKey = React.useMemo(
    () => new Map(fields.map((f) => [f.key, f])),
    [fields],
  );

  function update(index: number, next: FilterCondition) {
    onChange(conditions.map((c, i) => (i === index ? next : c)));
  }
  function remove(index: number) {
    onChange(conditions.filter((_, i) => i !== index));
  }
  function add(field: FilterFieldDef) {
    const op = OPERATORS_BY_TYPE[field.type][0];
    onChange([...conditions, { field: field.key, op, values: [] }]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-component="crm-filter-bar">
      <span className="text-[11px] uppercase tracking-[0.12em] text-ink-tertiary">
        Filters
      </span>
      {conditions.map((cond, i) => (
        <ConditionChip
          key={`${cond.field}-${i}`}
          field={fieldByKey.get(cond.field)}
          condition={cond}
          onChange={(next) => update(i, next)}
          onRemove={() => remove(i)}
        />
      ))}
      <AddFilter
        fields={fields}
        usedFields={conditions.map((c) => c.field)}
        onPick={add}
      />
      {conditions.length > 0 && (
        <Button variant="link" size="sm" onClick={() => onChange([])} className="text-ink-tertiary">
          Clear all
        </Button>
      )}
    </div>
  );
}

function ConditionChip({
  field,
  condition,
  onChange,
  onRemove,
}: {
  field: FilterFieldDef | undefined;
  condition: FilterCondition;
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(condition.values.length === 0 && !operatorTakesNoValue(condition.op));
  const ref = useOutsideClose(open, () => setOpen(false));
  const ops: FilterOperator[] = field ? OPERATORS_BY_TYPE[field.type] : ["is"];

  function setOp(op: FilterOperator) {
    onChange({ ...condition, op, values: operatorTakesNoValue(op) ? [] : condition.values });
  }
  function toggleValue(v: string) {
    const has = condition.values.includes(v);
    onChange({
      ...condition,
      values: has ? condition.values.filter((x) => x !== v) : [...condition.values, v],
    });
  }
  function setText(v: string) {
    onChange({ ...condition, values: v ? [v] : [] });
  }

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-line-soft bg-surface pl-3 pr-1 py-1 text-[12.5px]",
          condition.values.length > 0 || operatorTakesNoValue(condition.op)
            ? "border-accent/40 bg-accent-weak/40"
            : "",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-ink font-medium hover:text-accent transition-colors"
        >
          {summarizeCondition(condition, field)}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove filter"
          className="ml-0.5 grid h-5 w-5 place-items-center rounded-full text-ink-tertiary hover:bg-muted hover:text-ink transition-colors"
        >
          ×
        </button>
      </div>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-line-soft bg-surface p-3 shadow-lg">
          <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-ink-tertiary">
            Condition
          </label>
          <Select
            value={condition.op}
            onChange={(e) => setOp(e.target.value as FilterOperator)}
            className="mb-3 w-full"
            aria-label="Operator"
          >
            {ops.map((op) => (
              <option key={op} value={op}>
                {OPERATOR_LABEL[op]}
              </option>
            ))}
          </Select>

          {!operatorTakesNoValue(condition.op) && field?.type === "select" && field.options && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {field.options.map((opt) => (
                <Checkbox
                  key={opt.value}
                  label={opt.label}
                  checked={condition.values.includes(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                />
              ))}
            </div>
          )}

          {!operatorTakesNoValue(condition.op) && field?.type === "text" && (
            <Input
              value={condition.values[0] ?? ""}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a value…"
              aria-label="Filter value"
            />
          )}

          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddFilter({
  fields,
  usedFields,
  onPick,
}: {
  fields: FilterFieldDef[];
  usedFields: string[];
  onPick: (field: FilterFieldDef) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="border-dashed"
      >
        + Add filter
      </Button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-52 rounded-lg border border-line-soft bg-surface p-1 shadow-lg" role="menu">
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                onPick(f);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-muted transition-colors"
            >
              <span>{f.label}</span>
              {usedFields.includes(f.key) && (
                <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
                  added
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

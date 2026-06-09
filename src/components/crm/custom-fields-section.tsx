"use client";

/**
 * CRM-CUSTOM-FIELDS-TAGS — editable custom-fields section.
 *
 * Renders the org's custom-field defs for an entity as inline-editable rows
 * (text | number | date | select). Each row commits independently through the
 * audit-logged `setFieldValueAction`. Clearing a value deletes the row.
 *
 * Design-system only: Input / Select primitives, cream/stone/ink tokens, no
 * style={{}} and no raw bg-black buttons.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { setFieldValueAction } from "@/features/crm-custom-fields/actions";

export interface CustomFieldRow {
  defId: string;
  key: string;
  label: string;
  fieldType: "text" | "number" | "date" | "select";
  options: string[] | null;
  helpText: string | null;
  value: string | null;
}

export function CustomFieldsSection({
  subjectType,
  subjectId,
  fields,
  canManage,
}: {
  subjectType: string;
  subjectId: string;
  fields: CustomFieldRow[];
  canManage: boolean;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        No custom fields defined for {subjectType}s yet.
      </p>
    );
  }
  return (
    <dl className="flex flex-col divide-y divide-line-soft rounded-md border border-line-soft bg-surface">
      {fields.map((f) => (
        <FieldRow
          key={f.defId}
          subjectType={subjectType}
          subjectId={subjectId}
          field={f}
          canManage={canManage}
        />
      ))}
    </dl>
  );
}

function FieldRow({
  subjectType,
  subjectId,
  field,
  canManage,
}: {
  subjectType: string;
  subjectId: string;
  field: CustomFieldRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(field.value ?? "");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!editing) setDraft(field.value ?? "");
  }, [field.value, editing]);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setFieldValueAction({
          defId: field.defId,
          subjectType,
          subjectId,
          rawValue: draft,
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  function cancel() {
    setDraft(field.value ?? "");
    setError(null);
    setEditing(false);
  }

  return (
    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 px-4 py-3">
      <dt className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {field.label}
        {field.helpText && (
          <span className="block normal-case tracking-normal text-[11px] text-ink-tertiary/80 mt-0.5">
            {field.helpText}
          </span>
        )}
      </dt>
      <dd className="min-w-0 text-sm text-ink">
        {!editing ? (
          field.value ? (
            <span className={field.fieldType === "number" ? "font-mono tabular-nums" : ""}>
              {field.value}
            </span>
          ) : (
            <span className="text-ink-tertiary">—</span>
          )
        ) : field.fieldType === "select" ? (
          <Select
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
          >
            <option value="">— None —</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            type={
              field.fieldType === "number"
                ? "number"
                : field.fieldType === "date"
                  ? "date"
                  : "text"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
        )}
        {error && <span className="block text-xs text-danger mt-1">{error}</span>}
      </dd>
      <dd className="flex items-center gap-1 justify-self-end">
        {canManage &&
          (editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={save}
                disabled={pending}
                aria-label="Save"
                className="h-7 w-7 p-0"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={pending}
                aria-label="Cancel"
                className="h-7 w-7 p-0"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2} />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${field.label}`}
              className="h-7 w-7 p-0 text-ink-tertiary hover:text-ink"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Button>
          ))}
      </dd>
    </div>
  );
}

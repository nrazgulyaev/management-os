"use client";

/**
 * Edit + delete controls for a checklist template row. Mirrors the create
 * modal in checklist-template-add-button.tsx but pre-fills the header +
 * item set from the existing template, and posts to
 * editChecklistTemplateAction. Delete blocks/soft-archives server-side when
 * runs exist; the button just confirms + calls deleteChecklistTemplateAction.
 *
 * The unique `key` is immutable (it anchors preventive-schedule references),
 * so it's shown read-only here.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  editChecklistTemplateAction,
  deleteChecklistTemplateAction,
} from "@/features/operations/actions";

const ITEM_TYPES = [
  "checkbox",
  "photo_required",
  "number",
  "text",
  "pass_fail",
] as const;
type ItemType = (typeof ITEM_TYPES)[number];

interface Item {
  section: string;
  label: string;
  itemType: ItemType;
  isRequired: boolean;
}

export interface ChecklistTemplateRowActionsProps {
  id: string;
  templateKey: string;
  name: string;
  category: string;
  description: string | null;
  villaType: string | null;
  items: { section: string; label: string; itemType: string; isRequired: boolean }[];
}

const inputCls = "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

function normType(t: string): ItemType {
  return (ITEM_TYPES as readonly string[]).includes(t) ? (t as ItemType) : "checkbox";
}

export function ChecklistTemplateRowActions({
  id,
  templateKey,
  name,
  category,
  description,
  villaType,
  items: initialItems,
}: ChecklistTemplateRowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>(
    initialItems.length
      ? initialItems.map((it) => ({
          section: it.section,
          label: it.label,
          itemType: normType(it.itemType),
          isRequired: it.isRequired,
        }))
      : [{ section: "General", label: "", itemType: "checkbox", isRequired: true }],
  );
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const cleanItems = items
      .filter((it) => it.label.trim() && it.section.trim())
      .map((it) => ({
        section: it.section.trim(),
        label: it.label.trim(),
        itemType: it.itemType,
        isRequired: it.isRequired,
      }));
    if (cleanItems.length === 0) {
      setErr("Add at least one item with a section + label.");
      return;
    }
    start(async () => {
      const r = await editChecklistTemplateAction({
        id,
        name: (fd.get("name") ?? "").toString().trim(),
        category: (fd.get("category") ?? "").toString().trim(),
        description: (fd.get("description") ?? "").toString().trim() || undefined,
        villaType: (fd.get("villaType") ?? "").toString().trim() || undefined,
        items: cleanItems,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not save the template.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete template "${name}"? If it's already been used by checklist runs it will be archived instead of removed.`,
      )
    ) {
      return;
    }
    start(async () => {
      const r = await deleteChecklistTemplateAction({ id });
      if (!r.ok) {
        setErr(r.error ?? "Could not delete the template.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-line-soft bg-surface text-danger hover:bg-muted/50 disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        Delete
      </button>
      {err && !open && <span className="text-xs text-danger">{err}</span>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">Edit checklist template</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Key">
                  <input
                    value={templateKey}
                    readOnly
                    disabled
                    className={`${inputCls} opacity-60`}
                  />
                </L>
                <L label="Name" required>
                  <input
                    name="name"
                    required
                    minLength={2}
                    defaultValue={name}
                    className={inputCls}
                  />
                </L>
                <L label="Category" required>
                  <input
                    name="category"
                    required
                    defaultValue={category}
                    className={inputCls}
                  />
                </L>
                <L label="Villa type">
                  <input
                    name="villaType"
                    defaultValue={villaType ?? ""}
                    className={inputCls}
                    placeholder="optional"
                  />
                </L>
              </div>
              <L label="Description" span2>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={description ?? ""}
                  className={inputCls}
                />
              </L>

              <div className="space-y-2">
                <span className="text-xs font-medium text-ink-secondary">Items (≥1)</span>
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_2fr_auto_auto_auto] items-center gap-2"
                  >
                    <input
                      value={it.section}
                      onChange={(e) => setItem(i, { section: e.target.value })}
                      placeholder="Section"
                      className={inputCls}
                    />
                    <input
                      value={it.label}
                      onChange={(e) => setItem(i, { label: e.target.value })}
                      placeholder="Item label"
                      className={inputCls}
                    />
                    <select
                      value={it.itemType}
                      onChange={(e) => setItem(i, { itemType: e.target.value as ItemType })}
                      className="rounded border border-line-soft bg-surface px-1.5 py-1 text-xs"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-ink-tertiary">
                      <input
                        type="checkbox"
                        checked={it.isRequired}
                        onChange={(e) => setItem(i, { isRequired: e.target.checked })}
                      />
                      req
                    </label>
                    {items.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-danger px-1"
                        onClick={() => setItems((xs) => xs.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
                  onClick={() =>
                    setItems((xs) => [
                      ...xs,
                      {
                        section: xs[xs.length - 1]?.section ?? "General",
                        label: "",
                        itemType: "checkbox",
                        isRequired: true,
                      },
                    ])
                  }
                >
                  + Add item
                </button>
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
                  {pending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function L({
  label,
  required,
  span2,
  children,
}: {
  label: string;
  required?: boolean;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}
    >
      <span>
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

"use client";

/**
 * New backend + UI — create a checklist template (header + items) in one
 * modal. createChecklistTemplateAction is newly authored; the checklists
 * page had no create path.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createChecklistTemplateAction } from "@/features/operations/actions";

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

const inputCls = "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

const CATEGORY_SUGGESTIONS = ["AC", "Pool", "Electrical", "Landscaping", "Housekeeping"];

export function ChecklistTemplateAddButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([
    { section: "General", label: "", itemType: "checkbox", isRequired: true },
  ]);
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
      const r = await createChecklistTemplateAction({
        key: (fd.get("key") ?? "").toString().trim(),
        name: (fd.get("name") ?? "").toString().trim(),
        category: (fd.get("category") ?? "").toString().trim(),
        description: (fd.get("description") ?? "").toString().trim() || undefined,
        villaType: (fd.get("villaType") ?? "").toString().trim() || undefined,
        items: cleanItems,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not create template.");
        return;
      }
      setOpen(false);
      setItems([{ section: "General", label: "", itemType: "checkbox", isRequired: true }]);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => { setErr(null); setOpen(true); }}>
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New template
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold mb-3">New checklist template</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Key" required>
                  <input name="key" required className={inputCls} placeholder="pool_weekly" />
                </L>
                <L label="Name" required>
                  <input name="name" required minLength={2} className={inputCls} placeholder="Pool — weekly service" />
                </L>
                <L label="Category" required>
                  <input name="category" required list="cat-suggest" className={inputCls} placeholder="Pool" />
                  <datalist id="cat-suggest">
                    {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </L>
                <L label="Villa type">
                  <input name="villaType" className={inputCls} placeholder="optional" />
                </L>
              </div>
              <L label="Description" span2>
                <textarea name="description" rows={2} className={inputCls} />
              </L>

              <div className="space-y-2">
                <span className="text-xs font-medium text-ink-secondary">Items (≥1)</span>
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto_auto_auto] items-center gap-2">
                    <input value={it.section} onChange={(e) => setItem(i, { section: e.target.value })} placeholder="Section" className={inputCls} />
                    <input value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Item label" className={inputCls} />
                    <select value={it.itemType} onChange={(e) => setItem(i, { itemType: e.target.value as ItemType })} className="rounded border border-line-soft bg-surface px-1.5 py-1 text-xs">
                      {ITEM_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-ink-tertiary">
                      <input type="checkbox" checked={it.isRequired} onChange={(e) => setItem(i, { isRequired: e.target.checked })} />
                      req
                    </label>
                    {items.length > 1 && (
                      <button type="button" className="text-xs text-danger px-1" onClick={() => setItems((xs) => xs.filter((_, idx) => idx !== i))}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
                  onClick={() => setItems((xs) => [...xs, { section: xs[xs.length - 1]?.section ?? "General", label: "", itemType: "checkbox", isRequired: true }])}>
                  + Add item
                </button>
              </div>

              {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50">{pending ? "Creating…" : "Create template"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function L({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}>
      <span>{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
    </label>
  );
}

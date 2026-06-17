"use client";

/**
 * "Add variant" form for a content piece. Posts to the org-scoped
 * `createContentVariant` action (parent resolved + ownership-checked
 * server-side by content_code) and router.refresh on success. Variant
 * types match the action's zod enum.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { createContentVariant } from "@/lib/development/server/content/content-actions";

const VARIANT_TYPES = [
  "language",
  "platform",
  "audience",
  "format",
  "a_b_test",
] as const;

export function AddVariantForm({ parentContentCode }: { parentContentCode: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createContentVariant({
        parentContentCode,
        variantType: (fd.get("variantType") ?? "language").toString() as
          | "language"
          | "platform"
          | "audience"
          | "format"
          | "a_b_test",
        variantLabel: (fd.get("variantLabel") ?? "").toString().trim(),
        languageCode: (fd.get("languageCode") ?? "").toString().trim() || undefined,
        platformTarget: (fd.get("platformTarget") ?? "").toString().trim() || undefined,
        caption: (fd.get("caption") ?? "").toString().trim() || undefined,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not add variant.");
        return;
      }
      (e.target as HTMLFormElement).reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        className="btn btn-secondary btn-sm"
      >
        + Add variant
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <L label="Type">
          <select name="variantType" defaultValue="language" className={inputCls}>
            {VARIANT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </L>
        <L label="Label">
          <input name="variantLabel" required minLength={2} maxLength={120} className={inputCls} placeholder="Russian / IG" />
        </L>
        <L label="Language code (optional)">
          <input name="languageCode" className={inputCls} placeholder="ru" />
        </L>
        <L label="Platform target (optional)">
          <input name="platformTarget" className={inputCls} placeholder="instagram" />
        </L>
      </div>
      <L label="Caption (optional)">
        <textarea name="caption" rows={2} className={inputCls} />
      </L>

      {err && (
        <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Adding…" : "Add variant"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-secondary">
      {label}
      {children}
    </label>
  );
}

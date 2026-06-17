"use client";

/**
 * Create-content form for `/marketing/content/new`. Posts to the
 * org-scoped `createContentPiece` action (content_code generated
 * server-side; status starts at `draft`) and routes to the new piece's
 * detail page on success. Optional campaign association is carried via
 * the `?campaign=<code>` query param (resolved + validated server-side).
 * Mirrors the campaign `_create-form.tsx` field/styling conventions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { createContentPiece } from "@/lib/development/server/content/content-actions";

const CONTENT_TYPES = [
  "social_post",
  "blog_article",
  "email",
  "video",
  "landing_page",
  "ad_creative",
  "newsletter",
  "other",
];

export function CreateContentForm({ campaignCode }: { campaignCode?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createContentPiece({
        title: (fd.get("title") ?? "").toString().trim(),
        contentType: (fd.get("contentType") ?? "").toString(),
        contentBrief: (fd.get("contentBrief") ?? "").toString().trim(),
        campaignCode: campaignCode ?? "",
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not create content piece.");
        return;
      }
      router.push(`/development-os/marketing/content/${r.contentCode}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {campaignCode && (
        <div className="rounded border border-line-soft bg-inset px-3 py-2 text-xs text-ink-secondary">
          Linking to campaign{" "}
          <span className="font-mono text-ink">{campaignCode}</span>
        </div>
      )}
      <L label="Title">
        <input
          name="title"
          required
          minLength={2}
          maxLength={200}
          className={inputCls}
          placeholder="Sunset reel — Phase 2 villas"
        />
      </L>
      <L label="Content type">
        <select name="contentType" required className={inputCls} defaultValue="social_post">
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </L>
      <L label="Brief">
        <textarea
          name="contentBrief"
          required
          minLength={2}
          maxLength={8000}
          rows={6}
          className={inputCls}
          placeholder="What is this piece about, who is it for, and what is the call to action?"
        />
      </L>

      {err && (
        <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => router.push("/development-os/marketing/content")}
          disabled={pending}
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn btn-amber btn-sm">
          {pending ? "Creating…" : "Create content"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2.5 py-1.5 text-sm";

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-ink-secondary">
      {label}
      {children}
    </label>
  );
}

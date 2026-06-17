"use client";

/**
 * AI-agents cabinet — on-demand digest generator form.
 *
 * Picks a digest type and calls generateDigestFromUI(), which builds
 * the context (latest company snapshot) and delegates to the org-scoped
 * generateDigest(). On success we route straight to the new digest's
 * detail page, where it can be edited / approved / distributed.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { generateDigestFromUI } from "@/lib/development/server/executive-digest/digest-generate-action";

const DIGEST_TYPES = [
  { value: "monthly", label: "Monthly (last full month)" },
  { value: "weekly", label: "Weekly (last 7 days)" },
  { value: "quarterly", label: "Quarterly (current quarter)" },
  { value: "on_demand", label: "On-demand (month to date)" },
] as const;

type DigestType = (typeof DIGEST_TYPES)[number]["value"];

export function GenerateDigestForm() {
  const router = useRouter();
  const [digestType, setDigestType] = React.useState<DigestType>("monthly");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await generateDigestFromUI({ digestType });
      if (!r.ok) {
        setError(r.error ?? "Generation failed.");
        return;
      }
      router.push(`/development-os/digests/${r.code}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-[420px]">
      <div>
        <label className="block text-xs text-ink-3 mb-1" htmlFor="digest-type">
          Digest type
        </label>
        <select
          id="digest-type"
          value={digestType}
          onChange={(e) => setDigestType(e.target.value as DigestType)}
          disabled={pending}
          className="w-full text-sm px-2.5 py-1.5 rounded border border-line-soft bg-surface disabled:opacity-50"
        >
          {DIGEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-sm self-start"
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
        ) : (
          <Sparkles className="w-4 h-4" strokeWidth={1.75} />
        )}
        {pending ? "Generating…" : "Generate"}
      </button>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

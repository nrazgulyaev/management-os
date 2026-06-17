"use client";

/**
 * Decision lifecycle controls — Supersede (capture a replacement decision; the
 * old one is marked superseded and linked atomically) and Reverse (mark the
 * decision reversed). Only an ACTIVE decision can be superseded/reversed; the
 * server enforces this too.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  reverseProjectDecisionAction,
  supersedeProjectDecisionAction,
} from "./_actions";

const CATEGORIES = [
  "design",
  "materials",
  "budget",
  "timeline",
  "vendor",
  "process",
  "other",
] as const;

export function DecisionLifecycleControls({
  decisionId,
  projectId,
  slug,
  code,
  status,
}: {
  decisionId: string;
  projectId: string;
  slug: string;
  code: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"none" | "supersede">("none");

  // Supersede form fields.
  const [title, setTitle] = React.useState("");
  const [decisionText, setDecisionText] = React.useState("");
  const [rationale, setRationale] = React.useState("");
  const [context, setContext] = React.useState("");
  const [category, setCategory] =
    React.useState<(typeof CATEGORIES)[number]>("design");

  if (status !== "active") {
    return (
      <span className="text-xs text-ink-tertiary">
        {status === "superseded"
          ? "Superseded — see the replacement decision."
          : status === "reversed"
            ? "Reversed — no further lifecycle actions."
            : `Status '${status}' — no lifecycle actions available.`}
      </span>
    );
  }

  function reverse() {
    setError(null);
    start(async () => {
      const res = await reverseProjectDecisionAction({
        decisionId,
        slug,
        code,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function supersede(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !decisionText.trim()) {
      setError("Title and decision text are required for the replacement.");
      return;
    }
    start(async () => {
      const res = await supersedeProjectDecisionAction({
        oldDecisionId: decisionId,
        projectId,
        slug,
        title: title.trim(),
        decisionText: decisionText.trim(),
        rationale,
        context,
        category,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/development-os/projects/${slug}/decisions/${res.newCode}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setMode((m) => (m === "supersede" ? "none" : "supersede"))}
          className="btn btn-dark btn-sm"
        >
          {mode === "supersede" ? "Cancel supersede" : "Supersede"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={reverse}
          className="btn btn-secondary btn-sm"
        >
          {pending ? "…" : "Reverse"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {mode === "supersede" && (
        <form
          onSubmit={supersede}
          className="rounded border border-line-soft bg-surface p-3 space-y-2 max-w-2xl"
        >
          <p className="text-xs text-ink-secondary">
            The replacement decision is logged and this decision is marked
            superseded + linked to it — atomically.
          </p>
          <label className="block text-sm">
            <span className="text-ink-secondary">Replacement title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Decision</span>
            <textarea
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              required
            />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-ink-secondary">Rationale (optional)</span>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Context (optional)</span>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-sm max-w-xs">
            <span className="text-ink-secondary">Category</span>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as (typeof CATEGORIES)[number])
              }
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
            {pending ? "Saving…" : "Supersede with this decision"}
          </button>
        </form>
      )}
    </div>
  );
}

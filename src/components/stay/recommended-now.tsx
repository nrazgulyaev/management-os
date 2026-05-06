"use client";

import { useActionState } from "react";
import {
  clickGuestJourneySuggestionAction,
  dismissGuestJourneySuggestionAction,
} from "@/features/guest-journey/actions";

export interface RecommendedSuggestion {
  id: string;
  title: string;
  body: string | null;
  ctaHref: string | null;
  ctaLabel: string | null;
  suggestionType: string;
  priority: string;
}

export function RecommendedNowList({
  suggestions,
  token,
}: {
  suggestions: RecommendedSuggestion[];
  token: string;
}) {
  if (suggestions.length === 0) return null;
  return (
    <section className="rounded-xl border border-line-soft bg-surface p-6 md:p-8">
      <div className="text-ink-tertiary text-[11px] uppercase tracking-widest">
        Recommended now
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {suggestions.map((s) => (
          <RecommendedRow key={s.id} suggestion={s} token={token} />
        ))}
      </ul>
    </section>
  );
}

function RecommendedRow({
  suggestion: s,
  token,
}: {
  suggestion: RecommendedSuggestion;
  token: string;
}) {
  const [, dismissDispatch] = useActionState(
    dismissGuestJourneySuggestionAction,
    null,
  );
  const [, clickDispatch] = useActionState(
    clickGuestJourneySuggestionAction,
    null,
  );
  // CTA is rewritten on the client so the raw token never leaves the
  // server-side render — pages render with `null` ctaHref and we
  // attach the token here.
  const href = (s.ctaHref ?? "").replaceAll("__TOKEN__", token);
  return (
    <li className="rounded-md border border-line-soft bg-canvas p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink font-medium">{s.title}</span>
          {(s.priority === "high" || s.priority === "urgent") && (
            <span className="text-[10px] uppercase tracking-widest text-warning">
              {s.priority}
            </span>
          )}
        </div>
        {s.body && (
          <p className="text-xs text-ink-tertiary">{s.body}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {href && (
          <form action={clickDispatch} className="inline-flex">
            <input type="hidden" name="id" value={s.id} />
            <button
              type="submit"
              formAction={clickDispatch}
              className="h-8 px-3 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
              onClick={() => {
                window.location.href = href;
              }}
            >
              {s.ctaLabel ?? "Open"}
            </button>
          </form>
        )}
        <form action={dismissDispatch} className="inline-flex">
          <input type="hidden" name="id" value={s.id} />
          <button
            type="submit"
            className="text-[11px] text-ink-tertiary hover:text-ink"
          >
            Dismiss
          </button>
        </form>
      </div>
    </li>
  );
}

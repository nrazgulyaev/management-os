"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createProjectDecision } from "@/lib/development/server/decisions/decision-actions";

const CATEGORIES = [
  "design",
  "materials",
  "budget",
  "timeline",
  "vendor",
  "process",
  "other",
] as const;

export function DecisionForm({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [decisionText, setDecisionText] = useState("");
  const [rationale, setRationale] = useState("");
  const [context, setContext] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("design");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !decisionText.trim()) {
      setError("Title and decision text are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createProjectDecision({
          title,
          projectId,
          decisionText,
          rationale: rationale || null,
          context: context || null,
          category,
          tags: tags
            ? tags.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
        });
        router.push(
          `/development-os/projects/${projectSlug}/decisions/${out.decisionCode}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-2xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Use microcement V3 for exterior walls"
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
          placeholder="What was decided?"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Rationale (optional)</span>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={2}
          placeholder="Why this option over alternatives?"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Context (optional)</span>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          placeholder="Where did this decision happen? (Slack, meeting, …)"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Tags (comma-separated)</span>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="exterior, finish, supplier-change"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Log decision
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import {
  regenerateAIDraft,
  reviewAIDraft,
} from "@/lib/development/server/lead-actions";
import type { InteractionListItem } from "@/lib/development/types/sales";

export function AIDraftReviewList({
  drafts,
}: {
  drafts: InteractionListItem[];
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center">
        <p className="text-sm text-ink-secondary">
          No pending AI drafts. New leads queue a welcome draft for your review;
          they appear here when ready.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {drafts.map((d) => (
        <AIDraftReviewCard key={d.id} draft={d} />
      ))}
    </ul>
  );
}

function AIDraftReviewCard({ draft }: { draft: InteractionListItem }) {
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [subject, setSubject] = React.useState(draft.subject ?? "");
  const [body, setBody] = React.useState(draft.body ?? "");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [regenInstruction, setRegenInstruction] = React.useState("");
  const [regenOpen, setRegenOpen] = React.useState(false);

  function submit(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("draftId", draft.id);
      fd.append("decision", decision);
      if (decision === "approved") {
        fd.append("finalSubject", subject);
        fd.append("finalBody", body);
      }
      if (notes) fd.append("reviewNotes", notes);
      const res = await reviewAIDraft(fd);
      if (!res.ok) {
        setError(res.error ?? "Could not save review.");
      }
    });
  }

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("draftId", draft.id);
      if (regenInstruction) fd.append("instruction", regenInstruction);
      const res = await regenerateAIDraft(fd);
      if (!res.ok) {
        setError(res.error ?? "Could not regenerate.");
      } else {
        setRegenOpen(false);
        setRegenInstruction("");
      }
    });
  }

  return (
    <li className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-sm bg-gold-weak text-gold flex items-center justify-center">
            <Sparkles className="w-4 h-4" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-ink">AI draft</span>
            <span className="text-[11px] text-ink-tertiary">
              {draft.aiModel ? `${draft.aiModel} · ` : ""}
              generated {draft.aiGeneratedAt ? formatDate(draft.aiGeneratedAt, "short") : "—"}
            </span>
          </div>
        </div>
        <Badge tone="gold">Pending review</Badge>
      </header>

      {draft.aiSummary && (
        <div className="rounded-sm border border-accent/20 bg-accent-weak/40 px-3 py-2">
          <span className="text-label text-accent">Qualification reasoning</span>
          <p className="text-sm text-ink leading-relaxed mt-1">{draft.aiSummary}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-label">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!editing}
          className={cn(
            "h-10 rounded-sm border bg-surface px-3 text-sm text-ink focus:outline-none",
            editing
              ? "border-line-strong focus:border-line-strong"
              : "border-line-soft text-ink-secondary",
          )}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-label">Body</label>
        <textarea
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={!editing}
          className={cn(
            "rounded-sm border bg-surface px-3 py-2 text-sm leading-relaxed text-ink focus:outline-none whitespace-pre-wrap",
            editing
              ? "border-line-strong focus:border-line-strong"
              : "border-line-soft text-ink-secondary",
          )}
        />
      </div>

      {editing && (
        <div className="flex flex-col gap-2">
          <label className="text-label">Reviewer note (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why you edited the draft, any context for the next reviewer."
            className="h-10 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
          />
        </div>
      )}

      {error && (
        <div className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
          {error}
        </div>
      )}

      {regenOpen && (
        <div className="rounded-sm border border-gold/30 bg-gold-weak/30 px-3 py-3 flex flex-col gap-2">
          <label className="text-label">
            Optional instruction (e.g. shorter, more formal)
          </label>
          <input
            type="text"
            value={regenInstruction}
            onChange={(e) => setRegenInstruction(e.target.value)}
            placeholder="Leave blank for an alternative same-tone draft"
            className="h-9 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRegenOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={regenerate} disabled={pending}>
              {pending ? "Regenerating…" : "Generate alternative"}
            </Button>
          </div>
        </div>
      )}

      <footer className="flex items-center justify-end gap-2 pt-2 border-t border-line-soft">
        {!editing ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => submit("rejected")}
              disabled={pending}
            >
              Reject
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRegenOpen((v) => !v)}
              disabled={pending}
              title="Ask the AI to generate an alternative draft"
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
              Regenerate
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              Edit
            </Button>
            <Button
              type="button"
              onClick={() => submit("approved")}
              disabled={pending}
              title="Approves the draft as a reference; sending happens in Stage 2.2.B"
            >
              Approve as reference
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel edit
            </Button>
            <Button
              type="button"
              onClick={() => submit("approved")}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save & approve"}
            </Button>
          </>
        )}
      </footer>
    </li>
  );
}

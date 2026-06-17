"use client";

/**
 * AI-agents cabinet — digest detail interactive controls.
 *
 * Two pieces:
 *   · DigestActionBar    — Approve (draft) / Distribute (approved),
 *                          status-gated, calls the co-located adapters.
 *   · DigestSectionEditor — inline edit for a single digest section,
 *                          shown while the digest is still editable
 *                          (not distributed). Falls back to the
 *                          read-only render when not editing.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Send } from "lucide-react";
import {
  approveDigestForUI,
  distributeDigestForUI,
  editDigestSectionForUI,
} from "./_actions";

export type DigestSectionKey =
  | "executiveSummary"
  | "cashPosition"
  | "projectProgress"
  | "sales"
  | "investor"
  | "operations"
  | "risks";

export interface DigestRecipientOption {
  recipientType: string;
  recipientId: string;
  label: string;
}

export function DigestActionBar({
  code,
  status,
  recipientOptions,
}: {
  code: string;
  status: string;
  recipientOptions: DigestRecipientOption[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  function onApprove() {
    setError(null);
    start(async () => {
      const r = await approveDigestForUI(code);
      if (!r.ok) {
        setError(r.error ?? "Approve failed.");
        return;
      }
      router.refresh();
    });
  }

  function onDistribute() {
    setError(null);
    const recipients = recipientOptions
      .filter((o) => selected.has(`${o.recipientType}:${o.recipientId}`))
      .map((o) => ({ recipientType: o.recipientType, recipientId: o.recipientId }));
    if (recipients.length === 0) {
      setError("Select at least one recipient.");
      return;
    }
    start(async () => {
      const r = await distributeDigestForUI(code, recipients);
      if (!r.ok) {
        setError(r.error ?? "Distribute failed.");
        return;
      }
      router.refresh();
    });
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (status === "distributed") {
    return (
      <p className="text-sm text-ink-3">
        This digest has been distributed. No further actions available.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status === "draft" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="btn btn-primary btn-sm"
          >
            <Check className="w-4 h-4" strokeWidth={1.75} />
            Approve digest
          </button>
          <span className="text-xs text-ink-3">
            Approve to unlock distribution.
          </span>
        </div>
      )}

      {status === "approved" && (
        <div className="flex flex-col gap-2">
          <div className="label">Distribute to</div>
          {recipientOptions.length === 0 ? (
            <p className="text-xs text-ink-3">
              No recipients available for this workspace.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recipientOptions.map((o) => {
                const key = `${o.recipientType}:${o.recipientId}`;
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                      disabled={pending}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={onDistribute}
            disabled={pending || recipientOptions.length === 0}
            className="btn btn-primary btn-sm self-start"
          >
            <Send className="w-4 h-4" strokeWidth={1.75} />
            Distribute
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function DigestSectionEditor({
  code,
  section,
  initialContent,
  editable,
}: {
  code: string;
  section: DigestSectionKey;
  initialContent: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(initialContent ?? "");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSave() {
    setError(null);
    start(async () => {
      const r = await editDigestSectionForUI(code, section, value);
      if (!r.ok) {
        setError(r.error ?? "Save failed.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          rows={6}
          className="w-full text-sm px-2.5 py-2 rounded border border-line-soft bg-surface font-sans leading-relaxed disabled:opacity-50"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="btn btn-primary btn-sm"
          >
            <Check className="w-4 h-4" strokeWidth={1.75} />
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(initialContent ?? "");
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {initialContent ? (
        <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
          {initialContent}
        </pre>
      ) : (
        <p className="text-ink-tertiary text-sm">(empty)</p>
      )}
      {editable && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-secondary btn-sm mt-2"
        >
          <Pencil className="w-4 h-4" strokeWidth={1.75} />
          Edit section
        </button>
      )}
    </div>
  );
}

"use client";

/**
 * Compact "log a message" form for a sales conversation transcript. Calls the
 * org-scoped appendConversationMessage server action (which verifies the thread
 * belongs to the caller's org and bumps the thread's message count), then
 * router.refresh so the new bubble + the count badge re-render.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { appendConversationMessage } from "@/lib/development/server/conversation-review/conversation-actions";

export function LogMessageForm({ threadCode }: { threadCode: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState<"inbound" | "outbound">(
    "inbound",
  );
  const [sender, setSender] = React.useState("");
  const [body, setBody] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!body.trim()) {
      setErr("Message body is required.");
      return;
    }
    start(async () => {
      const r = await appendConversationMessage({
        threadCode,
        direction,
        senderName: sender || null,
        body,
      });
      if (!r.ok) {
        setErr(r.error ?? "Could not log message.");
        return;
      }
      setBody("");
      setSender("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={direction}
          onChange={(e) =>
            setDirection(e.target.value as "inbound" | "outbound")
          }
          className="input input-sm"
          aria-label="Direction"
        >
          <option value="inbound">Inbound (from prospect)</option>
          <option value="outbound">Outbound (from us)</option>
        </select>
        <input
          type="text"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          placeholder="Sender (optional)"
          className="input input-sm flex-1 min-w-[160px]"
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Message body…"
        rows={2}
        className="input"
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Logging…" : "Log message"}
        </button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </form>
  );
}

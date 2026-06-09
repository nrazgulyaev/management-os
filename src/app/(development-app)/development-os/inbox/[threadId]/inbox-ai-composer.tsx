"use client";

/**
 * Block 03 — unified-inbox reply composer with the AI-draft loop (HITL).
 *
 * Replaces the plain server-action <form> on the thread page. Flow:
 *   - "AI draft"      → generateInboxDraftAction; fills the textarea for the
 *                       human to review/edit. Honors the per-org inbox-agent
 *                       mode (off refuses), tone, and knowledge sources.
 *   - "Send"          → sendInboxReplyAction; HITL human send.
 *   - "Draft + send"  → only shown when the agent is in mode 'auto'. Drafts
 *                       and sends in one press (still audited, re-checked
 *                       server-side). The human can still edit before this.
 *
 * The composer never sends silently: even in auto mode the operator presses
 * a button, and the draft is shown first.
 */

import * as React from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  generateInboxDraftAction,
  sendInboxReplyAction,
} from "@/features/ai-agents/inbox-draft-actions";
import type { AgentMode } from "@/features/ai-agents/agent-config-keys";
import type { MessagingChannel } from "@/lib/db/schema/messaging";

interface Props {
  threadId: string;
  channel: MessagingChannel;
  channelLabel: string;
  defaultRecipient: string;
  defaultSubject: string | null;
  hasMessages: boolean;
}

const MODE_LABEL: Record<AgentMode, string> = {
  auto: "Auto-send on",
  semi: "Review before send",
  off: "AI off",
};

const MODE_TONE: Record<AgentMode, "success" | "info" | "neutral"> = {
  auto: "success",
  semi: "info",
  off: "neutral",
};

export function InboxAiComposer({
  threadId,
  channel,
  channelLabel,
  defaultRecipient,
  defaultSubject,
  hasMessages,
}: Props) {
  const [recipient, setRecipient] = React.useState(defaultRecipient);
  const [subject, setSubject] = React.useState(defaultSubject ?? "");
  const [text, setText] = React.useState("");
  const [drafting, setDrafting] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [mode, setMode] = React.useState<AgentMode | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function draft(): Promise<string | null> {
    setError(null);
    setNotice(null);
    setDrafting(true);
    const res = await generateInboxDraftAction(threadId);
    setDrafting(false);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setMode(res.mode);
    setText(res.draft);
    setNotice("AI draft ready — review and edit before sending.");
    return res.draft;
  }

  async function doSend(body: string, aiAuto: boolean) {
    setError(null);
    setSending(true);
    const res = await sendInboxReplyAction({
      threadId,
      channel: channel as Exclude<MessagingChannel, "internal_note">,
      recipientExternalId: recipient.trim(),
      text: body.trim(),
      subject: channel === "email" ? subject.trim() || undefined : undefined,
      aiAuto,
    });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setText("");
    setNotice(`Reply sent via ${channelLabel}.`);
  }

  async function onSendClick(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !recipient.trim() || sending) return;
    await doSend(text, false);
  }

  async function onAutoDraftAndSend() {
    if (sending || drafting) return;
    const body = await draft();
    if (body && body.trim()) {
      await doSend(body, true);
    }
  }

  const busy = drafting || sending;

  return (
    <form
      onSubmit={onSendClick}
      className="space-y-3 rounded-md border border-line-soft bg-surface p-3"
      data-testid="inbox-ai-composer"
    >
      <div className="flex items-center gap-2">
        <span className="text-ink-secondary text-xs uppercase tracking-wide">
          Reply ({channelLabel})
        </span>
        {mode && (
          <Badge tone={MODE_TONE[mode]}>{MODE_LABEL[mode]}</Badge>
        )}
        <span className="ml-auto text-[11px] text-ink-tertiary">
          AI drafts; you review before it goes out (HITL).
        </span>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-secondary text-xs uppercase tracking-wide">
          Recipient ({channel})
        </span>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          required
          className="rounded-md border border-line-soft bg-surface px-3 py-2"
        />
      </label>

      {channel === "email" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-secondary text-xs uppercase tracking-wide">
            Subject
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-md border border-line-soft bg-surface px-3 py-2"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-secondary text-xs uppercase tracking-wide">
          Message
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={4}
          placeholder="Write a reply, or press AI draft to generate one…"
          className="rounded-md border border-line-soft bg-surface px-3 py-2 font-sans"
        />
      </label>

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="text-xs text-success" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void draft()}
          disabled={busy || !hasMessages}
          title={
            hasMessages
              ? "Generate an AI draft you can review and edit before sending"
              : "No messages to draft from yet"
          }
        >
          <Sparkles className="w-4 h-4" strokeWidth={1.75} />
          {drafting ? "Drafting…" : "AI draft"}
        </Button>
        {mode === "auto" && (
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={() => void onAutoDraftAndSend()}
            disabled={busy || !hasMessages || !recipient.trim()}
            title="Auto mode: draft and send in one step (audited)"
          >
            <Sparkles className="w-4 h-4" strokeWidth={1.75} />
            Draft + send
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !text.trim() || !recipient.trim()}
        >
          <Send className="w-4 h-4" strokeWidth={1.75} />
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}

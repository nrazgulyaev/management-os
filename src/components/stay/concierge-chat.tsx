"use client";

import { useState, useTransition } from "react";
import { submitConciergeMessageAction } from "@/features/guest-ai-concierge/actions";
import {
  HandoffModal,
  type HandoffEntryHint,
} from "./handoff-modal";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  safetyStatus: "ok" | "refused" | "redacted" | "error";
  citations?: Array<{ key: string; label: string; count: number }>;
  model?: string | null;
}

export interface ConciergeChatProps {
  token: string;
  initialMessages: ChatMessage[];
  villaName: string;
  remainingMessages: number;
  suggestedPrompts: string[];
}

export function ConciergeChat({
  token,
  initialMessages,
  villaName,
  remainingMessages,
  suggestedPrompts,
}: ConciergeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingMessages);
  const [isPending, startTransition] = useTransition();
  const [handoff, setHandoff] = useState<{
    open: boolean;
    hint: HandoffEntryHint;
    seed: string;
  }>({ open: false, hint: "ask_human", seed: "" });

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      safetyStatus: "ok",
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    startTransition(async () => {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("message", trimmed);
      const out = await submitConciergeMessageAction(null, fd);
      if (!out || !("ok" in out)) {
        setError("Couldn't send. Please try again.");
        return;
      }
      if (!out.ok) {
        setError(out.error);
        return;
      }
      const assistant: ChatMessage = {
        id: `local-asst-${Date.now()}`,
        role: "assistant",
        content: out.reply,
        safetyStatus: out.safetyStatus,
      };
      setMessages((prev) => [...prev, assistant]);
      setRemaining((r) => Math.max(0, r - 1));
    });
  }

  const conversationDone = remaining <= 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-line-soft bg-canvas/60 p-4 md:p-5">
        <p className="text-xs text-ink-secondary">
          The concierge can guide you through the villa, neighborhood,
          and services — but cannot reveal access codes or confirm paid
          services. For reveal-on-tap, use the Wi-Fi or Check-in pages.
        </p>
      </div>

      {messages.length === 0 && (
        <div className="rounded-xl border border-line-soft bg-surface p-5">
          <p className="text-sm text-ink-secondary">
            Hi 👋 I'm the {villaName} concierge. Ask anything about your
            stay — house rules, recommendations nearby, services we
            offer.
          </p>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {messages.map((m, idx) => {
          const isLastAssistant =
            m.role === "assistant" && idx === messages.length - 1;
          return (
            <li
              key={m.id}
              className={
                m.role === "user"
                  ? "self-end max-w-[85%] rounded-2xl rounded-br-sm bg-ink text-ink-inverse px-4 py-3"
                  : "self-start max-w-[90%] rounded-2xl rounded-bl-sm border border-line-soft bg-surface px-4 py-3"
              }
            >
              <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              {m.role === "assistant" &&
                (m.safetyStatus === "refused" ||
                  m.safetyStatus === "redacted") && (
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mt-2">
                    Safety: {m.safetyStatus}
                  </div>
                )}
              {m.role === "assistant" &&
                m.citations &&
                m.citations.length > 0 && (
                  <div className="text-[10px] text-ink-tertiary mt-2">
                    Source:{" "}
                    {m.citations.map((c) => `${c.label}`).join(" · ")}
                  </div>
                )}
              {isLastAssistant && !isPending && (
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-line-soft">
                  <button
                    type="button"
                    onClick={() =>
                      setHandoff({
                        open: true,
                        hint:
                          m.safetyStatus === "refused"
                            ? "ai_refusal_followup"
                            : "ask_human",
                        seed: "",
                      })
                    }
                    className="text-[11px] px-3 py-1.5 rounded-full border border-line-soft hover:border-line-strong text-ink-secondary"
                  >
                    Ask human concierge
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setHandoff({
                        open: true,
                        hint: "report_problem",
                        seed: "",
                      })
                    }
                    className="text-[11px] px-3 py-1.5 rounded-full border border-line-soft hover:border-line-strong text-ink-secondary"
                  >
                    Report this to staff
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!conversationDone && messages.length === 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Try one of these
          </span>
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={isPending}
                className="text-xs px-3 py-2 rounded-full border border-line-soft bg-surface hover:border-line-strong"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-weak/30 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {!conversationDone ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 sticky bottom-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            maxLength={800}
            placeholder="Ask the concierge…"
            disabled={isPending}
            className="flex-1 px-3 py-3 rounded-xl border border-line-soft bg-canvas text-sm text-ink resize-none focus:border-line-strong"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="h-12 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending ? "…" : "Send"}
          </button>
        </form>
      ) : (
        <div className="rounded-xl border border-line-soft bg-surface p-5 flex flex-col gap-3">
          <p className="text-sm text-ink-secondary">
            You've reached this conversation's limit. Send your question
            to a human concierge below — staff will follow up directly.
          </p>
          <button
            type="button"
            onClick={() =>
              setHandoff({ open: true, hint: "ask_human", seed: "" })
            }
            className="self-start h-10 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
          >
            Ask human concierge
          </button>
        </div>
      )}

      <p className="text-[10px] text-ink-tertiary text-center">
        {remaining} message{remaining === 1 ? "" : "s"} left in this session.
      </p>

      <HandoffModal
        token={token}
        open={handoff.open}
        initialHint={handoff.hint}
        initialMessage={handoff.seed}
        onClose={() => setHandoff((h) => ({ ...h, open: false }))}
      />
    </div>
  );
}

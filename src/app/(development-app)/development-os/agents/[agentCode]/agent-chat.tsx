"use client";

/**
 * P5.5.2 AGENT-CHAT — client island for the user-facing chat.
 *
 * Why not Vercel AI SDK's `useChat`?
 *   · `useChat` v6 expects UIMessageStream chunks (the JSON
 *     UIMessageChunk protocol), but our /api/agents/[id]/query endpoint
 *     returns a plain text/plain stream via `toTextStreamResponse()`.
 *     We'd have to either:
 *       a) switch the endpoint to `toUIMessageStreamResponse()`, or
 *       b) wire a manual fetch reader on the client.
 *   · (b) is fewer moving parts: smaller bundle, no SDK version-skew
 *     surface, and the streaming code is ~30 lines. We pick (b).
 *
 * Header `X-Thread-Id` comes back on the first response chunk so we
 * can surface the new thread id without a refetch (server action that
 * lists threads runs on the parent page on revalidate).
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, ChevronDown, ChevronRight, FileText } from "lucide-react";
import type { ChatMessage, MessageCitation } from "@/lib/agents/thread-actions";

interface AgentChatProps {
  agentId: string;
  agentCode: string;
  agentDisplayName: string;
  threadId: string | null;
  initialMessages: ChatMessage[];
}

interface LiveMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  retrievedChunkIds?: string[];
}

export function AgentChat({
  agentId,
  agentCode,
  threadId: initialThreadId,
  initialMessages,
}: AgentChatProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<LiveMessage[]>(
    initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      retrievedChunkIds: m.retrievedChunkIds,
    })),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset to server-provided messages when thread changes (parent
  // re-renders with new initialMessages on thread switch).
  useEffect(() => {
    setMessages(
      initialMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        retrievedChunkIds: m.retrievedChunkIds,
      })),
    );
    setThreadId(initialThreadId);
  }, [initialThreadId, initialMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    setError(null);
    setBusy(true);
    setInput("");

    const userMessageId = `local-user-${Date.now()}`;
    const assistantMessageId = `local-assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: trimmed },
      { id: assistantMessageId, role: "assistant", content: "", isStreaming: true },
    ]);

    try {
      const res = await fetch(`/api/agents/${agentId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, threadId }),
      });

      const headerThreadId = res.headers.get("X-Thread-Id");
      if (headerThreadId && headerThreadId !== threadId) {
        setThreadId(headerThreadId);
      }

      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => ({ error: "Request failed." }));
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId ? { ...m, content: acc } : m,
          ),
        );
      }

      // Finalize streaming flag
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
        ),
      );

      // Pull fresh server data (thread list + persisted messages with
      // retrievedChunkIds). The parent server component re-renders.
      if (headerThreadId) {
        startTransition(() => {
          router.replace(
            `/development-os/agents/${agentCode}?thread=${headerThreadId}`,
            { scroll: false },
          );
          router.refresh();
        });
      } else {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Streaming failed.";
      setError(msg);
      // Drop the empty assistant placeholder
      setMessages((prev) =>
        prev.filter((m) => m.id !== assistantMessageId),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[480px] bg-surface rounded-md border border-line-soft overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4"
      >
        {messages.length === 0 ? (
          <div className="m-auto text-center text-sm text-ink-tertiary max-w-md">
            Ask a question to start the conversation. Answers are
            grounded in the documents your administrator has uploaded
            for this agent.
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="border-t border-danger/30 bg-danger/5 px-6 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-line-soft px-4 py-3 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          rows={2}
          placeholder="Ask anything…"
          disabled={busy}
          className="flex-1 resize-none rounded-md border border-line-soft bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-ink/30"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90 disabled:opacity-40 inline-flex items-center gap-2"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: LiveMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-md px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser
            ? "bg-ink text-ink-inverse"
            : "bg-canvas border border-line-soft text-ink"
        }`}
      >
        {message.content || (message.isStreaming ? "…" : "")}
        {!isUser &&
          message.retrievedChunkIds &&
          message.retrievedChunkIds.length > 0 && (
            <CitationsFooter chunkIds={message.retrievedChunkIds} />
          )}
      </div>
    </div>
  );
}

function CitationsFooter({ chunkIds }: { chunkIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [citations, setCitations] = useState<MessageCitation[] | null>(null);

  async function ensureLoaded() {
    if (citations) return;
    const { getMessageCitations } = await import("@/lib/agents/thread-actions");
    const list = await getMessageCitations(chunkIds);
    setCitations(list);
  }

  return (
    <div className="mt-3 pt-3 border-t border-line-soft">
      <button
        type="button"
        onClick={async () => {
          await ensureLoaded();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 text-[11px] text-ink-tertiary hover:text-ink"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" strokeWidth={1.75} />
        ) : (
          <ChevronRight className="w-3 h-3" strokeWidth={1.75} />
        )}
        {chunkIds.length} source{chunkIds.length === 1 ? "" : "s"}
      </button>
      {open && citations && (
        <ul className="mt-2 flex flex-col gap-2">
          {citations.map((c, i) => (
            <li
              key={c.chunkId}
              className="rounded-sm bg-muted/40 px-3 py-2 text-[11px] text-ink-secondary"
            >
              <div className="flex items-center gap-1.5 mb-1 text-ink-tertiary">
                <FileText className="w-3 h-3" strokeWidth={1.75} />
                <span className="font-medium">Source {i + 1}</span>
                {c.filename && <span>· {c.filename}</span>}
              </div>
              <p className="leading-relaxed">{c.contentPreview}…</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

/**
 * P5.4.POLISH.1 AGENT-TEST-CHAT — super_admin client-side test chat.
 *
 * Uses the same /api/agents/[id]/query endpoint as the user-facing
 * chat but passes `testMode: true`. The endpoint promotes the flag
 * only if the session is super_admin; non-admins silently get
 * testMode=false (so this surface is safe to deploy without an
 * extra route).
 *
 * Differences from the user-facing chat:
 *   · No thread persistence into the sidebar (the platform admin
 *     surface doesn't list threads)
 *   · Shows tokens-in / tokens-out / latency hint when the call
 *     completes (best-effort — Vercel AI SDK's text stream doesn't
 *     carry usage in-band; we read from the run row asynchronously
 *     would be more, but for now we just surface what the X-Run-Id
 *     header gives us as a debug link)
 *   · Subscription / budget gates bypassed server-side
 */

import { useRef, useState } from "react";
import { Send, Loader2, Bot } from "lucide-react";

interface LiveMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function AgentTestChat({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    setInput("");

    const userId = `local-user-${Date.now()}`;
    const assistantId = `local-asst-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "", isStreaming: true },
    ]);

    try {
      const res = await fetch(`/api/agents/${agentId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, testMode: true }),
      });

      const runId = res.headers.get("X-Run-Id");
      if (runId) setLastRunId(runId);

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
          prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
        );
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
      );
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Streaming failed.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]);
    setError(null);
    setLastRunId(null);
  }

  return (
    <div className="card overflow-hidden flex flex-col h-[600px]">
      <div className="ag-chat-h">
        <span className="ag-ava">
          <Bot className="w-4 h-4" strokeWidth={1.7} />
        </span>
        <div className="mono text-[11px] text-[var(--ink-4)] leading-snug">
          Test mode · subscription + budget gates bypassed · runs still recorded
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[var(--ink-4)]">
          {lastRunId && (
            <span className="mono">run {lastRunId.slice(0, 8)}</span>
          )}
          <button
            type="button"
            onClick={reset}
            className="btn btn-ghost btn-sm"
          >
            Clear
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="ag-chat-body">
        {messages.length === 0 ? (
          <div className="ag-chat-empty">
            <p className="ag-muted">
              Type a question to test this agent. RAG retrieval + provider call run
              exactly as they would for a subscribed user.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`ag-bubble ${m.role === "user" ? "user" : "bot"}`}
            >
              {m.content || (m.isStreaming ? "…" : "")}
            </div>
          ))
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="border-t border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-6 py-2 text-sm text-[var(--danger)]"
        >
          {error}
        </div>
      )}

      <form onSubmit={send} className="ag-chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Write as a guest / user…"
          disabled={busy}
          className="textarea"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="btn btn-accent"
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

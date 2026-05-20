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
import { Send, Loader2 } from "lucide-react";

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
    <div className="flex flex-col h-[600px] bg-surface rounded-md border border-line-soft overflow-hidden">
      <div className="px-4 py-2 border-b border-line-soft flex items-center justify-between text-[11px] text-ink-tertiary">
        <span>
          Test mode · subscription + budget gates bypassed · runs still recorded
        </span>
        <div className="flex items-center gap-3">
          {lastRunId && (
            <span className="font-mono">run {lastRunId.slice(0, 8)}</span>
          )}
          <button
            type="button"
            onClick={reset}
            className="text-ink-tertiary hover:text-ink underline"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4"
      >
        {messages.length === 0 ? (
          <div className="m-auto text-center text-sm text-ink-tertiary max-w-md">
            Type a question to test this agent. RAG retrieval + provider
            call run exactly as they would for a subscribed user.
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-md px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user"
                    ? "bg-ink text-ink-inverse"
                    : "bg-canvas border border-line-soft text-ink"
                }`}
              >
                {m.content || (m.isStreaming ? "…" : "")}
              </div>
            </div>
          ))
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
        onSubmit={send}
        className="border-t border-line-soft px-4 py-3 flex items-end gap-2"
      >
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
          placeholder="Test prompt…"
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

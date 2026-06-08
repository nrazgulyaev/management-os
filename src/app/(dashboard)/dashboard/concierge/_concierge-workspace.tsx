"use client";

import * as React from "react";
import {
  generateConciergeDraftAction,
  loadConciergeThreadAction,
  postConciergeStaffReplyAction,
  type ThreadMessage,
} from "@/features/guest-ai-concierge/cabinet-actions";

export interface SessionRow {
  id: string;
  guestName: string | null;
  villaCode: string | null;
  language: string | null;
  status: string;
  lastMessageAt: string | null;
  messageCount: number;
}

type Filter = "all" | "live" | "handoff";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AUTHOR_LABEL: Record<ThreadMessage["author"], string> = {
  guest: "Guest",
  ai: "Concierge AI",
  staff: "You · staff",
  system: "System",
};

const AUTHOR_CLASS: Record<ThreadMessage["author"], string> = {
  guest: "ct-msg ct-guest",
  ai: "ct-msg ct-agent",
  staff: "ct-msg ct-staff",
  system: "",
};

export function ConciergeWorkspace({ sessions }: { sessions: SessionRow[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [activeId, setActiveId] = React.useState<string | null>(
    sessions[0]?.id ?? null,
  );
  const [messages, setMessages] = React.useState<ThreadMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const streamRef = React.useRef<HTMLDivElement>(null);

  async function generateDraft() {
    if (!activeId || generating) return;
    setGenerating(true);
    setError(null);
    const res = await generateConciergeDraftAction(activeId);
    if (res.ok) setDraft(res.draft);
    else setError(res.error);
    setGenerating(false);
  }

  const active = sessions.find((s) => s.id === activeId) ?? null;

  const filtered = sessions.filter((s) => {
    if (filter === "live") return s.status === "active";
    if (filter === "handoff") return s.status === "handoff";
    return true;
  });

  const load = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await loadConciergeThreadAction(id);
    if (res.ok) setMessages(res.messages);
    else {
      setMessages([]);
      setError(res.error);
    }
    setLoading(false);
  }, []);

  // Load the first / selected session's transcript.
  React.useEffect(() => {
    if (activeId) void load(activeId);
    else setMessages([]);
  }, [activeId, load]);

  // Keep the stream pinned to the latest message.
  React.useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setError(null);
    const res = await postConciergeStaffReplyAction(activeId, body);
    if (res.ok) {
      setMessages(res.messages);
      setDraft("");
    } else {
      setError(res.error);
    }
    setSending(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-3.5 mb-[18px] lg:h-[520px]">
      {/* Session inbox */}
      <div className="request-inbox">
        <div className="ri-head">
          <h3 className="ri-title">Sessions</h3>
          <div className="ri-filters">
            <button
              type="button"
              className={`ri-chip${filter === "all" ? " is-on" : ""}`}
              onClick={() => setFilter("all")}
            >
              All · {sessions.length}
            </button>
            <button
              type="button"
              className={`ri-chip${filter === "live" ? " is-on" : ""}`}
              onClick={() => setFilter("live")}
            >
              Live
            </button>
            <button
              type="button"
              className={`ri-chip${filter === "handoff" ? " is-on" : ""}`}
              onClick={() => setFilter("handoff")}
            >
              Handoff
            </button>
          </div>
        </div>
        <div className="ri-list">
          {filtered.length === 0 ? (
            <div className="ri-empty">
              {sessions.length === 0
                ? "No active sessions. They appear here when guests message via WhatsApp, the in-stay portal, or direct chat."
                : "No sessions match this filter."}
            </div>
          ) : (
            filtered.map((s) => {
              const urgent = s.status === "handoff";
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={`ri-row${s.id === activeId ? " is-active" : ""}${urgent ? " is-urgent" : ""}`}
                >
                  <div className="ri-meta">
                    <span>
                      {s.villaCode ?? "—"}
                      {s.language ? ` · ${s.language.toUpperCase()}` : ""}
                    </span>
                    <span>{fmtTime(s.lastMessageAt)}</span>
                  </div>
                  <div className="ri-name">{s.guestName ?? "Guest"}</div>
                  <div className="ri-preview">
                    {s.messageCount} message{s.messageCount === 1 ? "" : "s"} · {s.status}
                  </div>
                  <div className="ri-foot">
                    <span className="ri-channel">concierge</span>
                    <span className="ri-tag">
                      {s.status === "active" ? "Live" : s.status}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="concierge-thread">
        <div className="px-[18px] py-3 border-b border-line flex items-center gap-3 bg-cream-warm">
          <div className="min-w-0">
            <div className="text-[14px] font-medium truncate">
              {active ? (active.guestName ?? "Guest") : "No session selected"}
            </div>
            <div className="mono text-[11px] text-ink-3 truncate">
              {active
                ? `${active.villaCode ?? "—"}${active.language ? ` · ${active.language.toUpperCase()}` : ""} · ${active.status}`
                : "Pick a session on the left to view its transcript"}
            </div>
          </div>
          {active && (
            <span className="ml-auto mono text-[10px] text-ink-4 whitespace-nowrap">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="ct-stream" ref={streamRef}>
          {!active ? (
            <div className="m-auto text-center text-[13px] text-ink-3 italic max-w-[340px]">
              Configure WhatsApp / in-stay portal channels on the AI hub to start
              receiving messages — transcripts render here.
            </div>
          ) : loading ? (
            <div className="m-auto text-[12px] text-ink-3">Loading transcript…</div>
          ) : error ? (
            <div className="m-auto text-[12px] text-danger">{error}</div>
          ) : messages.length === 0 ? (
            <div className="m-auto text-center text-[13px] text-ink-3 italic max-w-[340px]">
              No messages yet in this session.
            </div>
          ) : (
            messages.map((m) =>
              m.author === "system" ? (
                <div
                  key={m.id}
                  className="self-center text-[10px] uppercase tracking-[0.08em] text-ink-4"
                >
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className={AUTHOR_CLASS[m.author]}>
                  <div className="ct-msg-head">
                    <span>{AUTHOR_LABEL[m.author]}</span>
                    <span>{fmtTime(m.createdAt)}</span>
                  </div>
                  <div className="ct-msg-body">{m.content}</div>
                  {m.safetyStatus !== "ok" && (
                    <div className="ct-msg-action">
                      Safety:{" "}
                      <span className="ct-msg-action-kind">{m.safetyStatus}</span>
                    </div>
                  )}
                </div>
              ),
            )
          )}
        </div>

        <form className="ct-composer" onSubmit={send}>
          <textarea
            className="textarea"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              active
                ? "Reply as concierge — the guest sees this…"
                : "Select a session to reply"
            }
            disabled={!active || sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(e);
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={generateDraft}
            disabled={!active || generating || sending}
            title="Generate an AI draft for you to review and edit before sending"
          >
            {generating ? "Drafting…" : "✨ AI draft"}
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!active || sending || !draft.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

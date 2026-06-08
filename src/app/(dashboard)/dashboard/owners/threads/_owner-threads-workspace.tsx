"use client";

import * as React from "react";
import {
  loadOwnerThreadForMgmtAction,
  generateOwnerReplyDraftAction,
  postMgmtThreadReplyAction,
  setOwnerThreadStatusAction,
} from "@/features/owner-portal/mgmt-thread-actions";
import type {
  MgmtOwnerThreadDetail,
  MgmtOwnerThreadMessage,
} from "@/features/owner-portal/mgmt-threads";

export interface OwnerThreadRow {
  id: string;
  ownerId: string;
  ownerName: string;
  kind: string;
  subject: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string;
  lastActorKind: string | null;
  preview: string | null;
  messageCount: number;
}

type Filter = "all" | "open" | "needs_reply";

const KIND_LABEL: Record<string, string> = {
  general: "General",
  dispute: "Dispute",
  personal_stay_request: "Personal stay",
  maintenance_question: "Maintenance",
  tax_question: "Tax / statement",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  other: "Other",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function msgClass(m: MgmtOwnerThreadMessage): string {
  if (m.actorKind === "system") return "";
  if (m.actorKind === "mgmt_staff") return "ct-msg ct-staff";
  if (m.actorKind === "concierge_agent") return "ct-msg ct-agent";
  // owner inbound
  return "ct-msg ct-guest";
}

export function OwnerThreadsWorkspace({ threads }: { threads: OwnerThreadRow[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [activeId, setActiveId] = React.useState<string | null>(
    threads[0]?.id ?? null,
  );
  const [detail, setDetail] = React.useState<MgmtOwnerThreadDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const streamRef = React.useRef<HTMLDivElement>(null);

  const active = threads.find((t) => t.id === activeId) ?? null;

  const filtered = threads.filter((t) => {
    if (filter === "open") return t.status === "open";
    if (filter === "needs_reply")
      return t.lastActorKind === "owner" || t.unreadCount > 0;
    return true;
  });

  const load = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await loadOwnerThreadForMgmtAction(id);
    if (res.ok) setDetail(res.thread);
    else {
      setDetail(null);
      setError(res.error);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (activeId) void load(activeId);
    else setDetail(null);
    setDraft("");
  }, [activeId, load]);

  React.useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail, loading]);

  async function generate() {
    if (!activeId || generating) return;
    setGenerating(true);
    setError(null);
    const res = await generateOwnerReplyDraftAction(activeId);
    if (res.ok) setDraft(res.draft);
    else setError(res.error);
    setGenerating(false);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setError(null);
    const res = await postMgmtThreadReplyAction(activeId, body);
    if (res.ok) {
      setDetail(res.thread);
      setDraft("");
    } else {
      setError(res.error);
    }
    setSending(false);
  }

  async function changeStatus(status: string) {
    if (!activeId || updatingStatus) return;
    setUpdatingStatus(true);
    setError(null);
    const res = await setOwnerThreadStatusAction(activeId, status);
    if (res.ok) setDetail(res.thread);
    else setError(res.error);
    setUpdatingStatus(false);
  }

  const detailStatus = detail?.status ?? active?.status ?? "open";
  const needsReplyCount = threads.filter(
    (t) => t.lastActorKind === "owner" || t.unreadCount > 0,
  ).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-3.5 mb-[18px] lg:h-[560px]">
      {/* Thread inbox */}
      <div className="request-inbox">
        <div className="ri-head">
          <h3 className="ri-title">Owner threads</h3>
          <div className="ri-filters">
            <button
              type="button"
              className={`ri-chip${filter === "all" ? " is-on" : ""}`}
              onClick={() => setFilter("all")}
            >
              All · {threads.length}
            </button>
            <button
              type="button"
              className={`ri-chip${filter === "open" ? " is-on" : ""}`}
              onClick={() => setFilter("open")}
            >
              Open
            </button>
            <button
              type="button"
              className={`ri-chip${filter === "needs_reply" ? " is-on" : ""}`}
              onClick={() => setFilter("needs_reply")}
            >
              Needs reply{needsReplyCount > 0 ? ` · ${needsReplyCount}` : ""}
            </button>
          </div>
        </div>
        <div className="ri-list">
          {filtered.length === 0 ? (
            <div className="ri-empty">
              {threads.length === 0
                ? "No owner conversations yet. When an owner messages from their portal inbox, the thread appears here for staff to reply."
                : "No threads match this filter."}
            </div>
          ) : (
            filtered.map((t) => {
              const urgent = t.kind === "dispute";
              const awaiting = t.lastActorKind === "owner" || t.unreadCount > 0;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`ri-row${t.id === activeId ? " is-active" : ""}${urgent ? " is-urgent" : ""}${awaiting ? " is-unread" : ""}`}
                >
                  <div className="ri-meta">
                    <span>{t.ownerName}</span>
                    <span>{fmtTime(t.lastMessageAt)}</span>
                  </div>
                  <div className="ri-name">{t.subject}</div>
                  <div className="ri-preview">
                    {t.preview ?? `${t.messageCount} message${t.messageCount === 1 ? "" : "s"}`}
                  </div>
                  <div className="ri-foot">
                    <span className="ri-channel">
                      {KIND_LABEL[t.kind] ?? t.kind}
                    </span>
                    <span className="ri-tag">
                      {awaiting ? "Awaiting reply" : t.status}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Transcript + composer */}
      <div className="concierge-thread">
        <div className="px-[18px] py-3 border-b border-line flex items-center gap-3 bg-cream-warm">
          <div className="min-w-0">
            <div className="text-[14px] font-medium truncate">
              {active ? active.ownerName : "No thread selected"}
            </div>
            <div className="mono text-[11px] text-ink-3 truncate">
              {active
                ? `${active.subject} · ${KIND_LABEL[active.kind] ?? active.kind} · ${detailStatus}`
                : "Pick a thread on the left to view the conversation"}
            </div>
          </div>
          {active && (
            <select
              className="select ml-auto w-auto text-[12px] py-1"
              value={detailStatus}
              disabled={updatingStatus}
              onChange={(e) => void changeStatus(e.target.value)}
              title="Set thread status"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="escalated">Escalated</option>
              <option value="archived">Archived</option>
            </select>
          )}
        </div>

        <div className="ct-stream" ref={streamRef}>
          {!active ? (
            <div className="m-auto text-center text-[13px] text-ink-3 italic max-w-[340px]">
              Owner conversations land here. Reply as Management, or use AI draft
              to ground a reply in the owner&apos;s statement / payout context.
            </div>
          ) : loading ? (
            <div className="m-auto text-[12px] text-ink-3">Loading conversation…</div>
          ) : error && !detail ? (
            <div className="m-auto text-[12px] text-danger">{error}</div>
          ) : !detail || detail.messages.length === 0 ? (
            <div className="m-auto text-center text-[13px] text-ink-3 italic max-w-[340px]">
              No messages yet in this thread.
            </div>
          ) : (
            detail.messages.map((m) =>
              m.actorKind === "system" ? (
                <div
                  key={m.id}
                  className="self-center text-[10px] uppercase tracking-[0.08em] text-ink-4"
                >
                  {m.body}
                </div>
              ) : (
                <div key={m.id} className={msgClass(m)}>
                  <div className="ct-msg-head">
                    <span>{m.actorName}</span>
                    <span>{fmtTime(m.sentAt)}</span>
                  </div>
                  <div className="ct-msg-body">{m.body}</div>
                </div>
              ),
            )
          )}
        </div>

        {error && detail && (
          <div className="px-[18px] py-1.5 text-[11.5px] text-danger border-t border-line-soft">
            {error}
          </div>
        )}

        <form className="ct-composer" onSubmit={send}>
          <textarea
            className="textarea"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              active
                ? "Reply to the owner as Management…"
                : "Select a thread to reply"
            }
            disabled={!active || sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(e);
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={generate}
            disabled={!active || generating || sending}
            title="Generate an AI draft (grounded in the owner's statement/payout context) for you to review and edit before sending"
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getThreadById,
  listThreadMessages,
} from "@/lib/messaging/queries";
import {
  updateThreadStatusAction,
  markThreadReadAction,
  assignThreadAction,
} from "@/lib/messaging/inbox-actions";
import { listAppUsers } from "@/features/auth/users-service";
import type { MessagingChannel } from "@/lib/db/schema/messaging";
import { InboxAiComposer } from "./inbox-ai-composer";

export const metadata: Metadata = { title: "Thread · Inbox" };
export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<MessagingChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook_messenger: "Messenger",
  email: "Email",
  sms: "SMS",
  internal_note: "Internal note",
};

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Thread</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const thread = await getThreadById(threadId);
  if (!thread) notFound();
  const [messages, assignableUsers] = await Promise.all([
    listThreadMessages(threadId, { limit: 200 }),
    listAppUsers(),
  ]);

  const currentAssigneeId = thread.assignedToUserId ?? null;
  const currentAssigneeName =
    currentAssigneeId
      ? assignableUsers.find((u) => u.id === currentAssigneeId)?.fullName ?? null
      : null;

  const externalIdentifiers =
    (thread.externalIdentifiers as Record<string, string> | null) ?? {};
  const primaryChannel =
    (thread.primaryChannel as MessagingChannel | null) ??
    (thread.channelsUsed[0] as MessagingChannel | undefined) ??
    null;
  const recipient = primaryChannel
    ? externalIdentifiers[primaryChannel] ?? ""
    : "";

  const markReadBound = markThreadReadAction.bind(null, threadId);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inbox">Inbox</Link> /{" "}
            <span>{thread.subject ?? "Thread"}</span>
          </div>
          <h1>{thread.subject ?? "Conversation"}</h1>
          <div className="page-header-meta">
            <span>
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
            {thread.unreadCount > 0 && (
              <>
                <span>·</span>
                <span>{thread.unreadCount} unread</span>
              </>
            )}
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {primaryChannel
              ? `Primary channel: ${CHANNEL_LABELS[primaryChannel]} · ${thread.status}`
              : thread.status}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/inbox"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Inbox
          </Link>
          {thread.unreadCount > 0 && (
            <form action={markReadBound}>
              <button type="submit" className="btn btn-secondary btn-sm">
                Mark read
              </button>
            </form>
          )}
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Conversation</div>
        {messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Once an inbound webhook arrives or you send a reply, the transcript will appear here."
          />
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-md border p-3 text-sm ${
                  m.direction === "inbound"
                    ? "border-line-soft bg-surface"
                    : "border-accent-weak bg-accent-weak/30"
                }`}
              >
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-secondary mb-1">
                  <HandoffBadge tone={m.direction === "inbound" ? "info" : "gold"}>
                    {m.direction}
                  </HandoffBadge>
                  <span>{CHANNEL_LABELS[m.channel as MessagingChannel] ?? m.channel}</span>
                  {m.senderDisplayName && <span>· {m.senderDisplayName}</span>}
                  <span className="ml-auto text-ink-tertiary">
                    {(m.receivedAt ?? m.sentAt ?? m.createdAt)
                      ? new Date(
                          (m.receivedAt ?? m.sentAt ?? m.createdAt) as Date,
                        )
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : ""}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-ink">
                  {m.contentText ?? <span className="text-ink-secondary">(no text)</span>}
                </div>
                {m.contentMediaUrl && (
                  <div className="mt-2 text-xs">
                    <a
                      href={m.contentMediaUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent hover:underline"
                    >
                      {m.contentType} attachment ↗
                    </a>
                  </div>
                )}
                {m.status === "failed" && m.errorMessage && (
                  <div className="mt-2 text-xs text-danger">
                    Failed: {m.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {primaryChannel && primaryChannel !== "internal_note" && (
        <div>
          <div className="label mb-2.5">Reply</div>
          <p className="text-[13px] text-ink-3 mt-0 mb-2.5 max-w-[680px]">
            {`AI can draft the next reply for you to review (HITL); sends via ${CHANNEL_LABELS[primaryChannel]} using credentials from the env. The inbox agent's mode (auto · semi · off) is managed in Settings → AI agents → Agent Inbox. Failed sends surface in the conversation above.`}
          </p>
          <InboxAiComposer
            threadId={threadId}
            channel={primaryChannel}
            channelLabel={CHANNEL_LABELS[primaryChannel]}
            defaultRecipient={recipient}
            defaultSubject={thread.subject ?? null}
            hasMessages={messages.length > 0}
          />
        </div>
      )}

      <div>
        <div className="label mb-2.5">Thread actions</div>
        <form
          action={async (fd: FormData) => {
            "use server";
            const status = (fd.get("status") ?? "active") as
              | "active"
              | "archived"
              | "spam"
              | "pending_assignment";
            await updateThreadStatusAction(threadId, status);
          }}
          className="flex items-center gap-2 text-sm"
        >
          <select
            name="status"
            defaultValue={thread.status}
            className="rounded-md border border-line-soft bg-surface px-3 py-2"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="spam">Spam</option>
            <option value="pending_assignment">Pending assignment</option>
          </select>
          <button type="submit" className="btn btn-secondary btn-sm">
            Update status
          </button>
        </form>

        <form
          action={async (fd: FormData) => {
            "use server";
            const raw = (fd.get("assignedToUserId") ?? "").toString();
            await assignThreadAction(threadId, raw === "" ? null : raw);
          }}
          className="mt-3 flex items-center gap-2 text-sm"
        >
          <label htmlFor="assignedToUserId" className="text-ink-secondary">
            Assign to
          </label>
          <select
            id="assignedToUserId"
            name="assignedToUserId"
            defaultValue={currentAssigneeId ?? ""}
            className="rounded-md border border-line-soft bg-surface px-3 py-2"
          >
            <option value="">Unassigned</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary btn-sm">
            Save assignee
          </button>
          {currentAssigneeName && (
            <span className="text-ink-tertiary">
              Currently: {currentAssigneeName}
            </span>
          )}
        </form>
      </div>
    </DevelopmentShell>
  );
}

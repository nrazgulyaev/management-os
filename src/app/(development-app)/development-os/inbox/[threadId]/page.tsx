import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getThreadById,
  listThreadMessages,
} from "@/lib/messaging/queries";
import {
  sendReplyAction,
  updateThreadStatusAction,
  markThreadReadAction,
} from "@/lib/messaging/inbox-actions";
import type { MessagingChannel } from "@/lib/db/schema/messaging";

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
        <PageHeader title="Thread" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const thread = await getThreadById(threadId);
  if (!thread) notFound();
  const messages = await listThreadMessages(threadId, { limit: 200 });

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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inbox", href: "/development-os/inbox" },
          { label: thread.subject ?? "Thread" },
        ]}
        eyebrow={`${messages.length} message${messages.length === 1 ? "" : "s"}${thread.unreadCount > 0 ? ` · ${thread.unreadCount} unread` : ""}`}
        title={thread.subject ?? "Conversation"}
        description={
          primaryChannel
            ? `Primary channel: ${CHANNEL_LABELS[primaryChannel]} · ${thread.status}`
            : thread.status
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/inbox">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Inbox
              </Link>
            </Button>
            {thread.unreadCount > 0 && (
              <form action={markReadBound}>
                <Button type="submit" variant="secondary" size="sm">
                  Mark read
                </Button>
              </form>
            )}
          </div>
        }
      />

      <Section title="Conversation">
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
                  <Badge tone={m.direction === "inbound" ? "info" : "accent"}>
                    {m.direction}
                  </Badge>
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
      </Section>

      {primaryChannel && primaryChannel !== "internal_note" && (
        <Section
          title="Reply"
          description={`Sends via ${CHANNEL_LABELS[primaryChannel]} using credentials from the env. Failed sends are logged with status=failed and surface in the conversation above.`}
        >
          <form
            action={sendReplyAction}
            className="space-y-3 rounded-md border border-line-soft bg-surface p-3"
            data-testid="messaging-reply-form"
          >
            <input type="hidden" name="threadId" value={threadId} />
            <input
              type="hidden"
              name="channel"
              value={primaryChannel}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary text-xs uppercase tracking-wide">
                Recipient ({primaryChannel})
              </span>
              <input
                type="text"
                name="recipientExternalId"
                defaultValue={recipient}
                required
                className="rounded-md border border-line-soft bg-surface px-3 py-2"
              />
            </label>
            {primaryChannel === "email" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary text-xs uppercase tracking-wide">
                  Subject
                </span>
                <input
                  type="text"
                  name="subject"
                  defaultValue={thread.subject ?? ""}
                  className="rounded-md border border-line-soft bg-surface px-3 py-2"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary text-xs uppercase tracking-wide">
                Message
              </span>
              <textarea
                name="text"
                required
                rows={4}
                placeholder="Write your reply…"
                className="rounded-md border border-line-soft bg-surface px-3 py-2 font-sans"
              />
            </label>
            <div className="flex justify-end">
              <Button type="submit" variant="primary">
                <Send className="w-4 h-4" strokeWidth={1.75} />
                Send
              </Button>
            </div>
          </form>
        </Section>
      )}

      <Section title="Thread actions">
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
          <Button type="submit" variant="secondary" size="sm">
            Update status
          </Button>
        </form>
      </Section>
    </DevelopmentShell>
  );
}

import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { listOwnerThreads, getOwnerThreadDetail } from "@/features/owner-portal/get-threads";
import { SectionHeading } from "@/components/dashboard/primitives";
import { OwnerInboxClient } from "@/components/owner-portal/owner-inbox-client";
import type { ThreadListItem, ThreadKind } from "@/components/owner-portal/thread-list";
import type { ThreadMessage } from "@/components/owner-portal/thread-view";
import type { MsgActorKind } from "@/components/owner-portal/msg-bubble";

/**
 * Sprint OWNER-PORTAL · redesign owner-05 — Inbox.
 *
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/05-inbox.html. Wires
 * the Phase 2.3 owner-05 primitives (ThreadList / ThreadView / MsgBubble)
 * to listOwnerThreads + getOwnerThreadDetail, with replies through
 * postOwnerThreadReplyAction (see OwnerInboxClient). Master-detail:
 * ?thread=<id> selects a conversation.
 */

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const KINDS: ThreadKind[] = ["statement_dispute", "personal_stay", "q_review", "general"];
function asKind(k: string): ThreadKind {
  return (KINDS as string[]).includes(k) ? (k as ThreadKind) : "general";
}

function asActorKind(k: string): MsgActorKind {
  if (k === "owner") return "owner";
  if (k === "concierge_agent" || k === "agent" || k === "ai_agent") return "agent";
  return "mgmt_user";
}

function fmt(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export default async function OwnerInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const sp = await searchParams;
  const threadsRaw = await listOwnerThreads(owner.ownerId);

  const threads: ThreadListItem[] = threadsRaw.map((t) => ({
    id: t.id,
    kind: asKind(t.kind),
    subject: t.subject,
    preview: t.preview ?? "",
    lastMessageLabel: fmt(t.lastMessageAt),
    unreadCount: t.unreadCount,
    counterpart: "Arconique team",
  }));

  const selectedId =
    sp.thread && threadsRaw.some((t) => t.id === sp.thread)
      ? sp.thread
      : (threadsRaw[0]?.id ?? null);

  const detail = selectedId
    ? await getOwnerThreadDetail(selectedId, owner.ownerId)
    : null;

  const messages: ThreadMessage[] = detail
    ? detail.messages.map((m) => ({
        id: m.id,
        actorKind: asActorKind(m.actorKind),
        actorName: m.actorName,
        body: m.body,
        sentLabel: fmt(m.sentAt, true),
        scheduling: m.scheduling,
        schedulingResolved: m.schedulingResolved,
        attachments: m.attachments.map((a) => ({
          documentId: a.documentId,
          name: a.name,
          href: `/api/documents/${a.documentId}/download`,
        })),
      }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Your inbox"
        title="Messages"
        subtitle="Two-way conversations with your management team — statements, stay requests, and anything else. Replies notify the team directly."
      />

      {threads.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line-strong p-8">
          <p className="text-sm text-ink-tertiary italic">
            No conversations yet. When you raise a statement question, request a
            stay, or the team reaches out, the thread appears here.
          </p>
        </div>
      ) : (
        <OwnerInboxClient
          threads={threads}
          selectedId={selectedId}
          subject={detail?.subject ?? null}
          counterpart="Arconique team"
          messages={messages}
        />
      )}
    </div>
  );
}

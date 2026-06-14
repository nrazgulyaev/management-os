import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getAdminThreadById } from "@/features/direct-booking/guest-messages";
import {
  AdminMarkReadButton,
  AdminReplyForm,
  AdminSetThreadStatusButton,
} from "@/components/direct-booking/guest-status-buttons";

export const metadata = { title: "Direct booking thread" };
export const dynamic = "force-dynamic";

export default async function GuestMessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const data = await getAdminThreadById(threadId);
  if (!data) notFound();
  const { thread, messages } = data;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <Link href="/dashboard/direct-bookings/messages">Messages</Link> /{" "}
            <span>{threadId.slice(0, 8)}</span>
          </div>
          <h1>Thread · {thread.status}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {thread.requestId
              ? `Linked to request ${thread.requestId.slice(0, 8)}`
              : thread.holdId
                ? `Linked to hold ${thread.holdId.slice(0, 8)}`
                : thread.bookingId
                  ? `Linked to booking ${thread.bookingId.slice(0, 8)}`
                  : "Standalone thread"}
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <AdminMarkReadButton threadId={thread.id} />
            {thread.status !== "closed" && (
              <AdminSetThreadStatusButton
                threadId={thread.id}
                status="closed"
                label="Close"
              />
            )}
            {thread.status !== "archived" && (
              <AdminSetThreadStatusButton
                threadId={thread.id}
                status="archived"
                label="Archive"
              />
            )}
            {thread.status !== "open" && (
              <AdminSetThreadStatusButton
                threadId={thread.id}
                status="open"
                label="Reopen"
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-10">
        {thread.requestId && (
          <p className="text-xs text-ink-tertiary">
            <Link
              href={`/dashboard/direct-bookings/requests/${thread.requestId}`}
              className="underline"
            >
              Open the linked request →
            </Link>
          </p>
        )}
        <div>
          <div className="label mb-2.5">
            Conversation · {messages.length} message
            {messages.length === 1 ? "" : "s"}
          </div>
          {messages.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
              No messages yet.
            </p>
          ) : (
            <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
              {messages.map((m) => (
                <li key={m.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                    <HandoffBadge
                      tone={
                        m.authorType === "staff"
                          ? "gold"
                          : m.authorType === "system"
                            ? "soft"
                            : "info"
                      }
                    >
                      {m.authorType}
                    </HandoffBadge>
                    <span>
                      {m.createdAt instanceof Date
                        ? m.createdAt.toISOString().slice(0, 16).replace("T", " ")
                        : (m.createdAt as unknown as string)}
                    </span>
                    {m.visibility === "internal_only" && (
                      <HandoffBadge tone="warn">internal only</HandoffBadge>
                    )}
                  </div>
                  <p className="text-sm text-ink leading-relaxed">
                    {m.bodyRedacted}
                  </p>
                  {m.body !== m.bodyRedacted && (
                    <details className="text-[11px] text-ink-tertiary">
                      <summary className="cursor-pointer">
                        Show original (staff only)
                      </summary>
                      <pre className="whitespace-pre-wrap mt-1">{m.body}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {thread.status === "open" && (
          <div>
            <div className="label mb-2.5">Reply</div>
            <AdminReplyForm threadId={thread.id} />
          </div>
        )}
      </div>
    </>
  );
}

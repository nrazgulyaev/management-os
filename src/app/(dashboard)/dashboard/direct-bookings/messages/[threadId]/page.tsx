import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Direct bookings", href: "/dashboard/direct-bookings" },
          { label: "Messages", href: "/dashboard/direct-bookings/messages" },
          { label: threadId.slice(0, 8) },
        ]}
        title={`Thread · ${thread.status}`}
        description={
          thread.requestId
            ? `Linked to request ${thread.requestId.slice(0, 8)}`
            : thread.holdId
              ? `Linked to hold ${thread.holdId.slice(0, 8)}`
              : thread.bookingId
                ? `Linked to booking ${thread.bookingId.slice(0, 8)}`
                : "Standalone thread"
        }
        actions={
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
        }
      />
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
      <Section eyebrow="Conversation" title={`${messages.length} message${messages.length === 1 ? "" : "s"}`}>
        {messages.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No messages yet.
          </p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {messages.map((m) => (
              <li key={m.id} className="px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                  <Badge
                    tone={
                      m.authorType === "staff"
                        ? "accent"
                        : m.authorType === "system"
                          ? "neutral"
                          : "info"
                    }
                  >
                    {m.authorType}
                  </Badge>
                  <span>
                    {m.createdAt instanceof Date
                      ? m.createdAt.toISOString().slice(0, 16).replace("T", " ")
                      : (m.createdAt as unknown as string)}
                  </span>
                  {m.visibility === "internal_only" && (
                    <Badge tone="warning">internal only</Badge>
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
      </Section>
      {thread.status === "open" && (
        <Section eyebrow="Reply" title="Send a message">
          <AdminReplyForm threadId={thread.id} />
        </Section>
      )}
    </div>
  );
}

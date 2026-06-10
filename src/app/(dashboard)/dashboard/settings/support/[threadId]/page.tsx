/**
 * PLATFORM SUPPORT INBOX — org-side thread view (migration 0165).
 *
 * Transcript + reply for ONE of the org's own threads. Org-scoped lookup:
 * a thread id from another tenant 404s.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { appUsers } from "@/lib/db/schema/identity";
import { supportThreads, supportMessages } from "@/lib/db/schema/support";
import { STATUS_TONE, PRIORITY_TONE, fmtDateTime } from "../support-ui";
import { ReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Support thread · Settings" };
export const dynamic = "force-dynamic";

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();

  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Support thread" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the support inbox."
        />
      </div>
    );
  }

  const organizationId = await requireOrgId();

  const [thread] = await db
    .select()
    .from(supportThreads)
    .where(
      and(
        eq(supportThreads.id, threadId),
        eq(supportThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!thread) notFound();

  const messages = await db
    .select({
      id: supportMessages.id,
      authorSide: supportMessages.authorSide,
      body: supportMessages.body,
      createdAt: supportMessages.createdAt,
      authorName: appUsers.fullName,
    })
    .from(supportMessages)
    .leftJoin(appUsers, eq(appUsers.id, supportMessages.authorUserId))
    .where(eq(supportMessages.threadId, thread.id))
    .orderBy(asc(supportMessages.createdAt));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Support", href: "/dashboard/settings/support" },
          { label: "Thread" },
        ]}
        eyebrow="Settings · platform support"
        title={thread.subject}
        description={`Opened ${fmtDateTime(thread.createdAt)}${
          thread.closedAt ? ` · closed ${fmtDateTime(thread.closedAt)}` : ""
        }`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[thread.status] ?? "neutral"}>
              {thread.status}
            </Badge>
            <Badge tone={PRIORITY_TONE[thread.priority] ?? "neutral"}>
              {thread.priority}
            </Badge>
          </div>
        }
      />

      <div className="flex flex-col gap-3 max-w-3xl">
        {messages.map((m) => {
          const platform = m.authorSide === "platform";
          return (
            <div
              key={m.id}
              className={`rounded-lg border p-4 ${
                platform
                  ? "border-line-soft bg-muted"
                  : "border-line-soft bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-[12px] font-medium text-ink">
                  {platform
                    ? `Arconique support${m.authorName ? ` · ${m.authorName}` : ""}`
                    : (m.authorName ?? "Your team")}
                </span>
                <span className="text-[11px] text-ink-tertiary font-mono">
                  {fmtDateTime(m.createdAt)}
                </span>
              </div>
              <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
                {m.body}
              </p>
            </div>
          );
        })}
      </div>

      <div className="max-w-3xl">
        {thread.status === "closed" ? (
          <p className="text-sm text-ink-tertiary border border-line-soft rounded-lg p-4">
            This thread is closed. Start a new thread from the{" "}
            <Link
              href="/dashboard/settings/support"
              className="underline hover:text-ink"
            >
              support page
            </Link>{" "}
            if you need more help.
          </p>
        ) : (
          <ReplyForm threadId={thread.id} threadStatus={thread.status} />
        )}
      </div>
    </div>
  );
}

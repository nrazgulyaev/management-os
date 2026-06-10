/**
 * PLATFORM SUPPORT INBOX — operator-side thread view (migration 0165).
 *
 * Full transcript of one customer thread + platform reply + lifecycle
 * controls (mark pending / close / reopen). Super-admin gated by the
 * (platform-app) layout; the write actions re-check.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { organizations } from "@/lib/db/schema/saas";
import { supportThreads, supportMessages } from "@/lib/db/schema/support";
import {
  STATUS_TONE,
  PRIORITY_TONE,
  fmtDateTime,
  fmtAge,
} from "@/app/(dashboard)/dashboard/settings/support/support-ui";
import { ThreadControls } from "./thread-controls";

export const metadata: Metadata = {
  title: "Support thread · Platform Admin OS",
};
export const dynamic = "force-dynamic";

export default async function PlatformSupportThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();

  const db = getDb();
  if (!db) {
    return (
      <div className="max-w-[1000px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
        <PageHeader title="Support thread" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the support inbox."
        />
      </div>
    );
  }

  const [thread] = await db
    .select({
      id: supportThreads.id,
      subject: supportThreads.subject,
      status: supportThreads.status,
      priority: supportThreads.priority,
      createdAt: supportThreads.createdAt,
      closedAt: supportThreads.closedAt,
      orgName: organizations.name,
      orgCode: organizations.organizationCode,
    })
    .from(supportThreads)
    .innerJoin(organizations, eq(organizations.id, supportThreads.organizationId))
    .where(eq(supportThreads.id, threadId))
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
    <div className="max-w-[1000px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Support", href: "/platform/support" },
          { label: "Thread" },
        ]}
        eyebrow={`${thread.orgName} · ${thread.orgCode}`}
        title={thread.subject}
        description={`Opened ${fmtDateTime(thread.createdAt)} · age ${fmtAge(
          thread.createdAt,
        )}${thread.closedAt ? ` · closed ${fmtDateTime(thread.closedAt)}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[thread.status] ?? "neutral"}>
              {thread.status}
            </Badge>
            <Badge tone={PRIORITY_TONE[thread.priority] ?? "neutral"}>
              {thread.priority}
            </Badge>
            <Link
              href={`/platform/${thread.orgCode}`}
              className="text-sm text-ink-tertiary hover:text-ink transition-colors"
            >
              Org console →
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-3">
        {messages.map((m) => {
          const platform = m.authorSide === "platform";
          return (
            <div
              key={m.id}
              className={`rounded-lg border p-4 ${
                platform
                  ? "border-accent/30 bg-muted"
                  : "border-line-soft bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-[12px] font-medium text-ink">
                  {platform
                    ? `Platform${m.authorName ? ` · ${m.authorName}` : ""}`
                    : `${thread.orgName}${m.authorName ? ` · ${m.authorName}` : ""}`}
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

      <ThreadControls threadId={thread.id} status={thread.status} />
    </div>
  );
}

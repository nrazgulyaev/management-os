/**
 * PLATFORM SUPPORT INBOX — org side (migration 0165).
 *
 * The org's own support threads with the platform team: new-thread form +
 * org-scoped thread list. Counterpart of the operator inbox at
 * /platform/support.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq, inArray } from "drizzle-orm";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { supportThreads, supportMessages } from "@/lib/db/schema/support";
import { NewThreadForm } from "./new-thread-form";
import {
  STATUS_TONE,
  PRIORITY_TONE,
  fmtDateTime,
  relTime,
} from "./support-ui";

export const metadata: Metadata = { title: "Support · Settings" };
export const dynamic = "force-dynamic";

/** Map the shared support-ui legacy Badge tones onto HandoffBadge tones. */
const HANDOFF_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | "soft" | "amber"
> = {
  success: "ok",
  info: "info",
  warning: "warn",
  danger: "danger",
  accent: "info",
  neutral: "soft",
};

export default async function SupportSettingsPage() {
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <div className="page-header">
          <div className="left">
            <h1>Support</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Reach the Arconique platform team.
            </p>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use the support inbox."
        />
      </div>
    );
  }

  const organizationId = await requireOrgId();

  const threads = await db
    .select()
    .from(supportThreads)
    .where(eq(supportThreads.organizationId, organizationId))
    .orderBy(desc(supportThreads.updatedAt));

  const messageCounts = new Map<string, number>();
  if (threads.length > 0) {
    const counts = await db
      .select({ threadId: supportMessages.threadId, n: count() })
      .from(supportMessages)
      .where(
        inArray(
          supportMessages.threadId,
          threads.map((t) => t.id),
        ),
      )
      .groupBy(supportMessages.threadId);
    for (const c of counts) messageCounts.set(c.threadId, Number(c.n));
  }

  const openCount = threads.filter((t) => t.status !== "closed").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/settings">Settings</Link> /{" "}
            <span>Support</span>
          </div>
          <h1>Support</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Reach the Arconique platform team. Replies land right here — no email
            required.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">New thread</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Describe the problem in one thread per topic. Urgent = production
          blocked.
        </p>
        <Card padding="default">
          <NewThreadForm />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Your threads</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          {openCount > 0
            ? `${openCount} awaiting resolution. "Pending" means the platform team replied and is waiting on you.`
            : "Everything resolved."}
        </p>
        {threads.length === 0 ? (
          <EmptyState
            title="No support threads yet"
            description="Open the first one above — the platform team answers in this workspace."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Subject</TH>
                <TH>Status</TH>
                <TH>Priority</TH>
                <TH>Messages</TH>
                <TH>Opened</TH>
                <TH>Last activity</TH>
              </TR>
            </THead>
            <TBody>
              {threads.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link
                      href={`/dashboard/settings/support/${t.id}`}
                      className="text-ink font-medium hover:text-accent transition-colors"
                    >
                      {t.subject}
                    </Link>
                  </TD>
                  <TD>
                    <HandoffBadge
                      tone={HANDOFF_TONE[STATUS_TONE[t.status] ?? "neutral"]}
                    >
                      {t.status}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    <HandoffBadge
                      tone={HANDOFF_TONE[PRIORITY_TONE[t.priority] ?? "neutral"]}
                    >
                      {t.priority}
                    </HandoffBadge>
                  </TD>
                  <TD className="tabular-nums">
                    {messageCounts.get(t.id) ?? 0}
                  </TD>
                  <TD className="text-ink-secondary text-sm">
                    {fmtDateTime(t.createdAt)}
                  </TD>
                  <TD className="text-ink-secondary text-sm">
                    {relTime(t.updatedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

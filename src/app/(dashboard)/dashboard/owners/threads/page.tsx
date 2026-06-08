import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { canManageEntity } from "@/features/auth/permissions";
import { isAiConfigured, isAiDryRun } from "@/lib/env";
import { listOwnerThreadsForMgmt } from "@/features/owner-portal/mgmt-threads";
import {
  OwnerThreadsWorkspace,
  type OwnerThreadRow,
} from "./_owner-threads-workspace";

/**
 * W2 owner-concierge — MGMT-side owner inbox.
 *
 * Staff surface for the two-way owner_threads / owner_messages conversations
 * that previously only had an owner-facing view (/owner/inbox). Staff can open
 * a thread, reply as Management, set status, and generate a real-LLM AI draft
 * grounded in the owner's statement / payout / villa context (HITL — never
 * auto-sends; the owner-concierge agent itself is still a route='human' stub).
 */

export const metadata = { title: "Owner inbox" };
export const dynamic = "force-dynamic";

export default async function OwnerThreadsPage() {
  if (!(await canManageEntity("owner"))) {
    return (
      <>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/dashboard">Dashboard</Link> /{" "}
              <Link href="/dashboard/owners">Owners</Link> / <span>Inbox</span>
            </div>
            <h1>Owner inbox</h1>
          </div>
        </div>
        <p className="text-[13px] text-ink-3">
          You do not have permission to manage owner conversations.
        </p>
      </>
    );
  }

  const threads = await listOwnerThreadsForMgmt(100).catch(() => []);

  const rows: OwnerThreadRow[] = threads.map((t) => ({
    id: t.id,
    ownerId: t.ownerId,
    ownerName: t.ownerName,
    kind: t.kind,
    subject: t.subject,
    status: t.status,
    unreadCount: t.unreadCount,
    lastMessageAt: t.lastMessageAt,
    lastActorKind: t.lastActorKind,
    preview: t.preview,
    messageCount: t.messageCount,
  }));

  const openCount = rows.filter((t) => t.status === "open").length;
  const disputeCount = rows.filter((t) => t.kind === "dispute").length;
  const needsReplyCount = rows.filter(
    (t) => t.lastActorKind === "owner" || t.unreadCount > 0,
  ).length;
  const aiReady = isAiConfigured() && !isAiDryRun();

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/owners">Owners</Link> / <span>Inbox</span>
          </div>
          <h1>Owner inbox</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[720px]">
            Two-way conversations with owners. Reply as Management, set a thread
            status, or use{" "}
            <strong>AI draft</strong> to generate a grounded reply from the
            owner&apos;s statement / payout / villa context for you to review
            before sending.
          </p>
        </div>
        <div className="actions">
          <span
            className={`label ${aiReady ? "label-amber" : ""}`}
            title={
              aiReady
                ? "AI drafts are live (Anthropic configured)."
                : "AI drafts unavailable — set ANTHROPIC_API_KEY and AI_DRY_RUN=0 to enable. You can still reply manually."
            }
          >
            AI draft · {aiReady ? "ready" : "off"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Threads"
          value={rows.length > 0 ? String(rows.length) : "—"}
          sub="all owners"
        />
        <Kpi
          label="Open"
          value={openCount > 0 ? String(openCount) : "—"}
          sub={openCount > 0 ? "in progress" : "all clear"}
          tone={openCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Awaiting reply"
          value={needsReplyCount > 0 ? String(needsReplyCount) : "—"}
          sub={needsReplyCount > 0 ? "owner spoke last" : "none waiting"}
          tone={needsReplyCount > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Disputes"
          value={disputeCount > 0 ? String(disputeCount) : "—"}
          sub="kind = dispute"
          tone={disputeCount > 0 ? "accent" : undefined}
        />
      </div>

      <OwnerThreadsWorkspace threads={rows} />
    </>
  );
}

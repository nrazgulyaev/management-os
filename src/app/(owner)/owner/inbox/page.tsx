import Link from "next/link";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { NoItemsYet } from "@/components/ui/primitives";
import { OwnerInboxRowActions } from "@/components/owner/inbox-actions";
import {
  countUnreadInboxForCurrentOwner,
  listInAppNotificationsForCurrentOwner,
} from "@/features/notifications/services";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import {
  listOwnerThreads,
  getOwnerThreadDetail,
} from "@/features/owner-portal/get-threads";
import { ThreadReplyForm } from "@/components/owner/thread-reply-form";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const THREAD_KIND_LABEL: Record<string, string> = {
  dispute: "Dispute",
  general: "General",
  personal_stay_request: "Personal stay",
  maintenance_question: "Maintenance",
  tax_question: "Tax",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  other: "Other",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUSES = ["unread", "read", "archived"] as const;

const STATUS_TONES: Record<string, "neutral" | "warning" | "info" | "success" | "danger"> = {
  unread: "warning",
  read: "neutral",
  archived: "neutral",
};

const PRIORITY_TONES: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

export default async function OwnerInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: "unread" | "read" | "archived";
    thread?: string;
  }>;
}) {
  const sp = await searchParams;
  const owner = await getCurrentOwnerContext();

  // 3 base reads (≤4 → Promise.all is fine per the >4 mapPool rule); the
  // selected-thread detail is fetched conditionally after.
  const [rows, unreadCount, threads] = await Promise.all([
    listInAppNotificationsForCurrentOwner({ status: sp.status, limit: 200 }),
    countUnreadInboxForCurrentOwner(),
    owner ? listOwnerThreads(owner.ownerId).catch(() => []) : Promise.resolve([]),
  ]);

  const selectedThread =
    owner && sp.thread
      ? await getOwnerThreadDetail(sp.thread, owner.ownerId).catch(() => null)
      : null;

  const canReply = !!owner && !owner.isImpersonating;

  return (
    <>
      <SectionHeading
        eyebrow="Portfolio · inbox"
        title="Your inbox"
        subtitle="Conversations with our team plus statement summaries, payout updates, and ops notes for your villas."
      />

      {/* Conversations — two-way threads (owner_threads) */}
      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Conversations
      </h2>
      {threads.length === 0 ? (
        <Card style={{ padding: 24, marginBottom: 28 }}>
          <NoItemsYet
            entityLabel="conversations"
            description="When you raise a statement dispute or our team opens a thread, the conversation appears here."
          />
        </Card>
      ) : (
        <div
          className="grid gap-4 mb-7"
          style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)" }}
        >
          {/* Thread list */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <ul className="divide-y divide-line-soft">
              {threads.map((t) => {
                const active = selectedThread?.id === t.id;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/owner/inbox?thread=${t.id}`}
                      className={
                        "flex flex-col gap-1 px-4 py-3 transition-colors " +
                        (active ? "bg-muted" : "hover:bg-muted")
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={t.kind === "dispute" ? "warning" : "neutral"}>
                          {THREAD_KIND_LABEL[t.kind] ?? t.kind}
                        </Badge>
                        <span className="text-[13px] font-medium text-ink truncate">
                          {t.subject}
                        </span>
                        {t.unreadCount > 0 && (
                          <span className="ml-auto w-2 h-2 rounded-full bg-terra shrink-0" aria-label="unread" />
                        )}
                      </div>
                      {t.preview && (
                        <span className="text-xs text-ink-tertiary truncate">{t.preview}</span>
                      )}
                      <span className="mono text-[10px] text-ink-tertiary">
                        {fmtWhen(t.lastMessageAt)} · {t.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Thread detail */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {!selectedThread ? (
              <div className="p-6 text-sm text-ink-tertiary italic">
                Select a conversation to read and reply.
              </div>
            ) : (
              <div className="flex flex-col" style={{ minHeight: 280 }}>
                <div className="px-5 py-4 border-b border-line-soft">
                  <div className="text-[13px] font-medium text-ink">
                    {selectedThread.subject}
                  </div>
                  <div className="mono text-[10px] text-ink-tertiary mt-0.5">
                    {THREAD_KIND_LABEL[selectedThread.kind] ?? selectedThread.kind} · {selectedThread.status}
                  </div>
                </div>
                <div className="flex flex-col gap-3 p-5 flex-1">
                  {selectedThread.messages.length === 0 ? (
                    <p className="text-sm text-ink-tertiary italic">No messages yet.</p>
                  ) : (
                    selectedThread.messages.map((m) => {
                      const mine = m.actorKind === "owner";
                      return (
                        <div
                          key={m.id}
                          className={"flex flex-col gap-0.5 " + (mine ? "items-end" : "items-start")}
                        >
                          <div
                            className={
                              "max-w-[85%] rounded-lg px-3 py-2 text-sm " +
                              (mine
                                ? "bg-ink text-ink-inverse"
                                : "bg-muted text-ink border border-line-soft")
                            }
                          >
                            {m.body}
                          </div>
                          <span className="mono text-[10px] text-ink-tertiary">
                            {m.actorName} · {fmtWhen(m.sentAt)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="px-5 py-4 border-t border-line-soft">
                  {canReply ? (
                    <ThreadReplyForm threadId={selectedThread.id} />
                  ) : (
                    <p className="text-xs text-ink-tertiary italic m-0">
                      {owner?.isImpersonating
                        ? "Replying is disabled while viewing as this owner."
                        : "Sign in as the owner to reply."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Unread" value={String(unreadCount)} tone={unreadCount > 0 ? "accent" : undefined} />
        <Kpi label="Visible" value={String(rows.length)} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        <FilterPill label="All" href="/owner/inbox" active={!sp.status} />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={s}
            href={`/owner/inbox?status=${s}`}
            active={sp.status === s}
          />
        ))}
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Notifications
      </h2>
      {rows.length === 0 ? (
        <Card style={{ padding: 24 }}>
          <NoItemsYet
            entityLabel="notifications"
            description="Your inbox is empty. Statement publishes, distribution declarations, and stay-request decisions land here when they happen."
          />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`p-4 flex items-start justify-between gap-4 ${
                  r.status === "unread" ? "bg-accent-weak/20" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                    <Badge tone={PRIORITY_TONES[r.priority] ?? "neutral"}>{r.priority}</Badge>
                    <span className="text-[11px] text-ink-tertiary tabular-nums">
                      {r.createdAt.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-sm text-ink font-medium mt-2">{r.title}</div>
                  <div className="text-xs text-ink-secondary mt-1 whitespace-pre-line">
                    {r.body}
                  </div>
                </div>
                <OwnerInboxRowActions id={r.id} status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full border ${
        active
          ? "bg-ink text-ink-inverse border-ink"
          : "border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {label}
    </Link>
  );
}

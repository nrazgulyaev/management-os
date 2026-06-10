import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { InboxRowActions } from "@/components/notifications/inbox-actions";
import {
  countUnreadForCurrentUser,
  listInAppNotificationsForCurrentUser,
} from "@/features/notifications/services";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const STATUSES = ["unread", "read", "archived"] as const;

const STATUS_BADGES: Record<string, string> = {
  unread: "badge-warn",
  read: "badge-soft",
  archived: "badge-soft",
};

const PRIORITY_BADGES: Record<string, string> = {
  low: "badge-soft",
  normal: "badge-info",
  high: "badge-warn",
  urgent: "badge-danger",
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "unread" | "read" | "archived" }>;
}) {
  const sp = await searchParams;
  const [rows, unreadCount] = await Promise.all([
    listInAppNotificationsForCurrentUser({ status: sp.status, limit: 200 }),
    countUnreadForCurrentUser(),
  ]);

  const urgentVisible = rows.filter(
    (r) => r.priority === "urgent" || r.priority === "high",
  ).length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/notifications">Notifications</Link> /{" "}
            <span>Inbox</span>
          </div>
          <h1>Your inbox</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            In-app notifications addressed to you. Email / SMS / WhatsApp ship
            through Resend / Twilio when those provider env vars are
            configured.
          </p>
        </div>
        <div className="actions">
          {/* DAILY-DIGEST-SPRINT-1 P4.5 — pointer to the parallel digest
              inbox. The two systems are intentionally separate today
              (DIGEST-INBOX-UNIFY-1 backlog item). */}
          <Link href="/dashboard/digests" className="btn btn-secondary btn-sm">
            Daily digests →
          </Link>
        </div>
      </div>

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-[18px]">
        <Kpi
          label="Unread"
          value={String(unreadCount)}
          tone={unreadCount > 0 ? "accent" : undefined}
        />
        <Kpi label="Visible" value={String(rows.length)} sub="in view" />
        <Kpi
          label="High / urgent"
          value={String(urgentVisible)}
          tone={urgentVisible > 0 ? "warn" : undefined}
          sub="in view"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-[14px]">
        <FilterPill
          label="All"
          href="/dashboard/notifications/inbox"
          active={!sp.status}
        />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={s}
            href={`/dashboard/notifications/inbox?status=${s}`}
            active={sp.status === s}
          />
        ))}
      </div>

      <Card padding="none" overflowHidden>
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-ink-3 m-0">
            Your inbox is empty. Notifications arrive when actions you
            triggered complete or when system events fire — check the{" "}
            <Link
              href="/dashboard/notifications/deliveries"
              className="underline"
            >
              Deliveries
            </Link>{" "}
            tab for failed sends.
          </p>
        ) : (
          <ul className="m-0 p-0 list-none divide-y divide-line-soft">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`p-4 flex items-start justify-between gap-4 ${
                  r.status === "unread" ? "bg-accent-weak/20" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`badge ${STATUS_BADGES[r.status] ?? "badge-soft"}`}
                    >
                      {r.status}
                    </span>
                    <span
                      className={`badge ${PRIORITY_BADGES[r.priority] ?? "badge-soft"}`}
                    >
                      {r.priority}
                    </span>
                    <span className="mono text-[11px] text-ink-4 tabular-nums">
                      {r.createdAt.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-[13.5px] text-ink mt-2">{r.title}</div>
                  <div className="text-[12px] text-ink-3 mt-1 whitespace-pre-line leading-relaxed">
                    {r.body}
                  </div>
                </div>
                <InboxRowActions id={r.id} status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
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
    <Link href={href} className={active ? "filter-chip on" : "filter-chip"}>
      {label}
    </Link>
  );
}

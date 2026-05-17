import Link from "next/link";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { NoItemsYet } from "@/components/ui/primitives";
import { OwnerInboxRowActions } from "@/components/owner/inbox-actions";
import {
  countUnreadInboxForCurrentOwner,
  listInAppNotificationsForCurrentOwner,
} from "@/features/notifications/services";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ status?: "unread" | "read" | "archived" }>;
}) {
  const sp = await searchParams;
  const [rows, unreadCount] = await Promise.all([
    listInAppNotificationsForCurrentOwner({ status: sp.status, limit: 200 }),
    countUnreadInboxForCurrentOwner(),
  ]);

  return (
    <>
      <SectionHeading
        eyebrow="Portfolio · inbox"
        title="Your inbox"
        subtitle="Statement summaries, payout updates, and ops notes addressed to your villas. Email reminders are sent only when external delivery is configured for your account."
      />

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

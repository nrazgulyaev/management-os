import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import type { DigestListRow } from "@/features/digests/queries";

/**
 * DAILY-DIGEST-SPRINT-1 P4.2 — shared digest list view.
 *
 * Used by /dashboard/digests (Mgmt OS). Each route's page.tsx
 * provides the OS-specific shell + back-link target via `basePath`.
 *
 * Redesigned (mgmt-p3 "Availability & Intelligence" cluster) to the
 * agent-digest feed: a `.section-heading`, a 4-up KPI strip, an
 * All/Unread filter, and the `.dig-feed` card list — forest-iconned
 * cards with unread rows lifted onto cream-warm.
 */

export interface DigestListViewProps {
  digests: DigestListRow[];
  totalCount: number;
  unreadCount: number;
  /**
   * Active filter — controls the tab highlight + applies to the URL.
   * `null` = "All", `"unread"` = unread only.
   */
  filter: "all" | "unread";
  /** OS-specific URL prefix, e.g. "/dashboard/digests". Used to build
   *  detail-page links + the filter tab URLs. */
  basePath: string;
}

const TYPE_TONE: Record<string, "ok" | "warn" | "danger" | "ink"> = {
  digest: "ok",
  alert: "warn",
  info: "ink",
};

/** Newest-first relative stamp matching the mock's "today 07:00"
 *  cadence — recent rows read as a clock time, older as a date. */
function digestStamp(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  const time = then.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return `today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate();
  if (isYesterday) return `yest ${time}`;
  return (
    then.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    ` ${time}`
  );
}

export function DigestListView({
  digests,
  totalCount,
  unreadCount,
  filter,
  basePath,
}: DigestListViewProps) {
  return (
    <>
      <SectionHeading
        eyebrow="Intelligence · agent digests"
        title={
          <>
            Your <em>morning brief</em>.
          </>
        }
        subtitle="End-of-day and morning digests from the agent team, written to your notifications. Newest first; unread highlighted."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={basePath}
              className={`chip${filter === "all" ? " chip-active" : ""}`}
            >
              All
            </Link>
            <Link
              href={`${basePath}?filter=unread`}
              className={`chip${filter === "unread" ? " chip-active" : ""}`}
            >
              Unread
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi
          label="Unread"
          value={String(unreadCount)}
          sub="across all agents"
          tone={unreadCount > 0 ? "accent" : undefined}
        />
        <Kpi label="Total" value={String(totalCount)} sub="digests" />
        <Kpi
          label="Read"
          value={String(Math.max(0, totalCount - unreadCount))}
          sub="cleared"
          tone={totalCount - unreadCount > 0 ? "success" : undefined}
        />
        <Kpi label="Next brief" value="07:00" sub="daily-digest cron" />
      </div>

      {digests.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-[13px] text-ink-3 m-0">
            {filter === "unread"
              ? "Nothing unread."
              : "Your daily digest will appear here each morning."}
          </p>
        </Card>
      ) : (
        <div className="dig-feed">
          {digests.map((d) => {
            const unread = !d.readAt;
            return (
              <Link
                key={d.id}
                href={`${basePath}/${d.id}`}
                className={`dig-card ${unread ? "is-unread" : "is-read"}`}
              >
                <span className="dig-ico" aria-hidden>
                  {unread ? "✦" : "○"}
                </span>
                <div className="dig-body">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="dig-t">{d.title}</span>
                    <HandoffBadge tone={TYPE_TONE[d.type] ?? "ink"}>
                      {d.type}
                    </HandoffBadge>
                  </div>
                  <div className="dig-m line-clamp-2">{d.bodyPreview}</div>
                  <div className="dig-d">{digestStamp(d.createdAt)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { Inbox } from "lucide-react";
import { SectionHeading, Card, Badge } from "@/components/dashboard/primitives";
import type { DigestListRow } from "@/features/digests/queries";

/**
 * DAILY-DIGEST-SPRINT-1 P4.2 — shared digest list view.
 *
 * Used by both /dashboard/digests and /development-os/digests so the
 * UX stays identical (same user sees the same notifications regardless
 * of which OS they're in). Each route's page.tsx provides the OS-
 * specific shell + back-link target.
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
  /** OS-specific URL prefix, e.g. "/dashboard/digests" or
   *  "/development-os/digests". Used to build detail-page links + the
   *  filter tab URLs. */
  basePath: string;
}

const TYPE_TONE: Record<string, "ok" | "warn" | "danger" | "ink"> = {
  digest: "ok",
  alert: "warn",
  info: "ink",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(1, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
}

export function DigestListView({
  digests,
  totalCount,
  unreadCount,
  filter,
  basePath,
}: DigestListViewProps) {
  return (
    <div className="mx-auto max-w-4xl w-full px-6 py-8 flex flex-col gap-6">
      <SectionHeading
        eyebrow="Inbox"
        title="Daily digests"
        subtitle={
          totalCount === 0
            ? "Your daily digest will appear here each morning."
            : `${totalCount} digest${totalCount === 1 ? "" : "s"} · ${unreadCount} unread`
        }
      />

      <nav className="flex items-center gap-1 border-b border-line-soft">
        <Link
          href={basePath}
          aria-current={filter === "all" ? "page" : undefined}
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${
            filter === "all"
              ? "border-ink text-ink"
              : "border-transparent text-ink-tertiary hover:text-ink"
          }`}
        >
          All ({totalCount})
        </Link>
        <Link
          href={`${basePath}?filter=unread`}
          aria-current={filter === "unread" ? "page" : undefined}
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${
            filter === "unread"
              ? "border-ink text-ink"
              : "border-transparent text-ink-tertiary hover:text-ink"
          }`}
        >
          Unread ({unreadCount})
        </Link>
      </nav>

      {digests.length === 0 ? (
        <Card style={{ padding: 48, textAlign: "center" }}>
          <Inbox
            className="w-8 h-8 mx-auto text-ink-tertiary mb-3"
            strokeWidth={1.5}
          />
          <p className="text-sm text-ink-tertiary">
            {filter === "unread"
              ? "Nothing unread."
              : "Your daily digest will appear here each morning."}
          </p>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <ul className="divide-y divide-line-soft">
            {digests.map((d) => (
              <li
                key={d.id}
                className={d.readAt ? "" : "bg-muted/30"}
              >
                <Link
                  href={`${basePath}/${d.id}`}
                  className="block px-5 py-4 hover:bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    {!d.readAt && (
                      <span
                        className="w-2 h-2 rounded-full bg-ink mt-2 shrink-0"
                        aria-label="unread"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm ${d.readAt ? "text-ink-secondary" : "text-ink font-medium"} truncate`}
                        >
                          {d.title}
                        </span>
                        <Badge tone={TYPE_TONE[d.type] ?? "ink"}>{d.type}</Badge>
                        <span className="text-[11px] text-ink-tertiary">
                          {timeAgo(d.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-tertiary mt-1 line-clamp-2 break-words">
                        {d.bodyPreview}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

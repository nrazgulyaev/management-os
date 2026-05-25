import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { listRecentDigestsForTile } from "@/features/digests/queries";

/**
 * DAILY-DIGEST-SPRINT-1 P4.4 — "Recent digests" tile for both OS
 * dashboards. Server component; renders the user's last 3 digests
 * + "View all →" link to the per-OS digest list.
 */
export async function RecentDigestsTile({
  basePath,
}: {
  basePath: string;
}) {
  const digests = await listRecentDigestsForTile(3);

  return (
    <Card style={{ padding: 20 }}>
      <div className="flex items-center justify-between mb-3">
        <h3
          className="display"
          style={{ fontSize: 16, fontWeight: 500 }}
        >
          Recent digests
        </h3>
        <Link
          href={basePath}
          className="text-xs text-ink-tertiary hover:text-ink"
        >
          View all →
        </Link>
      </div>

      {digests.length === 0 ? (
        <div className="py-6 text-center">
          <Inbox
            className="w-6 h-6 mx-auto text-ink-tertiary mb-2"
            strokeWidth={1.5}
          />
          <p className="text-xs text-ink-tertiary">
            Your daily digest will appear here each morning.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft -mx-2">
          {digests.map((d) => (
            <li key={d.id}>
              <Link
                href={`${basePath}/${d.id}`}
                className="block px-2 py-2 hover:bg-muted/40 rounded-sm"
              >
                <div className="flex items-center gap-2">
                  {!d.readAt && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-ink shrink-0"
                      aria-label="unread"
                    />
                  )}
                  <span
                    className={`text-sm ${d.readAt ? "text-ink-secondary" : "text-ink font-medium"} truncate flex-1`}
                  >
                    {d.title}
                  </span>
                  <span className="text-[10px] text-ink-tertiary shrink-0">
                    {timeAgoShort(d.createdAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function timeAgoShort(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

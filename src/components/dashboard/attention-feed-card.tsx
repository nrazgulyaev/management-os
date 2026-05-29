import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import type {
  AttentionFeed,
  AttentionSeverity,
  AttentionSource,
} from "@/features/dashboard/attention-feed";

const SEV_DOT: Record<AttentionSeverity, string> = {
  critical: "var(--terra)",
  high: "var(--gold)",
  medium: "var(--ink-3)",
};

const SEV_LABEL: Record<AttentionSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Review",
};

const SOURCE_LABEL: Record<AttentionSource, string> = {
  statement: "Finance",
  sla_breach: "Operations",
  owner_stay: "Owner stays",
  channel_conflict: "Channels",
  capital_call: "Capital",
};

/**
 * Overview "needs your attention" band — the cross-cabinet action queue
 * (phase-2a PR 2). Purely presentational; data from `getAttentionFeed()`.
 */
export function AttentionFeedCard({ feed }: { feed: AttentionFeed }) {
  return (
    <Card padding="none" overflowHidden>
      <div className="px-5 py-4 flex items-center gap-3 border-b border-line-soft">
        <h2 className="display-md">Needs your attention</h2>
        {feed.total > 0 ? (
          <div className="flex items-center gap-2 ml-auto text-[11px]">
            {feed.counts.critical > 0 && (
              <span className="num" style={{ color: "var(--terra)" }}>
                {feed.counts.critical} critical
              </span>
            )}
            {feed.counts.high > 0 && (
              <span className="num text-ink-3">{feed.counts.high} high</span>
            )}
            <span className="mono text-ink-4">{feed.total} total</span>
          </div>
        ) : (
          <span className="mono ml-auto text-[11px] text-ink-3">ALL CLEAR</span>
        )}
      </div>

      {feed.items.length === 0 ? (
        <p className="p-5 text-[13px] text-ink-3 italic m-0">
          Nothing needs your attention right now — no disputes, SLA breaches,
          pending owner-stay requests, channel conflicts, or unpaid capital
          calls.
        </p>
      ) : (
        <ul className="clean">
          {feed.items.map((item) => (
            <li key={item.key} className="border-b border-line-soft last:border-0">
              <Link
                href={item.href}
                className="flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: SEV_DOT[item.severity] }}
                  title={SEV_LABEL[item.severity]}
                  aria-label={SEV_LABEL[item.severity]}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">
                    {item.title}
                  </div>
                  <div className="text-[11.5px] text-ink-3 truncate">
                    {item.detail}
                  </div>
                </div>
                <span className="badge text-[9px] shrink-0">
                  {SOURCE_LABEL[item.source]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

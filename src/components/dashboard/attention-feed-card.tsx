import Link from "next/link";
import type {
  AttentionFeed,
  AttentionSeverity,
  AttentionSource,
} from "@/features/dashboard/attention-feed";

/** Maps severity → the `.attn-card` urgency edge class (workspace.css). */
const SEV_CLASS: Record<AttentionSeverity, string> = {
  critical: "is-critical",
  high: "is-high",
  medium: "is-medium",
};

/** Glyph rendered in the card's icon tile — one per source, mirroring the
 *  mockup's `!` / `$` / `⏱` / `⌕` / `★` cabinet symbols. */
const SOURCE_GLYPH: Record<AttentionSource, string> = {
  statement: "$",
  sla_breach: "!",
  owner_stay: "⌕",
  channel_conflict: "⇄",
  capital_call: "$",
};

const SOURCE_LABEL: Record<AttentionSource, string> = {
  statement: "Finance",
  sla_breach: "Operations",
  owner_stay: "Owner stays",
  channel_conflict: "Channels",
  capital_call: "Capital",
};

/**
 * Overview "needs attention" feed — the cross-cabinet, urgency-sorted action
 * queue (mgmt-workspace.html §02). Each item renders as an `.attn-card` with
 * a severity-coloured left edge (critical → danger, high → warn, medium →
 * terra), an icon tile, title + meta, source tag and a drill arrow.
 * Purely presentational; data from `getAttentionFeed()`.
 */
export function AttentionFeedCard({ feed }: { feed: AttentionFeed }) {
  return (
    <section aria-label="Needs attention">
      <div className="flex items-baseline gap-2.5 mb-3">
        <h2 className="display-md">
          {feed.total > 0 ? (
            <>
              <em>
                {feed.total} {feed.total === 1 ? "item" : "items"}
              </em>{" "}
              need attention
            </>
          ) : (
            "Needs attention"
          )}
        </h2>
        {feed.total > 0 ? (
          <span className="mono ml-auto text-[10.5px] text-ink-3">
            {feed.counts.critical > 0
              ? `${feed.counts.critical} critical`
              : `${feed.total} open`}
          </span>
        ) : (
          <span className="mono ml-auto text-[10.5px] text-ink-3">
            ALL CLEAR
          </span>
        )}
      </div>

      {feed.items.length === 0 ? (
        <p className="card px-5 py-4 text-[13px] text-ink-3 italic m-0">
          Nothing needs your attention right now — no disputes, SLA breaches,
          pending owner-stay requests, channel conflicts, or unpaid capital
          calls.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {feed.items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`attn-card ${SEV_CLASS[item.severity]}`}
            >
              <span className="attn-ico" aria-hidden>
                {SOURCE_GLYPH[item.source]}
              </span>
              <span className="attn-body">
                <span className="attn-ti">{item.title}</span>
                <span className="attn-meta">
                  <span>{SOURCE_LABEL[item.source]}</span>
                  <span className="sep">·</span>
                  <span className="truncate">{item.detail}</span>
                </span>
              </span>
              <span className="attn-arrow" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

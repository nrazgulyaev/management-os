import { AttentionFeedCard } from "@/components/dashboard/attention-feed-card";
import { getAttentionFeed } from "@/features/dashboard/attention-feed";

/**
 * Async server sub-component for the Overview attention feed.
 *
 * Lives behind a <Suspense> boundary on /dashboard (Layer 2 of the
 * "a hung source never blocks the page" guarantee — Layer 1 is the
 * per-source deadline inside getAttentionFeed). Because this is its own
 * async component, the page shell (KPIs, today, portfolio) streams
 * immediately and the feed streams in when ready; the feed's data fetch
 * is NOT part of the page's awaited render path, so it can never stall
 * the page or the post-login redirect to /dashboard.
 */
export async function AttentionFeedSection() {
  const feed = await getAttentionFeed();
  return <AttentionFeedCard feed={feed} />;
}

/** Skeleton shown while the feed streams (matches the attn-card layout). */
export function AttentionFeedSkeleton() {
  return (
    <section aria-label="Needs attention" aria-busy>
      <div className="flex items-baseline gap-2.5 mb-3">
        <h2 className="display-md">Needs attention</h2>
        <span className="mono ml-auto text-[10.5px] text-ink-3">LOADING…</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="attn-card is-medium">
            <span className="attn-ico bg-muted" aria-hidden />
            <span className="attn-body">
              <span className="h-3 w-2/3 rounded bg-muted animate-pulse" />
              <span className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
            </span>
            <span className="attn-arrow" aria-hidden>
              →
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

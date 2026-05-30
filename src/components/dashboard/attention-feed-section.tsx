import { Card } from "@/components/dashboard/primitives";
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

/** Skeleton shown while the feed streams (matches the card's outer shell). */
export function AttentionFeedSkeleton() {
  return (
    <Card padding="none" overflowHidden>
      <div className="px-5 py-4 flex items-center gap-3 border-b border-line-soft">
        <h2 className="display-md">Needs your attention</h2>
        <span className="mono ml-auto text-[11px] text-ink-3">LOADING…</span>
      </div>
      <div className="p-5 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-muted shrink-0" />
            <div className="flex-1 h-3 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </Card>
  );
}

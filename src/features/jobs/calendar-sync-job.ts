import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channelCalendarFeeds } from "@/lib/db/schema/integrations";
import { syncCalendarFeed } from "@/features/integrations/calendar-sync/actions";
import { recordAuditEvent } from "@/features/audit/services";
import type { JobOutcome, JobRunHandle } from "./runner";

export interface CalendarSyncJobOptions {
  respectFeedInterval?: boolean;
}

/**
 * Walk every active feed and call `syncCalendarFeed`. Per-feed failures
 * never throw — they are captured into the metrics so a single bad URL
 * still lets the others sync.
 */
export async function runCalendarSyncJob(
  handle: JobRunHandle,
  options: CalendarSyncJobOptions = {},
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { feedsChecked: 0 },
      error: "DB unavailable",
    };
  }

  const respectInterval = options.respectFeedInterval !== false;
  const now = Date.now();

  const feeds = await db
    .select()
    .from(channelCalendarFeeds)
    .where(eq(channelCalendarFeeds.status, "active"));

  let feedsChecked = 0;
  let feedsSynced = 0;
  let feedsSkipped = 0;
  let feedsFailed = 0;
  let eventsUpserted = 0;
  let conflictsCreated = 0;
  const errors: { feedId: string; error: string }[] = [];

  for (const feed of feeds) {
    feedsChecked++;
    if (respectInterval && feed.lastSuccessAt) {
      const minSinceSuccess = (now - feed.lastSuccessAt.getTime()) / 60_000;
      if (minSinceSuccess < feed.syncIntervalMinutes) {
        feedsSkipped++;
        await handle.event("info", `Skipping feed ${feed.feedName} (within sync interval)`, {
          feedId: feed.id,
          minSinceSuccess: Math.round(minSinceSuccess),
          syncIntervalMinutes: feed.syncIntervalMinutes,
        });
        continue;
      }
    }

    try {
      const result = await syncCalendarFeed(feed.id);
      if (result.error) {
        feedsFailed++;
        errors.push({ feedId: feed.id, error: result.error });
        await handle.event("error", `Feed ${feed.feedName} failed: ${result.error}`, {
          feedId: feed.id,
        });
        continue;
      }
      feedsSynced++;
      eventsUpserted += result.inserted + result.updated;
      conflictsCreated += result.conflicts;
      await handle.event("info", `Synced feed ${feed.feedName}`, {
        feedId: feed.id,
        fetched: result.fetched,
        inserted: result.inserted,
        updated: result.updated,
        cancelled: result.cancelled,
        conflicts: result.conflicts,
      });
    } catch (e) {
      feedsFailed++;
      const message = e instanceof Error ? e.message : "unknown error";
      errors.push({ feedId: feed.id, error: message });
      await handle.event("error", `Feed ${feed.feedName} threw: ${message}`, {
        feedId: feed.id,
      });
    }
  }

  await recordAuditEvent({
    actorUserId: null,
    action: "bookings.sync.cron",
    entityType: "channel_calendar_feed",
    entityId: handle.id,
    after: { feedsChecked, feedsSynced, feedsSkipped, feedsFailed, conflictsCreated },
  });

  const status =
    feedsFailed > 0 && feedsSynced > 0
      ? "partial_success"
      : feedsFailed > 0 && feedsSynced === 0
        ? "failed"
        : "success";

  return {
    status,
    summary: `Checked ${feedsChecked} · synced ${feedsSynced} · skipped ${feedsSkipped} · failed ${feedsFailed}`,
    metrics: {
      feedsChecked,
      feedsSynced,
      feedsSkipped,
      feedsFailed,
      eventsUpserted,
      conflictsCreated,
      errors,
    },
    error: feedsFailed > 0 ? `${feedsFailed} feed(s) failed` : undefined,
  };
}

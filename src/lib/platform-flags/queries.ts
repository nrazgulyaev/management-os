import "server-only";

/**
 * Platform-admin feature-flags cabinet — read side.
 *
 * Reads the existing `feature_flags` catalog (migration 0085) extended
 * with the operational lifecycle columns from migration 0129
 * (lifecycle_status / rollout_percent / owner). Returns null-safe rows
 * for the /platform/feature-flags index. getDb() may return null in demo
 * mode — every query guards it and returns an empty list.
 */

import { asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { featureFlags } from "@/lib/db/schema/subscriptions";

/** Derived lifecycle bucket surfaced in the UI. */
export type FlagBucket = "ga" | "beta" | "internal" | "kill" | "archived";

export interface FeatureFlagRow {
  id: string;
  flagCode: string;
  category: string;
  displayName: string;
  description: string | null;
  owner: string | null;
  lifecycleStatus: string;
  rolloutPercent: number;
  isActive: boolean;
  /** Display bucket: "kill" when inactive, otherwise the lifecycle stage. */
  bucket: FlagBucket;
  createdAt: Date;
  updatedAt: Date;
}

/** Killed flags (is_active=false) always bucket as "kill" regardless of stage. */
function bucketOf(lifecycleStatus: string, isActive: boolean): FlagBucket {
  if (!isActive) return "kill";
  if (lifecycleStatus === "ga") return "ga";
  if (lifecycleStatus === "beta") return "beta";
  if (lifecycleStatus === "archived") return "archived";
  return "internal";
}

export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: featureFlags.id,
      flagCode: featureFlags.flagCode,
      category: featureFlags.category,
      displayName: featureFlags.displayName,
      description: featureFlags.description,
      owner: featureFlags.owner,
      lifecycleStatus: featureFlags.lifecycleStatus,
      rolloutPercent: featureFlags.rolloutPercent,
      isActive: featureFlags.isActive,
      createdAt: featureFlags.createdAt,
      updatedAt: featureFlags.updatedAt,
    })
    .from(featureFlags)
    .orderBy(asc(featureFlags.category), desc(featureFlags.updatedAt));

  return rows.map((r) => ({
    ...r,
    bucket: bucketOf(r.lifecycleStatus, r.isActive),
  }));
}

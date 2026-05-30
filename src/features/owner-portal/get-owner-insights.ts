import "server-only";

import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerInsights } from "@/lib/db/schema/owner-insights";

/**
 * Active (non-dismissed) owner insights for the Owner Portal home
 * "What needs you" block. The owner-intelligence agent (daily 05:00)
 * is the writer; this is a read.
 */

export type OwnerInsightLevel = "info" | "watch" | "act";

export interface OwnerInsightView {
  id: string;
  kind: string;
  level: OwnerInsightLevel;
  /** Short headline pulled from payload (falls back to a kind label). */
  title: string;
  /** Optional one-line detail from payload. */
  detail: string | null;
  firedAt: string;
}

const KIND_LABEL: Record<string, string> = {
  occupancy_trend: "Occupancy trend",
  adr_trend: "ADR trend",
  maintenance_cost: "Maintenance cost",
  guest_satisfaction: "Guest satisfaction",
  renewal_window: "Renewal window",
  contract_milestone: "Contract milestone",
  other: "Insight",
};

/** Level ordering for ranking: act first, then watch, then info. */
const LEVEL_RANK: Record<OwnerInsightLevel, number> = { act: 0, watch: 1, info: 2 };

function pickString(payload: unknown, keys: string[]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function getActiveOwnerInsights(
  ownerId: string,
  limit = 5,
): Promise<OwnerInsightView[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: ownerInsights.id,
      kind: ownerInsights.kind,
      level: ownerInsights.level,
      payload: ownerInsights.payload,
      firedAt: ownerInsights.firedAt,
    })
    .from(ownerInsights)
    .where(and(eq(ownerInsights.ownerId, ownerId), isNull(ownerInsights.dismissedAt)))
    .orderBy(desc(ownerInsights.firedAt))
    .limit(40);

  const mapped = rows.map((r) => {
    const level = (["info", "watch", "act"].includes(r.level) ? r.level : "info") as OwnerInsightLevel;
    return {
      id: r.id,
      kind: r.kind,
      level,
      title:
        pickString(r.payload, ["title", "headline", "summary"]) ??
        KIND_LABEL[r.kind] ??
        "Insight",
      detail: pickString(r.payload, ["detail", "message", "recommendation", "action"]),
      firedAt: r.firedAt instanceof Date ? r.firedAt.toISOString() : String(r.firedAt),
    };
  });

  mapped.sort((a, b) => {
    const rank = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (rank !== 0) return rank;
    return b.firedAt.localeCompare(a.firedAt);
  });

  return mapped.slice(0, limit);
}

/** Resolve hero photos for a set of villas in one query. Returns a map
 *  villaId → hero image URL (owner-visible only, lowest position wins).
 *  Used by the villas grid so each card can show its real hero. */
export async function getVillaHeroUrls(
  villaIds: string[],
): Promise<Record<string, string>> {
  const db = getDb();
  if (!db || villaIds.length === 0) return {};
  // Imported lazily to keep this module's import surface small.
  const { villaPhotos } = await import("@/lib/db/schema/villa-photos");
  const rows = await db
    .select({
      villaId: villaPhotos.villaId,
      url: villaPhotos.url,
      kind: villaPhotos.kind,
      position: villaPhotos.position,
    })
    .from(villaPhotos)
    .where(
      and(
        inArray(villaPhotos.villaId, villaIds),
        eq(villaPhotos.visibleToOwner, true),
      ),
    );

  // hero kind wins; then lowest position; first seen otherwise.
  const best: Record<string, { url: string; score: number }> = {};
  for (const r of rows) {
    const score = (r.kind === "hero" ? 0 : 1000) + (r.position ?? 0);
    const cur = best[r.villaId];
    if (!cur || score < cur.score) best[r.villaId] = { url: r.url, score };
  }
  const out: Record<string, string> = {};
  for (const [vid, v] of Object.entries(best)) out[vid] = v.url;
  return out;
}

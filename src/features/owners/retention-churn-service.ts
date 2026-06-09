import "server-only";

/**
 * Owner-CHURN drill-in — read side.
 *
 * Composes:
 *   - the score breakdown (pure `computeChurnScore` over the existing
 *     retention engine result)
 *   - a save-plan (pure `buildSavePlan`)
 *   - a signals timeline assembled from the owner's real statements
 *   - the intervention / insights feed, persisted in `owner_insights`
 *     (the dismissable, owner-scoped insights table — staff-fired rows
 *     are exactly what its schema comment anticipates). No new table.
 *
 * Intervention state lives in the `owner_insights.payload` jsonb under a
 * `churn` namespace so it never collides with the agent's future rows
 * and so a "started → resolved" lifecycle is queryable without a new
 * column (resolved == row dismissed with reason `acted`).
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerInsights } from "@/lib/db/schema/owner-insights";
import { listOwnerStatements } from "@/features/finance/services";
import { getOwnerRetentionRisk } from "./retention-risk-service";
import {
  buildSavePlan,
  computeChurnScore,
  INTERVENTION_LABEL,
  type ChurnScoreBreakdown,
  type InterventionKind,
  type SavePlanStep,
} from "./retention-churn";

/** Marker put on every churn-engine insight payload. */
export const CHURN_INSIGHT_SOURCE = "owner_churn";

export interface ChurnSignalEvent {
  id: string;
  /** ISO period start of the statement. */
  when: string;
  label: string;
  detail: string;
  tone: "neutral" | "warn" | "danger";
}

export interface InterventionFeedItem {
  id: string;
  /** "analysis" = a Run-analysis snapshot; otherwise an intervention. */
  kind: "analysis" | InterventionKind;
  title: string;
  detail: string | null;
  level: "info" | "watch" | "act";
  firedAt: string;
  /** Set when this intervention has been closed out. */
  resolvedAt: string | null;
  /** True when it can still be acted on (open intervention). */
  open: boolean;
}

export interface OwnerChurnView {
  breakdown: ChurnScoreBreakdown;
  savePlan: SavePlanStep[];
  signals: ChurnSignalEvent[];
  feed: InterventionFeedItem[];
}

function payloadObj(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Assemble the full churn view for one owner. `null` when no DB
 * (keeps the page render safe in demo mode).
 */
export async function getOwnerChurnView(
  ownerId: string,
  villaIds: string[],
): Promise<OwnerChurnView | null> {
  const db = getDb();
  if (!db) return null;

  const risk = await getOwnerRetentionRisk(ownerId, villaIds).catch(() => null);
  const breakdown = computeChurnScore(risk ?? { level: "ok", signals: [] });
  const savePlan = buildSavePlan(breakdown);

  // Signals timeline — newest statements, surfacing the same metrics the
  // engine reads (payout, occupancy, dispute state) as dated events.
  const statements = await listOwnerStatements({ ownerId });
  const recent = statements.slice(0, 8);
  const signals: ChurnSignalEvent[] = recent.map((s, i) => {
    const prev = recent[i + 1];
    const net = Number(s.netPayoutMinor);
    const prevNet = prev ? Number(prev.netPayoutMinor) : null;
    const driftPct =
      prevNet && prevNet > 0 ? Math.round(((net - prevNet) / prevNet) * 100) : null;
    const disputed = s.ownerState === "disputed" || s.ownerState === "superseded";

    let tone: ChurnSignalEvent["tone"] = "neutral";
    if (disputed) tone = "danger";
    else if (driftPct != null && driftPct <= -10) tone = "warn";

    const bits: string[] = [];
    if (driftPct != null) {
      bits.push(`payout ${driftPct >= 0 ? "+" : ""}${driftPct}% MoM`);
    }
    if (s.occupancyRate != null) {
      bits.push(`occ ${Math.round(s.occupancyRate)}%`);
    }
    if (disputed) bits.push(`statement ${s.ownerState}`);

    return {
      id: s.id,
      when: s.periodStart,
      label: s.statementCode ?? s.periodLabel,
      detail: bits.length ? bits.join(" · ") : "no notable change",
      tone,
    };
  });

  // Intervention / insights feed.
  const feed = await listChurnFeed(ownerId);

  return { breakdown, savePlan, signals, feed };
}

/** The churn insights + interventions feed for one owner (active first). */
export async function listChurnFeed(
  ownerId: string,
): Promise<InterventionFeedItem[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: ownerInsights.id,
      kind: ownerInsights.kind,
      level: ownerInsights.level,
      payload: ownerInsights.payload,
      firedAt: ownerInsights.firedAt,
      dismissedAt: ownerInsights.dismissedAt,
    })
    .from(ownerInsights)
    .where(eq(ownerInsights.ownerId, ownerId))
    .orderBy(desc(ownerInsights.firedAt))
    .limit(50);

  const out: InterventionFeedItem[] = [];
  for (const r of rows) {
    const p = payloadObj(r.payload);
    if (p.source !== CHURN_INSIGHT_SOURCE) continue;

    const churnKind = (str(p, "churnKind") ?? "analysis") as InterventionFeedItem["kind"];
    const isAnalysis = churnKind === "analysis";
    const title =
      str(p, "title") ??
      (isAnalysis
        ? "Churn analysis"
        : INTERVENTION_LABEL[churnKind as InterventionKind] ?? "Intervention");
    const level = (["info", "watch", "act"].includes(r.level) ? r.level : "info") as
      | "info"
      | "watch"
      | "act";
    const firedAt =
      r.firedAt instanceof Date ? r.firedAt.toISOString() : String(r.firedAt);
    const resolvedAt =
      r.dismissedAt instanceof Date
        ? r.dismissedAt.toISOString()
        : r.dismissedAt
          ? String(r.dismissedAt)
          : null;

    out.push({
      id: r.id,
      kind: churnKind,
      title,
      detail: str(p, "detail"),
      level,
      firedAt,
      resolvedAt,
      // Analyses are informational; interventions are "open" until resolved.
      open: !isAnalysis && !resolvedAt,
    });
  }
  return out;
}

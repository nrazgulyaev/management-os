/**
 * Stage 5.E — Marketing Intelligence tests.
 *
 * Coverage:
 *   - Migrations 0063 + 0064 + 0065 (shape + RLS + 14 lead source seeds)
 *   - Schema exports
 *   - Pure helpers:
 *     - attribution-helpers (5 models + ROI computation)
 *     - conversation-analysis-helpers (response time, missed followup, lost leads)
 *     - manager-performance-helpers (metrics aggregation)
 *     - content-actions (status transitions)
 *   - Cron + dispatcher + route audit (61 routes)
 *   - Sidebar audit (MARKETING group)
 *   - UI page presence (16 pages)
 *   - Demo seed audit (Stage 5.E section)
 *   - Architecture doc
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applyAttributionModel,
  computeChannelROI,
  type Touchpoint,
} from "../src/lib/development/server/marketing/attribution-helpers";
import {
  analyzeResponseTimes,
  detectMissedFollowups,
  detectLostLeadPattern,
  type ConversationMessage,
} from "../src/lib/development/server/marketing/conversation-analysis-helpers";
import { computeManagerMetrics } from "../src/lib/development/server/marketing/manager-performance-helpers";
import { isValidTransition } from "../src/lib/development/server/content/content-status-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0063 = "drizzle/0063_development_os_stage_5_e_1_marketing.sql";
const MIG_0064 = "drizzle/0064_development_os_stage_5_e_2_content.sql";
const MIG_0065 = "drizzle/0065_development_os_stage_5_e_3_conversation_review.sql";

function tp(source: string, daysAgoFromConv: number, type: Touchpoint["type"] = "click"): Touchpoint {
  return {
    source,
    timestamp: new Date(2026, 0, 31 - daysAgoFromConv),
    type,
  };
}

// ===========================================================================
// 1) Migration 0063 — shape
// ===========================================================================

test("migration 0063 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0063));
  const sql = read(MIG_0063);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0063 creates marketing_lead_sources (renamed to avoid 2.2.A collision)", () => {
  const sql = read(MIG_0063);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "marketing_lead_sources"/);
});

test("migration 0063 channel_type enum has 13 values", () => {
  const sql = read(MIG_0063);
  for (const c of [
    "paid_social", "paid_search", "organic_social", "organic_search",
    "referral", "direct", "email", "whatsapp", "event",
    "partner", "pr_media", "word_of_mouth", "other",
  ]) {
    assert.ok(sql.includes(`'${c}'`), `channel_type '${c}' missing`);
  }
});

test("migration 0063 attribution_model enum has 5 values", () => {
  const sql = read(MIG_0063);
  for (const m of [
    "first_touch", "last_touch", "linear", "time_decay", "position_based",
  ]) {
    assert.ok(sql.includes(`'${m}'`), `attribution model '${m}' missing`);
  }
});

test("migration 0063 seeds 14 default sources", () => {
  const sql = read(MIG_0063);
  for (const k of [
    "meta_ads", "google_ads", "instagram_organic", "tiktok_organic",
    "tiktok_ads", "youtube_organic", "seo_organic", "referral",
    "whatsapp_direct", "event_walkin", "partner_referral", "press_media",
    "email_campaign", "direct_unknown",
  ]) {
    assert.ok(sql.includes(`'${k}'`), `default source '${k}' missing`);
  }
});

test("migration 0063 ON CONFLICT idempotent seed", () => {
  const sql = read(MIG_0063);
  assert.match(sql, /ON CONFLICT \(source_key\) DO NOTHING/);
});

test("migration 0063 creates campaigns + 9 objectives", () => {
  const sql = read(MIG_0063);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "campaigns"/);
  for (const o of [
    "awareness", "lead_generation", "engagement", "conversion",
    "retention", "brand_building", "launch", "rebranding", "event_promotion",
  ]) {
    assert.ok(sql.includes(`'${o}'`), `objective '${o}' missing`);
  }
});

test("migration 0063 campaigns has 7 status values", () => {
  const sql = read(MIG_0063);
  for (const s of [
    "planned", "in_preparation", "active", "paused",
    "completed", "cancelled", "archived",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `campaign status '${s}' missing`);
  }
});

test("migration 0063 campaigns enforces period CHECK", () => {
  const sql = read(MIG_0063);
  assert.match(sql, /CHECK \("campaign_end" >= "campaign_start"\)/);
});

test("migration 0063 creates campaign_costs with 5 data sources", () => {
  const sql = read(MIG_0063);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "campaign_costs"/);
  for (const ds of [
    "manual_entry", "meta_api", "google_ads_api", "tiktok_ads_api", "imported_csv",
  ]) {
    assert.ok(sql.includes(`'${ds}'`), `data_source '${ds}' missing`);
  }
});

test("migration 0063 creates leads with 9 lifecycle status values", () => {
  const sql = read(MIG_0063);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "leads"/);
  for (const s of [
    "lead", "qualified", "hot", "reservation", "contract",
    "closed_won", "closed_lost", "on_hold", "archived",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `lead lifecycle '${s}' missing`);
  }
});

test("migration 0063 leads has UTM columns", () => {
  const sql = read(MIG_0063);
  for (const c of [
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  ]) {
    assert.ok(sql.includes(c), `UTM ${c} missing`);
  }
});

test("migration 0063 leads has 5 indexes", () => {
  const sql = read(MIG_0063);
  for (const idx of [
    "leads_source_idx", "leads_campaign_idx", "leads_status_idx",
    "leads_manager_idx", "leads_contact_idx",
  ]) {
    assert.ok(sql.includes(idx), `${idx} missing`);
  }
});

test("migration 0063 enables RLS + internal policies", () => {
  const sql = read(MIG_0063);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 2) Migration 0064 — content
// ===========================================================================

test("migration 0064 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0064));
  const sql = read(MIG_0064);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0064 creates content_pieces + content_variants", () => {
  const sql = read(MIG_0064);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "content_pieces"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "content_variants"/);
});

test("migration 0064 content_type enum has 17 values", () => {
  const sql = read(MIG_0064);
  for (const t of [
    "instagram_post", "instagram_reel", "instagram_story",
    "tiktok_video", "tiktok_carousel",
    "youtube_video", "youtube_short",
    "blog_article", "press_release",
    "email_newsletter", "email_campaign",
    "whatsapp_broadcast", "video_ad",
    "photo_ad", "static_post", "carousel_post", "other",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `content_type '${t}' missing`);
  }
});

test("migration 0064 status enum has 9 values", () => {
  const sql = read(MIG_0064);
  for (const s of [
    "draft", "in_production", "pending_review", "approved",
    "scheduled", "published", "paused", "archived", "rejected",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `status '${s}' missing`);
  }
});

test("migration 0064 has partial indexes for scheduled + published", () => {
  const sql = read(MIG_0064);
  assert.match(sql, /content_pieces_scheduled_idx[\s\S]*?WHERE "status" = 'scheduled'/);
  assert.match(sql, /content_pieces_published_idx[\s\S]*?WHERE "status" = 'published'/);
});

test("migration 0064 variant_type enum has 5 values", () => {
  const sql = read(MIG_0064);
  for (const v of ["language", "platform", "audience", "format", "a_b_test"]) {
    assert.ok(sql.includes(`'${v}'`), `variant_type '${v}' missing`);
  }
});

test("migration 0064 enables RLS + internal policies", () => {
  const sql = read(MIG_0064);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 3) Migration 0065 — conversation review
// ===========================================================================

test("migration 0065 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0065));
  const sql = read(MIG_0065);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0065 creates sales_conversation_threads + manager_performance_metrics", () => {
  const sql = read(MIG_0065);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "sales_conversation_threads"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "manager_performance_metrics"/);
});

test("migration 0065 outcome enum has 8 values", () => {
  const sql = read(MIG_0065);
  for (const o of [
    "reservation", "contract_signed", "lost_no_response",
    "lost_competitor", "lost_price", "lost_other",
    "still_active", "on_hold",
  ]) {
    assert.ok(sql.includes(`'${o}'`), `outcome '${o}' missing`);
  }
});

test("migration 0065 ai_analysis_status enum has 4 values", () => {
  const sql = read(MIG_0065);
  for (const s of ["not_analyzed", "analyzing", "analyzed", "analysis_failed"]) {
    assert.ok(sql.includes(`'${s}'`), `ai_analysis '${s}' missing`);
  }
});

test("migration 0065 has consent_to_analyze gate", () => {
  const sql = read(MIG_0065);
  assert.match(sql, /"consent_to_analyze" BOOLEAN NOT NULL DEFAULT FALSE/);
});

test("migration 0065 manager metrics has UNIQUE constraint", () => {
  const sql = read(MIG_0065);
  assert.match(
    sql,
    /UNIQUE \("manager_id", "period_start", "period_end", "period_type"\)/,
  );
});

test("migration 0065 manager metrics period_type enum", () => {
  const sql = read(MIG_0065);
  for (const t of ["weekly", "monthly", "quarterly"]) {
    assert.ok(sql.includes(`'${t}'`), `period_type '${t}' missing`);
  }
});

test("migration 0065 enables RLS + internal policies", () => {
  const sql = read(MIG_0065);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 4) Schema exports
// ===========================================================================

test("schema/index exports new marketing schema file", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/marketing"/);
});

test("marketing schema exports all 8 tables", async () => {
  const m = await import("../src/lib/db/schema/marketing");
  assert.ok(m.marketingLeadSources);
  assert.ok(m.campaigns);
  assert.ok(m.campaignCosts);
  assert.ok(m.leads);
  assert.ok(m.contentPieces);
  assert.ok(m.contentVariants);
  assert.ok(m.salesConversationThreads);
  assert.ok(m.managerPerformanceMetrics);
});

// ===========================================================================
// 5) Attribution — first_touch
// ===========================================================================

test("first_touch: 100% credit to first source", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("meta_ads", 10), tp("google_ads", 5), tp("instagram_organic", 1)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "first_touch",
  );
  assert.equal(r.attributedSources.length, 1);
  assert.equal(r.attributedSources[0].source, "meta_ads");
  assert.equal(r.attributedSources[0].fraction, 1);
});

test("first_touch: empty touchpoints → empty result", () => {
  const r = applyAttributionModel(
    { touchpoints: [], conversionTimestamp: new Date() },
    "first_touch",
  );
  assert.equal(r.attributedSources.length, 0);
});

test("first_touch: single touchpoint → 100% to it", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("meta_ads", 5)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "first_touch",
  );
  assert.equal(r.attributedSources[0].source, "meta_ads");
});

// ===========================================================================
// 6) Attribution — last_touch
// ===========================================================================

test("last_touch: 100% credit to last source", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("meta_ads", 10), tp("google_ads", 5), tp("instagram_organic", 1)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "last_touch",
  );
  assert.equal(r.attributedSources[0].source, "instagram_organic");
});

// ===========================================================================
// 7) Attribution — linear
// ===========================================================================

test("linear: equal split across all touchpoints", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("a", 10), tp("b", 5), tp("c", 1)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "linear",
  );
  for (const s of r.attributedSources) {
    assert.ok(Math.abs(s.fraction - 1 / 3) < 0.01);
  }
});

test("linear: aggregates same-source touchpoints", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("meta_ads", 10), tp("meta_ads", 5), tp("google_ads", 1)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "linear",
  );
  // Should have 2 unique sources, meta = 2/3, google = 1/3
  assert.equal(r.attributedSources.length, 2);
  const meta = r.attributedSources.find((s) => s.source === "meta_ads");
  assert.ok(meta && Math.abs(meta.fraction - 2 / 3) < 0.01);
});

// ===========================================================================
// 8) Attribution — time_decay
// ===========================================================================

test("time_decay: more recent touch gets more credit", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("old", 30), tp("recent", 1)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "time_decay",
  );
  const recent = r.attributedSources.find((s) => s.source === "recent")!;
  const old = r.attributedSources.find((s) => s.source === "old")!;
  assert.ok(recent.fraction > old.fraction);
});

test("time_decay: half-life ~ 7 days produces sensible decay", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("a", 0), tp("b", 7)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "time_decay",
  );
  const a = r.attributedSources.find((s) => s.source === "a")!;
  const b = r.attributedSources.find((s) => s.source === "b")!;
  // a is at conversion (weight 1), b is 7 days back (weight 0.5)
  assert.ok(a.fraction > b.fraction);
  assert.ok(Math.abs(a.fraction / b.fraction - 2) < 0.5);
});

// ===========================================================================
// 9) Attribution — position_based
// ===========================================================================

test("position_based: 1 touchpoint → 100% to it", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("only", 5)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "position_based",
  );
  assert.equal(r.attributedSources[0].fraction, 1);
});

test("position_based: 2 touchpoints → 50/50", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("a", 10), tp("b", 1)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "position_based",
  );
  assert.equal(r.attributedSources[0].fraction, 0.5);
  assert.equal(r.attributedSources[1].fraction, 0.5);
});

test("position_based: 4 touchpoints → 40/10/10/40", () => {
  const r = applyAttributionModel(
    {
      touchpoints: [tp("first", 30), tp("m1", 20), tp("m2", 10), tp("last", 1)],
      conversionTimestamp: new Date(2026, 0, 31),
    },
    "position_based",
  );
  const first = r.attributedSources.find((s) => s.source === "first")!;
  const last = r.attributedSources.find((s) => s.source === "last")!;
  assert.equal(first.fraction, 0.4);
  assert.equal(last.fraction, 0.4);
});

// ===========================================================================
// 10) Attribution determinism
// ===========================================================================

test("attribution: same input → same output (determinism)", () => {
  const input = {
    touchpoints: [tp("a", 10), tp("b", 5)],
    conversionTimestamp: new Date(2026, 0, 31),
  };
  const r1 = applyAttributionModel(input, "linear");
  const r2 = applyAttributionModel(input, "linear");
  assert.deepEqual(r1, r2);
});

test("attribution: total weight always 1 (modulo float)", () => {
  for (const model of [
    "first_touch", "last_touch", "linear", "time_decay", "position_based",
  ] as const) {
    const r = applyAttributionModel(
      {
        touchpoints: [tp("a", 10), tp("b", 5), tp("c", 2)],
        conversionTimestamp: new Date(2026, 0, 31),
      },
      model,
    );
    assert.ok(Math.abs(r.totalWeight - 1) < 0.001, `${model}: total = ${r.totalWeight}`);
  }
});

// ===========================================================================
// 11) Channel ROI
// ===========================================================================

test("computeChannelROI: empty inputs → zeros", () => {
  const r = computeChannelROI({
    channelCosts: new Map(),
    channelLeads: new Map(),
    channelConversions: new Map(),
    channelRevenue: new Map(),
  });
  assert.equal(r.totalCost, 0);
  assert.equal(r.perChannel.length, 0);
});

test("computeChannelROI: ROI multiple = revenue/cost", () => {
  const r = computeChannelROI({
    channelCosts: new Map([["meta", 1000]]),
    channelLeads: new Map([["meta", 100]]),
    channelConversions: new Map([["meta", 10]]),
    channelRevenue: new Map([["meta", 5000]]),
  });
  assert.equal(r.perChannel[0].roiMultiple, 5);
  assert.equal(r.perChannel[0].costPerLeadMinor, 10);
  assert.equal(r.perChannel[0].costPerConversionMinor, 100);
});

test("computeChannelROI: zero cost + revenue → Infinity ROI", () => {
  const r = computeChannelROI({
    channelCosts: new Map([["organic", 0]]),
    channelLeads: new Map([["organic", 50]]),
    channelConversions: new Map([["organic", 5]]),
    channelRevenue: new Map([["organic", 1000]]),
  });
  assert.equal(r.perChannel[0].roiMultiple, Infinity);
});

test("computeChannelROI: aggregates totals across channels", () => {
  const r = computeChannelROI({
    channelCosts: new Map([["meta", 100], ["google", 200]]),
    channelLeads: new Map([["meta", 10], ["google", 20]]),
    channelConversions: new Map([["meta", 1], ["google", 2]]),
    channelRevenue: new Map([["meta", 1000], ["google", 2000]]),
  });
  assert.equal(r.totalCost, 300);
  assert.equal(r.totalLeads, 30);
  assert.equal(r.totalRevenue, 3000);
});

// ===========================================================================
// 12) Conversation analysis — response times
// ===========================================================================

function msg(opts: {
  fromManager: boolean;
  minutesFromBase: number;
  channel?: ConversationMessage["channel"];
}): ConversationMessage {
  return {
    timestamp: new Date(2026, 0, 1, 10, opts.minutesFromBase),
    fromManager: opts.fromManager,
    channel: opts.channel ?? "whatsapp",
  };
}

test("analyzeResponseTimes: empty → all zero", () => {
  const r = analyzeResponseTimes([]);
  assert.equal(r.averageResponseMinutes, 0);
  assert.equal(r.unresponded, 0);
});

test("analyzeResponseTimes: single buyer + manager response → gap captured", () => {
  const r = analyzeResponseTimes([
    msg({ fromManager: false, minutesFromBase: 0 }),
    msg({ fromManager: true, minutesFromBase: 30 }),
  ]);
  assert.equal(r.averageResponseMinutes, 30);
  assert.equal(r.unresponded, 0);
});

test("analyzeResponseTimes: trailing buyer message → unresponded", () => {
  const r = analyzeResponseTimes([
    msg({ fromManager: false, minutesFromBase: 0 }),
    msg({ fromManager: true, minutesFromBase: 10 }),
    msg({ fromManager: false, minutesFromBase: 20 }),
  ]);
  assert.equal(r.unresponded, 1);
});

test("analyzeResponseTimes: median computed correctly", () => {
  const r = analyzeResponseTimes([
    msg({ fromManager: false, minutesFromBase: 0 }),
    msg({ fromManager: true, minutesFromBase: 5 }),
    msg({ fromManager: false, minutesFromBase: 10 }),
    msg({ fromManager: true, minutesFromBase: 70 }),
  ]);
  // Two responses: 5, 60; median = 32.5
  assert.equal(r.medianResponseMinutes, 32.5);
});

test("analyzeResponseTimes: longest response in hours", () => {
  const r = analyzeResponseTimes([
    msg({ fromManager: false, minutesFromBase: 0 }),
    msg({ fromManager: true, minutesFromBase: 120 }),
  ]);
  assert.equal(r.longestResponseHours, 2);
});

// ===========================================================================
// 13) Conversation analysis — missed followups
// ===========================================================================

test("detectMissedFollowups: under threshold → not missed", () => {
  const r = detectMissedFollowups({
    conversationLastMessageAt: new Date(Date.UTC(2026, 0, 1)),
    currentDate: new Date(Date.UTC(2026, 0, 3)),
    outcome: "still_active",
    thresholdDays: 5,
  });
  assert.equal(r.isMissedFollowup, false);
});

test("detectMissedFollowups: over threshold + active → missed", () => {
  const r = detectMissedFollowups({
    conversationLastMessageAt: new Date(Date.UTC(2026, 0, 1)),
    currentDate: new Date(Date.UTC(2026, 0, 10)),
    outcome: "still_active",
    thresholdDays: 5,
  });
  assert.equal(r.isMissedFollowup, true);
});

test("detectMissedFollowups: closed outcome → not missed", () => {
  const r = detectMissedFollowups({
    conversationLastMessageAt: new Date(Date.UTC(2026, 0, 1)),
    currentDate: new Date(Date.UTC(2026, 0, 30)),
    outcome: "contract_signed",
    thresholdDays: 5,
  });
  assert.equal(r.isMissedFollowup, false);
});

test("detectMissedFollowups: 4x threshold → critical severity", () => {
  const r = detectMissedFollowups({
    conversationLastMessageAt: new Date(Date.UTC(2026, 0, 1)),
    currentDate: new Date(Date.UTC(2026, 0, 25)),
    outcome: "still_active",
    thresholdDays: 5,
  });
  assert.equal(r.severity, "critical");
});

test("detectMissedFollowups: 2-4x threshold → moderate", () => {
  const r = detectMissedFollowups({
    conversationLastMessageAt: new Date(Date.UTC(2026, 0, 1)),
    currentDate: new Date(Date.UTC(2026, 0, 14)),
    outcome: "still_active",
    thresholdDays: 5,
  });
  assert.equal(r.severity, "moderate");
});

// ===========================================================================
// 14) Conversation analysis — lost lead pattern
// ===========================================================================

test("detectLostLeadPattern: empty → empty", () => {
  const r = detectLostLeadPattern([]);
  assert.equal(r.patternsByManager.size, 0);
});

test("detectLostLeadPattern: counts losses by source", () => {
  const r = detectLostLeadPattern([
    {
      managerId: "m1",
      source: "meta_ads",
      outcome: "lost_no_response",
      conversationStartAt: new Date(2026, 0, 1),
      outcomeRecordedAt: new Date(2026, 0, 5),
    },
    {
      managerId: "m1",
      source: "meta_ads",
      outcome: "lost_competitor",
      conversationStartAt: new Date(2026, 0, 1),
      outcomeRecordedAt: new Date(2026, 0, 10),
    },
  ]);
  assert.equal(r.overallPatterns.lostBySource["meta_ads"], 2);
});

test("detectLostLeadPattern: ignores non-lost outcomes", () => {
  const r = detectLostLeadPattern([
    {
      managerId: "m1",
      source: "meta_ads",
      outcome: "contract_signed",
      conversationStartAt: new Date(),
      outcomeRecordedAt: new Date(),
    },
  ]);
  assert.equal(Object.keys(r.overallPatterns.lostBySource).length, 0);
});

test("detectLostLeadPattern: per-manager rollup", () => {
  const r = detectLostLeadPattern([
    {
      managerId: "m1",
      source: "meta_ads",
      outcome: "lost_other",
      conversationStartAt: new Date(2026, 0, 1),
      outcomeRecordedAt: new Date(2026, 0, 5),
    },
    {
      managerId: "m2",
      source: "google_ads",
      outcome: "lost_price",
      conversationStartAt: new Date(2026, 0, 1),
      outcomeRecordedAt: new Date(2026, 0, 5),
    },
  ]);
  assert.equal(r.patternsByManager.get("m1")?.lostCount, 1);
  assert.equal(r.patternsByManager.get("m2")?.lostCount, 1);
});

// ===========================================================================
// 15) Manager performance helpers
// ===========================================================================

test("computeManagerMetrics: empty → zero conversion rates", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 0,
    conversations: [],
  });
  assert.equal(r.leadToReservationRate, 0);
  assert.equal(r.reservationToContractRate, 0);
});

test("computeManagerMetrics: lead→reservation rate", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 10,
    conversations: [
      {
        conversationMessages: [
          msg({ fromManager: false, minutesFromBase: 0 }),
          msg({ fromManager: true, minutesFromBase: 30 }),
        ],
        outcome: "reservation",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
    ],
  });
  assert.equal(r.leadToReservationRate, 10);
  assert.equal(r.reservationsSecured, 1);
});

test("computeManagerMetrics: contracts → reservation→contract rate", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 10,
    conversations: [
      {
        conversationMessages: [],
        outcome: "reservation",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
      {
        conversationMessages: [],
        outcome: "contract_signed",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
    ],
  });
  // 1 reservation, 1 contract → rate = 100%
  assert.equal(r.reservationToContractRate, 100);
});

test("computeManagerMetrics: counts all 4 lost outcomes as lost", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 10,
    conversations: [
      {
        conversationMessages: [],
        outcome: "lost_no_response",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
      {
        conversationMessages: [],
        outcome: "lost_competitor",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
      {
        conversationMessages: [],
        outcome: "lost_price",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
      {
        conversationMessages: [],
        outcome: "lost_other",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
    ],
  });
  assert.equal(r.leadsLost, 4);
});

test("computeManagerMetrics: AI quality score in 0-100", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 10,
    conversations: [
      {
        conversationMessages: [
          msg({ fromManager: false, minutesFromBase: 0 }),
          msg({ fromManager: true, minutesFromBase: 5 }),
        ],
        outcome: "reservation",
        isStillActive: false,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
    ],
  });
  assert.ok(r.aiQualityScore >= 0 && r.aiQualityScore <= 100);
});

test("computeManagerMetrics: still active conversations counted", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 5,
    conversations: [
      {
        conversationMessages: [],
        outcome: "still_active",
        isStillActive: true,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
      {
        conversationMessages: [],
        outcome: "still_active",
        isStillActive: true,
        isFlagged: false,
        missedFollowupsHere: 0,
      },
    ],
  });
  assert.equal(r.totalConversationsActive, 2);
});

test("computeManagerMetrics: flagged conversations counted", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 5,
    conversations: [
      {
        conversationMessages: [],
        outcome: null,
        isStillActive: true,
        isFlagged: true,
        missedFollowupsHere: 0,
      },
    ],
  });
  assert.equal(r.flaggedConversationsCount, 1);
});

test("computeManagerMetrics: missed follow-ups summed", () => {
  const r = computeManagerMetrics({
    totalLeadsAssigned: 5,
    conversations: [
      {
        conversationMessages: [],
        outcome: null,
        isStillActive: true,
        isFlagged: false,
        missedFollowupsHere: 3,
      },
      {
        conversationMessages: [],
        outcome: null,
        isStillActive: true,
        isFlagged: false,
        missedFollowupsHere: 2,
      },
    ],
  });
  assert.equal(r.missedFollowupsCount, 5);
});

// ===========================================================================
// 16) Content workflow transitions
// ===========================================================================

test("isValidTransition: draft → in_production", () => {
  assert.equal(isValidTransition("draft", "in_production"), true);
});

test("isValidTransition: draft → published (illegal)", () => {
  assert.equal(isValidTransition("draft", "published"), false);
});

test("isValidTransition: pending_review → approved", () => {
  assert.equal(isValidTransition("pending_review", "approved"), true);
});

test("isValidTransition: pending_review → rejected", () => {
  assert.equal(isValidTransition("pending_review", "rejected"), true);
});

test("isValidTransition: scheduled → published", () => {
  assert.equal(isValidTransition("scheduled", "published"), true);
});

test("isValidTransition: published → paused", () => {
  assert.equal(isValidTransition("published", "paused"), true);
});

test("isValidTransition: archived has no outbound transitions", () => {
  for (const target of ["draft", "in_production", "published"]) {
    assert.equal(isValidTransition("archived", target), false);
  }
});

// ===========================================================================
// 17) Cron + dispatcher + route audit (61 routes)
// ===========================================================================

test("cron index re-exports 3 new Stage 5.E runners", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  assert.match(idx, /runDevOsContentPublishScheduler/);
  assert.match(idx, /runDevOsManagerPerformanceRecompute/);
  assert.match(idx, /runDevOsMissedFollowupDetector/);
});

test("cron index DEV_OS_JOB_KEYS includes 3 new keys", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  for (const k of [
    "dev_os_content_publish_scheduler",
    "dev_os_manager_performance_recompute",
    "dev_os_missed_followup_detector",
  ]) {
    assert.ok(idx.includes(`"${k}"`), `key '${k}' missing`);
  }
});

test("dispatcher KNOWN_JOBS includes 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const k of [
    "dev_os_content_publish_scheduler",
    "dev_os_manager_performance_recompute",
    "dev_os_missed_followup_detector",
  ]) {
    assert.ok(src.includes(`"${k}"`), `KNOWN_JOBS missing '${k}'`);
  }
});

test("dispatcher executeJob switch covers 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /case "dev_os_content_publish_scheduler":/);
  assert.match(src, /case "dev_os_manager_performance_recompute":/);
  assert.match(src, /case "dev_os_missed_followup_detector":/);
});

test("3 new HTTP cron route files exist", () => {
  for (const slug of [
    "dev-os-content-publish-scheduler",
    "dev-os-manager-performance-recompute",
    "dev-os-missed-followup-detector",
  ]) {
    assert.ok(
      exists(`src/app/api/cron/${slug}/route.ts`),
      `route file missing for ${slug}`,
    );
  }
});

test("VERCEL-CRON-CHECKLIST documents 3 new routes", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-content-publish-scheduler/);
  assert.match(md, /\/api\/cron\/dev-os-manager-performance-recompute/);
  assert.match(md, /\/api\/cron\/dev-os-missed-followup-detector/);
});

// ===========================================================================
// 18) Server module presence
// ===========================================================================

test("attribution-helpers file exists + pure (no server-only import)", () => {
  const src = read(
    "src/lib/development/server/marketing/attribution-helpers.ts",
  );
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
  assert.match(src, /export function applyAttributionModel/);
  assert.match(src, /export function computeChannelROI/);
});

test("conversation-analysis-helpers file exists + pure", () => {
  const src = read(
    "src/lib/development/server/marketing/conversation-analysis-helpers.ts",
  );
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
  assert.match(src, /export function analyzeResponseTimes/);
  assert.match(src, /export function detectMissedFollowups/);
  assert.match(src, /export function detectLostLeadPattern/);
});

test("manager-performance-helpers file exists + pure", () => {
  const src = read(
    "src/lib/development/server/marketing/manager-performance-helpers.ts",
  );
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
  assert.match(src, /export function computeManagerMetrics/);
});

test("conversation-actions enforces consent gate", () => {
  const src = read(
    "src/lib/development/server/conversation-review/conversation-actions.ts",
  );
  assert.match(src, /consent_to_analyze=true/);
});

test("content-status-helpers has VALID_TRANSITIONS table", () => {
  const src = read(
    "src/lib/development/server/content/content-status-helpers.ts",
  );
  assert.match(src, /VALID_TRANSITIONS/);
  assert.match(src, /isValidTransition/);
});

test("3 new cron job files exist", () => {
  for (const slug of [
    "content-publish-scheduler-job",
    "manager-performance-recompute-job",
    "missed-followup-detector-job",
  ]) {
    assert.ok(
      exists(`src/lib/development/server/cron/${slug}.ts`),
      `${slug}.ts missing`,
    );
  }
});

// ===========================================================================
// 19) Sidebar audit
// ===========================================================================

test("sidebar nav has Marketing group", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /label: "Marketing"/);
});

test("sidebar nav has 6 MARKETING entries", () => {
  const src = read("src/lib/development/navigation.ts");
  for (const href of [
    "/marketing/dashboard",
    "/marketing/lead-sources",
    "/marketing/campaigns",
    "/marketing/content",
    "/marketing/conversations",
    "/marketing/manager-performance",
  ]) {
    assert.ok(src.includes(href), `nav missing ${href}`);
  }
});

// ===========================================================================
// 20) UI page presence (16 pages)
// ===========================================================================

test("marketing dashboard page exists", () => {
  assert.ok(
    exists("src/app/(development-app)/development-os/marketing/dashboard/page.tsx"),
  );
});

test("lead sources pages exist (list + detail + new)", () => {
  for (const path of ["page.tsx", "[key]/page.tsx", "new/page.tsx"]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/marketing/lead-sources/${path}`),
      `lead-sources/${path} missing`,
    );
  }
});

test("campaigns pages exist (list + detail + costs + new)", () => {
  for (const path of [
    "page.tsx",
    "[code]/page.tsx",
    "[code]/costs/page.tsx",
    "new/page.tsx",
  ]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/marketing/campaigns/${path}`),
      `campaigns/${path} missing`,
    );
  }
});

test("content pages exist (kanban + detail + new + calendar)", () => {
  for (const path of [
    "page.tsx",
    "[code]/page.tsx",
    "new/page.tsx",
    "calendar/page.tsx",
  ]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/marketing/content/${path}`),
      `content/${path} missing`,
    );
  }
});

test("conversations pages exist (list + detail)", () => {
  for (const path of ["page.tsx", "[code]/page.tsx"]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/marketing/conversations/${path}`),
      `conversations/${path} missing`,
    );
  }
});

test("manager performance pages exist (list + detail)", () => {
  for (const path of ["page.tsx", "[managerId]/page.tsx"]) {
    assert.ok(
      exists(
        `src/app/(development-app)/development-os/marketing/manager-performance/${path}`,
      ),
      `manager-performance/${path} missing`,
    );
  }
});

// ===========================================================================
// 21) Demo seed audit
// ===========================================================================

test("seed script declares Stage 5.E section header", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.E seeding/);
});

test("seed script seeds campaigns + costs + leads + content + threads + manager perf", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO campaigns/);
  assert.match(seed, /INSERT INTO campaign_costs/);
  assert.match(seed, /INSERT INTO leads/);
  assert.match(seed, /INSERT INTO content_pieces/);
  assert.match(seed, /INSERT INTO sales_conversation_threads/);
  assert.match(seed, /INSERT INTO manager_performance_metrics/);
});

test("seed script idempotent — exists-check pattern present in 5.E section", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.E seeding[\s\S]*?if \(exists\[0\]\)/);
});

// ===========================================================================
// 22) Architecture documentation
// ===========================================================================

test("architecture doc references Stage 5.E", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.E/);
});

test("architecture doc Stage 5.D accepted", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.D[\s\S]*?\[ACCEPTED 5\.D\]/);
});

test("architecture doc Stage 5.E marker present (ACTIVE or ACCEPTED)", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.E[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.E\]/);
});

test("architecture doc explains marketing_lead_sources rename", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /marketing_lead_sources/);
});

test("architecture doc explains consent-gated AI analysis invariant", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Consent-gated/i);
});

test("architecture doc names all 5 attribution models", () => {
  const md = read("docs/development-os-architecture.md");
  for (const m of [
    "first_touch", "last_touch", "linear", "time_decay", "position_based",
  ]) {
    assert.ok(md.includes(m), `arch doc missing model ${m}`);
  }
});

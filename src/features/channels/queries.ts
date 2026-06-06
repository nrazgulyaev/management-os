/**
 * Phase 2.4 mgmt-01 — Channels cabinet data fns.
 *
 * Surface exposed to the routes:
 *   getChannelGridData    — villa × channel × date grid + stays
 *   pushRate              — manual edit, fans out to the channel
 *
 * Today returns empty / no-op. The data PR wires real reads
 * against the channels + rate_cells + sync_events + bookings tables.
 */

import "server-only";
import { asc, ne, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookingChannels } from "@/lib/db/schema/bookings";
import { villas } from "@/lib/db/schema/projects";
import { channelCalendarFeeds } from "@/lib/db/schema/integrations";
import type { ChannelGridVilla, ChannelGridChannel, RateCell, Stay } from "@/components/channels/channel-grid";

export interface ChannelCoverageRow {
  id: string;
  name: string;
  key: string;
  type: string;
  connectedCount: number;
}

export interface ChannelVillaCoverage {
  villaCount: number;
  channels: ChannelCoverageRow[];
}

/**
 * Per-villa connection coverage: for each non-archived channel, how many of the
 * active villas have a calendar feed wired (channel_calendar_feeds). Powers the
 * listing-matcher "connected / partial / not-connected" buckets.
 */
export async function getChannelVillaCoverage(): Promise<ChannelVillaCoverage> {
  const db = getDb();
  if (!db) return { villaCount: 0, channels: [] };

  const villaRows = await db
    .select({ id: villas.id })
    .from(villas)
    .where(notInArray(villas.status, ["archived", "out_of_service"]));
  const villaCount = villaRows.length;

  const chans = await db
    .select({
      id: bookingChannels.id,
      name: bookingChannels.name,
      key: bookingChannels.key,
      type: bookingChannels.type,
    })
    .from(bookingChannels)
    .where(ne(bookingChannels.status, "archived"))
    .orderBy(asc(bookingChannels.name));

  const feeds = await db
    .select({
      channelId: channelCalendarFeeds.bookingChannelId,
      villaId: channelCalendarFeeds.villaId,
    })
    .from(channelCalendarFeeds);

  const byChannel = new Map<string, Set<string>>();
  for (const f of feeds) {
    if (!f.channelId || !f.villaId) continue;
    const set = byChannel.get(f.channelId) ?? new Set<string>();
    set.add(f.villaId);
    byChannel.set(f.channelId, set);
  }

  return {
    villaCount,
    channels: chans.map((c) => ({
      ...c,
      connectedCount: byChannel.get(c.id)?.size ?? 0,
    })),
  };
}

export interface ChannelGridData {
  villas: ChannelGridVilla[];
  channels: ChannelGridChannel[];
  dates: Date[];
  cells: Record<string, RateCell>;
  stays: Stay[];
  kpis: { label: string; value: string; tone?: "ok" | "warn" | "danger" }[];
  recentEvents: { id: string; at: string; label: string }[];
  directFunnel: { stage: string; count: number }[];
}

export interface GetChannelGridDataInput {
  /** Default 14. */
  days?: number;
  /** Anchor for the date window (defaults to today). */
  anchor?: Date;
}

function buildDateWindow(anchor: Date, days: number): Date[] {
  const out: Date[] = [];
  const base = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    out.push(d);
  }
  return out;
}

export async function getChannelGridData(input: GetChannelGridDataInput = {}): Promise<ChannelGridData> {
  const days = input.days ?? 14;
  const anchor = input.anchor ?? new Date();
  return {
    villas: [],
    channels: [],
    dates: buildDateWindow(anchor, days),
    cells: {},
    stays: [],
    kpis: [],
    recentEvents: [],
    directFunnel: [],
  };
}

export interface PushRateInput {
  /** "${villaId}:${channelId}:${dateISO}" */
  key: string;
  amount: number;
  actorUserId: string;
}

export async function pushRate(_input: PushRateInput): Promise<{ ok: boolean; syncState: "pending" }> {
  return { ok: true, syncState: "pending" };
}

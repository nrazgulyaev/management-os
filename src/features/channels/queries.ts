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
import type { ChannelGridVilla, ChannelGridChannel, RateCell, Stay } from "@/components/channels/channel-grid";

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

import "server-only";

import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookingChannels } from "@/lib/db/schema/bookings";
import type { WithSource } from "@/features/types";

export interface ChannelRow {
  id: string;
  key: string;
  name: string;
  type: "ota" | "direct" | "agent" | "social" | "corporate";
  commissionModel: "percent" | "fixed" | "tiered" | "none" | null;
  defaultCommissionPct: number | null;
  status: "active" | "paused" | "archived";
}

const fallback: WithSource<ChannelRow>[] = [
  { source: "mock", id: "airbnb", key: "airbnb", name: "Airbnb", type: "ota", commissionModel: "percent", defaultCommissionPct: 3.0, status: "active" },
  { source: "mock", id: "booking", key: "booking", name: "Booking.com", type: "ota", commissionModel: "percent", defaultCommissionPct: 15.0, status: "active" },
  { source: "mock", id: "agoda", key: "agoda", name: "Agoda", type: "ota", commissionModel: "percent", defaultCommissionPct: 17.0, status: "active" },
  { source: "mock", id: "expedia", key: "expedia", name: "Expedia", type: "ota", commissionModel: "percent", defaultCommissionPct: 18.0, status: "active" },
  { source: "mock", id: "direct", key: "direct", name: "Direct", type: "direct", commissionModel: "none", defaultCommissionPct: 0, status: "active" },
  { source: "mock", id: "instagram_whatsapp", key: "instagram_whatsapp", name: "Instagram / WhatsApp", type: "social", commissionModel: "none", defaultCommissionPct: 0, status: "active" },
  { source: "mock", id: "agent", key: "agent", name: "Agent", type: "agent", commissionModel: "percent", defaultCommissionPct: 10.0, status: "active" },
];

export async function listBookingChannels(): Promise<WithSource<ChannelRow>[]> {
  const db = getDb();
  if (!db) return fallback;
  const rows = await db.select().from(bookingChannels).orderBy(asc(bookingChannels.name));
  return rows.map((r) => ({
    source: "db",
    id: r.id,
    key: r.key,
    name: r.name,
    type: r.type as ChannelRow["type"],
    commissionModel: r.commissionModel as ChannelRow["commissionModel"],
    defaultCommissionPct: r.defaultCommissionPct === null ? null : Number(r.defaultCommissionPct),
    status: r.status as ChannelRow["status"],
  }));
}

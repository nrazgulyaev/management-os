import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings, bookingChannels, guests } from "@/lib/db/schema/bookings";
import { villas } from "@/lib/db/schema/projects";
import type { WithSource } from "@/features/types";

export interface BookingListRow {
  id: string;
  bookingCode: string;
  villaId: string;
  villaCode: string;
  guestName: string;
  channelKey: string | null;
  channelName: string | null;
  status:
    | "inquiry"
    | "tentative"
    | "confirmed"
    | "checked_in"
    | "checked_out"
    | "cancelled"
    | "no_show";
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  grossAmount: number;
  cleaningFeeAmount: number;
  channelFeeAmount: number;
  paymentFeeAmount: number;
  netExpectedAmount: number | null;
}

const fallback: WithSource<BookingListRow>[] = [
  {
    source: "mock",
    id: "b1", bookingCode: "ARC-A-00241",
    villaId: "es-s5", villaCode: "ES-S5", guestName: "A. Martin",
    channelKey: "airbnb", channelName: "Airbnb", status: "confirmed",
    checkIn: "2026-04-26", checkOut: "2026-04-30", nights: 4,
    currency: "USD", grossAmount: 3280, cleaningFeeAmount: 180,
    channelFeeAmount: 98.4, paymentFeeAmount: 95.13, netExpectedAmount: null,
  },
  {
    source: "mock",
    id: "b2", bookingCode: "ARC-A-00239",
    villaId: "ev-07", villaCode: "EV-07", guestName: "H. Williams",
    channelKey: "booking", channelName: "Booking.com", status: "confirmed",
    checkIn: "2026-04-25", checkOut: "2026-04-30", nights: 5,
    currency: "USD", grossAmount: 3600, cleaningFeeAmount: 180,
    channelFeeAmount: 540, paymentFeeAmount: 104.4, netExpectedAmount: null,
  },
  {
    source: "mock",
    id: "b3", bookingCode: "ARC-A-00238",
    villaId: "es-s2", villaCode: "ES-S2", guestName: "Family Nielsen",
    channelKey: "direct", channelName: "Direct", status: "confirmed",
    checkIn: "2026-04-25", checkOut: "2026-05-01", nights: 6,
    currency: "USD", grossAmount: 3660, cleaningFeeAmount: 180,
    channelFeeAmount: 0, paymentFeeAmount: 106.14, netExpectedAmount: null,
  },
  {
    source: "mock",
    id: "b4", bookingCode: "ARC-A-00235",
    villaId: "ah-02", villaCode: "AH-02", guestName: "Mr. Tanaka",
    channelKey: "booking", channelName: "Booking.com", status: "checked_in",
    checkIn: "2026-04-22", checkOut: "2026-04-26", nights: 4,
    currency: "USD", grossAmount: 3040, cleaningFeeAmount: 180,
    channelFeeAmount: 91.2, paymentFeeAmount: 88.16, netExpectedAmount: null,
  },
];

function n(v: string | null) { return v === null ? null : Number(v); }

export async function listBookings(): Promise<WithSource<BookingListRow>[]> {
  const db = getDb();
  if (!db) return fallback;

  const rows = await db
    .select({
      b: bookings,
      villaCode: villas.unitCode,
      channelKey: bookingChannels.key,
      channelName: bookingChannels.name,
      guestName: guests.fullName,
    })
    .from(bookings)
    .innerJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .orderBy(desc(bookings.checkIn));

  return rows.map((r) => ({
    source: "db",
    id: r.b.id,
    bookingCode: r.b.bookingCode,
    villaId: r.b.villaId,
    villaCode: r.villaCode,
    guestName: r.guestName ?? "—",
    channelKey: r.channelKey ?? null,
    channelName: r.channelName ?? null,
    status: r.b.status as BookingListRow["status"],
    checkIn: r.b.checkIn,
    checkOut: r.b.checkOut,
    nights: r.b.nights,
    currency: r.b.currency,
    grossAmount: Number(r.b.grossAmount),
    cleaningFeeAmount: Number(r.b.cleaningFeeAmount),
    channelFeeAmount: Number(r.b.channelFeeAmount),
    paymentFeeAmount: Number(r.b.paymentFeeAmount),
    netExpectedAmount: n(r.b.netExpectedAmount),
  }));
}

export async function getBookingById(id: string): Promise<WithSource<BookingListRow> | null> {
  const db = getDb();
  if (!db) return fallback.find((b) => b.id === id) ?? null;

  const [r] = await db
    .select({
      b: bookings,
      villaCode: villas.unitCode,
      channelKey: bookingChannels.key,
      channelName: bookingChannels.name,
      guestName: guests.fullName,
    })
    .from(bookings)
    .innerJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!r) return null;
  return {
    source: "db",
    id: r.b.id,
    bookingCode: r.b.bookingCode,
    villaId: r.b.villaId,
    villaCode: r.villaCode,
    guestName: r.guestName ?? "—",
    channelKey: r.channelKey ?? null,
    channelName: r.channelName ?? null,
    status: r.b.status as BookingListRow["status"],
    checkIn: r.b.checkIn,
    checkOut: r.b.checkOut,
    nights: r.b.nights,
    currency: r.b.currency,
    grossAmount: Number(r.b.grossAmount),
    cleaningFeeAmount: Number(r.b.cleaningFeeAmount),
    channelFeeAmount: Number(r.b.channelFeeAmount),
    paymentFeeAmount: Number(r.b.paymentFeeAmount),
    netExpectedAmount: n(r.b.netExpectedAmount),
  };
}
